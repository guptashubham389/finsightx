import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAlert, parseMessage, messageText, type GmailMessage } from "../convex/gmailParser";
import { GMAIL_QUERY, GMAIL_SCOPE, importGmail as actualImportGmail, gmailOwnerEmail } from "../convex/gmailClient";
import { oauthStart, sign, verify } from "../convex/gmailAuth";
import { reportPage } from "../convex/gmailPage";

// Invented fixtures only. These are parser checks, not proof of a real Gmail import.
const debit = "Rs.1,250.50 has been debited from account **1234 to VPA shop.name@upi on 08-10-26. Your UPI transaction reference number is 123456789012.";
const credit = "Dear Customer, INR 25,000.00 is credited to your account **1234 on 01/10/2026 by ACME PAYROLL. UPI Ref No: 123456789013.";
const importGmail = (...args: Parameters<typeof actualImportGmail>) => actualImportGmail(args[0], args[1], args[2], args[3], args[4] ?? { sleep: async () => {}, random: () => 0 });
function message(id: string, body: string, mimeType = "text/plain"): GmailMessage {
  return { id, snippet: `Snippet ${id}`, internalDate: "1791417600000", payload: {
    mimeType, headers: [{ name: "From", value: "HDFC Bank <alerts@hdfcbank.bank.in>" }, { name: "Date", value: "Thu, 08 Oct 2026 12:00:00 +0530" }],
    body: { data: Buffer.from(body).toString("base64url") },
  } };
}

test("parses explicit debit, decimal rupees, payee with a dot and UPI reference", () => {
  assert.deepEqual(parseAlert(debit), { row: { date: "2026-10-08", amount: 1250.5, direction: "debit", payee: "shop.name@upi" }, reference: "123456789012" });
});
test("parses credit with explicit remitter", () => {
  assert.deepEqual(parseAlert(credit), { row: { date: "2026-10-01", amount: 25000, direction: "credit", payee: "ACME PAYROLL" }, reference: "123456789013" });
});
test("parses labelled alerts and Indian digit grouping", () => {
  assert.deepEqual(parseAlert("UPI txn. Debited: INR 1,25,000. On: 09-Oct-2026 To: SHOP MART UPI Ref: 123456789014")?.row,
    { date: "2026-10-09", amount: 125000, direction: "debit", payee: "SHOP MART" });
});
test("skips ambiguity, bad amounts, missing fields, failures and impossible dates", () => {
  for (const body of [
    "An alert without a transaction", debit.replace("08-10-26", "31-02-26"),
    debit.replace("Rs.1,250.50", "Rs.1,250.555"), debit.replace("Rs.1,250.50", "Rs.1,25.00"),
    debit.replace(" to VPA shop.name@upi", ""), debit.replace(" on 08-10-26", ""),
    `${debit} INR 100 credited on 09-10-26 by Someone.`, `${debit} ${debit}`,
    debit.replace("1,250.50", "0"), `${debit} Transaction failed.`,
    "INR 100 credited to your account on 08-10-26. Balance INR 2000.",
    "Debit: INR 100 On: 08-10-26 To: 123456",
  ]) assert.equal(parseAlert(body), null, body);
});
test("decodes multipart UTF-8 and HTML entities without relying on subject or snippet", () => {
  const html = message("html", "<style>ignore me</style><p>Debit: INR 100 On: 08-10-26 To: Caf&eacute; &amp; Co.</p>", "text/html");
  assert.equal(parseMessage(html)?.row.payee, "Café & Co");
  const multipart = message("multi", debit);
  multipart.payload = { headers: multipart.payload!.headers, mimeType: "multipart/alternative", parts: [
    { mimeType: "text/plain", body: { data: Buffer.from(debit).toString("base64url") } },
    { mimeType: "text/html", body: { data: Buffer.from(`<p>${debit}</p>`).toString("base64url") } },
  ] };
  assert.equal(parseMessage(multipart)?.row.amount, 1250.5);
  const noBody = message("empty", ""); noBody.snippet = debit;
  noBody.payload!.headers!.push({ name: "Subject", value: debit });
  assert.equal(parseMessage(noBody), null);
  const invalid = message("invalid", debit); invalid.payload!.body!.data = "!!!";
  assert.equal(messageText(invalid), null);
});
test("ignores a different sender", () => {
  const wrong = message("wrong", debit);
  wrong.payload!.headers![0].value = "alerts@hdfcbank.bank.in.evil.test";
  assert.equal(parseMessage(wrong), null);
});

test("pages through all Gmail results, gets each email, counts skips and caps proof at five", async () => {
  const calls: URL[] = [];
  const fixtures: Record<string, GmailMessage> = { skip: message("skip", "OTP 123456") };
  for (let i = 1; i <= 7; i++) fixtures[String(i)] = message(String(i), debit.replace("123456789012", `12345678901${i}`));
  const saved: any[] = [];
  const request: typeof fetch = async input => {
    const url = new URL(String(input)); calls.push(url);
    if (url.pathname.endsWith("/messages")) {
      assert.equal(url.searchParams.get("q"), GMAIL_QUERY);
      return Response.json(url.searchParams.get("pageToken") === "next" ? {
        messages: ["4", "5", "6", "7"].map(id => ({ id })),
      } : { messages: ["1", "2", "3", "skip"].map(id => ({ id })), nextPageToken: "next", resultSizeEstimate: 999 });
    }
    assert.equal(url.searchParams.get("format"), "full");
    return Response.json(fixtures[url.pathname.split("/").pop()!]);
  };
  const report = await importGmail("fake-test-token", async key => `hash:${key}`, async rows => { saved.push(...rows); return rows.length; }, request);
  assert.equal(report.totalEmailsFound, 8); assert.equal(report.rowsParsed, 7); assert.equal(report.rowsSkipped, 1);
  assert.equal(report.rowsInserted, 7); assert.equal(report.first5ParsedRows.length, 5);
  assert.equal(report.first5ParsedRows[0].snippet, "Snippet 1");
  assert.equal(calls.filter(u => !u.pathname.endsWith("/messages")).length, 8);
  assert.deepEqual(Object.keys(saved[0]).sort(), ["amount", "date", "direction", "payee", "sourceKey"]);
  assert.equal(JSON.stringify(saved).includes("Snippet"), false);
});
test("reimports do not add duplicate transactions; reports parsed separately from inserted", async () => {
  const keys = new Set<string>();
  const request: typeof fetch = async input => new URL(String(input)).pathname.endsWith("/messages")
    ? Response.json({ messages: [{ id: "one" }, { id: "two" }] })
    : Response.json(message(new URL(String(input)).pathname.split("/").pop()!, debit));
  const save = async (rows: { sourceKey: string }[]) => { let count = 0; for (const row of rows) if (!keys.has(row.sourceKey)) { keys.add(row.sourceKey); count++; } return count; };
  const first = await importGmail("test", async key => key, save, request);
  const second = await importGmail("test", async key => key, save, request);
  assert.equal(first.rowsParsed, 2); assert.equal(first.rowsInserted, 1); assert.equal(first.duplicateRowsNotInserted, 1);
  assert.equal(second.rowsInserted, 0); assert.equal(second.duplicateRowsNotInserted, 2);
});
test("empty mailbox is a successful zero-count report", async () => {
  const report = await importGmail("test", async key => key, async () => { throw Error("must not save"); }, async () => Response.json({}));
  assert.equal(report.totalEmailsFound, 0); assert.equal(report.rowsParsed, 0); assert.equal(report.rowsSkipped, 0);
});
test("Gmail errors stop import rather than being counted as unparseable", async () => {
  await assert.rejects(() => importGmail("test", async key => key, async () => 0,
    async () => new Response("private body must not appear", { status: 401 })), /Gmail email listing failed \(HTTP 401; reason: not supplied\)/);
});
test("disabled Gmail API errors show the setup fix without leaking Google messages or metadata", async () => {
  await assert.rejects(() => gmailOwnerEmail("private-token", async () => Response.json({ error: {
    message: "PRIVATE MESSAGE CONTAINING CREDENTIALS", errors: [{ reason: "accessNotConfigured" }],
    details: [{ reason: "SERVICE_DISABLED", metadata: { consumer: "PRIVATE PROJECT", secret: "PRIVATE SECRET" } }],
  } }, { status: 403 })), (error: Error) => {
    assert.match(error.message, /Gmail account lookup failed \(HTTP 403; reason: accessNotConfigured, SERVICE_DISABLED\)/);
    assert.match(error.message, /Enable the Gmail API in the same Google Cloud project/);
    assert.equal(error.message.includes("PRIVATE"), false); assert.equal(error.message.includes("private-token"), false);
    return true;
  });
});
test("permission and Workspace restrictions get different fixes", async () => {
  for (const [reason, expected] of [["ACCESS_TOKEN_SCOPE_INSUFFICIENT", /No additional permission is needed/], ["domainPolicy", /administrator has blocked/]] as const) {
    await assert.rejects(() => gmailOwnerEmail("test", async () => Response.json({ error: { details: [{ reason }] } }, { status: 403 })), expected);
  }
});
test("unknown Google error reasons are never echoed to the screen", async () => {
  await assert.rejects(() => gmailOwnerEmail("test", async () => Response.json({ error: { errors: [{ reason: "PRIVATE UNKNOWN ERROR" }] } }, { status: 403 })), (error: Error) => {
    assert.match(error.message, /reason: not supplied/); assert.equal(error.message.includes("PRIVATE"), false); return true;
  });
});
test("transient 403 request limits are retried before the import fails", async () => {
  let calls = 0;
  const email = await gmailOwnerEmail("test", async () => ++calls === 1
    ? Response.json({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }, { status: 403 })
    : Response.json({ emailAddress: "test@example.com" }), { sleep: async () => {}, random: () => 0 });
  assert.equal(calls, 2); assert.equal(email, "test@example.com");
});
test("repeated email rate limits recover with increasing delays, one request at a time", async () => {
  const delays: number[] = [], order: string[] = [];
  let active = 0, maxActive = 0, firstAttempts = 0;
  const request: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/messages")) return Response.json({ messages: [{ id: "one" }, { id: "two" }] });
    active++; maxActive = Math.max(maxActive, active);
    const id = url.pathname.split("/").pop()!; order.push(id);
    await Promise.resolve(); active--;
    if (id === "one" && ++firstAttempts <= 3) return Response.json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, { status: 403 });
    return Response.json(message(id, debit.replace("123456789012", id === "one" ? "123456789014" : "123456789015")));
  };
  const report = await importGmail("test", async key => key, async rows => rows.length, request,
    { sleep: async milliseconds => { delays.push(milliseconds); }, random: () => 0 });
  assert.deepEqual(order, ["one", "one", "one", "one", "two"]);
  assert.deepEqual(delays, [500, 2000, 4000, 8000, 500]);
  assert.equal(maxActive, 1); assert.equal(report.rowsParsed, 2); assert.equal(report.rowsSkipped, 0);
});
test("server Retry-After is respected and persistent throttling stops after six attempts", async () => {
  const delays: number[] = [];
  let calls = 0;
  await assert.rejects(() => gmailOwnerEmail("test", async () => {
    calls++; return Response.json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, { status: 403, headers: { "Retry-After": "10" } });
  }, { sleep: async milliseconds => { delays.push(milliseconds); }, random: () => 0 }), /reason: rateLimitExceeded/);
  assert.equal(calls, 6);
  assert.deepEqual(delays, [10000, 10000, 10000, 16000, 30000, 2000]);
});
test("account identity uses the already granted Gmail scope", async () => {
  assert.equal(await gmailOwnerEmail("test", async input => {
    assert.equal(String(input), "https://gmail.googleapis.com/gmail/v1/users/me/profile");
    return Response.json({ emailAddress: "User@Example.com" });
  }), "user@example.com");
});
test("OAuth requests exactly readonly, excludes existing scopes and protects state with a signature and PKCE", async () => {
  const { url, state } = await oauthStart("test-client", "test-secret", "https://example.convex.site");
  const params = new URL(url).searchParams;
  assert.equal(params.get("scope"), GMAIL_SCOPE);
  assert.equal(params.get("include_granted_scopes"), "false");
  assert.equal(params.get("redirect_uri"), "https://example.convex.site/gmail/callback");
  assert.equal(params.get("code_challenge_method"), "S256");
  assert.equal(params.get("access_type"), "online");
  assert.equal((await verify("test-secret", state))?.purpose, "gmail-oauth");
  assert.equal(await verify("wrong-secret", state), null);
  assert.equal(await verify("test-secret", `${state}tampered`), null);
  assert.equal(await verify("test-secret", await sign("test-secret", { purpose: "gmail-oauth", expires: Date.now() - 100 })), null);
});
test("proof HTML escapes snippets and payees and preserves exact JSON output", () => {
  const report = { query: GMAIL_QUERY, totalEmailsFound: 1, rowsParsed: 1, rowsSkipped: 0, rowsInserted: 1, duplicateRowsNotInserted: 0,
    first5ParsedRows: [{ emailDate: "today", snippet: '<script>alert("bad")</script>', row: { date: "2026-10-08", amount: 10, direction: "debit" as const, payee: "<img src=x>" } }] };
  const html = reportPage(report);
  assert.equal(html.includes('<script>alert("bad")</script>'), false);
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('id="import-output"'));
});
