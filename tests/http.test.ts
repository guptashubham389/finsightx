import { test } from "node:test";
import assert from "node:assert/strict";
import http from "../convex/http";
import { GMAIL_SCOPE } from "../convex/gmailClient";
import { oauthStart, verify } from "../convex/gmailAuth";
import { decodeHTML } from "entities";

const site = "https://example.convex.site";
const secret = "invented-test-secret";
process.env.GOOGLE_CLIENT_ID = "invented-test-client";
process.env.GOOGLE_CLIENT_SECRET = secret;
process.env.CONVEX_SITE_URL = site;
const route = (path: string) => (http.lookup(path, "GET")![0] as any)._handler;

test("callback requires browser state before contacting Google", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw Error("must not contact Google"); };
  try {
    const { state } = await oauthStart("test-client", secret, site);
    const response = await route("/gmail/callback")({}, new Request(`${site}/gmail/callback?state=${state}&code=test`));
    assert.equal(response.status, 400);
    assert.ok((await response.text()).includes("could not be verified"));
  } finally { globalThis.fetch = original; }
});

test("callback imports, saves only parsed rows, and returns exact temporary proof", async () => {
  const original = globalThis.fetch;
  const writes: any[] = [];
  const { state } = await oauthStart("test-client", secret, site);
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") {
      const body = init!.body as URLSearchParams;
      assert.equal(body.get("redirect_uri"), `${site}/gmail/callback`);
      assert.ok(body.get("code_verifier"));
      return Response.json({ access_token: "invented-token", scope: GMAIL_SCOPE });
    }
    if (url.pathname.endsWith("/profile")) return Response.json({ emailAddress: "invented@example.com" });
    if (url.pathname.endsWith("/messages")) return Response.json({ messages: [{ id: "invented-id" }] });
    return Response.json({ id: "invented-id", snippet: "Invented comparison snippet", payload: {
      mimeType: "text/plain", headers: [{ name: "From", value: "alerts@hdfcbank.bank.in" }, { name: "Date", value: "Thu, 08 Oct 2026 12:00:00 +0530" }, { name: "Subject", value: "PRIVATE SUBJECT MUST NOT BE SAVED" }],
      body: { data: Buffer.from("INR 100 debited from account **1234 on 08-10-26 to TEST SHOP.").toString("base64url") },
    } });
  };
  try {
    const response = await route("/gmail/callback")({ runMutation: async (_fn: any, args: any) => { writes.push(args); return args.rows.length; } },
      new Request(`${site}/gmail/callback?state=${state}&code=invented`, { headers: { cookie: `__Host-finsightx_oauth=${state}` } }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store, max-age=0");
    const html = await response.text();
    const proof = JSON.parse(decodeHTML(html.match(/<pre id="import-output">([\s\S]*?)<\/pre>/)![1]));
    assert.equal(proof.totalEmailsFound, 1); assert.equal(proof.rowsParsed, 1); assert.equal(proof.rowsSkipped, 0);
    assert.equal(proof.first5ParsedRows[0].snippet, "Invented comparison snippet");
    assert.deepEqual(proof.first5ParsedRows[0].row, { date: "2026-10-08", amount: 100, direction: "debit", payee: "TEST SHOP" });
    const persisted = JSON.stringify(writes);
    for (const forbidden of ["PRIVATE SUBJECT", "snippet", "invented-token", "invented@example.com", "**1234", "headers", "body"]) assert.equal(persisted.includes(forbidden), false);
    assert.deepEqual(Object.keys(writes[0].rows[0]).sort(), ["amount", "date", "direction", "payee", "sourceKey"]);
    const sessionCookie = response.headers.get("set-cookie")!.match(/__Host-finsightx_session=([^;]+)/)![1];
    const session = await verify(secret, sessionCookie);
    assert.equal(session!.owner, writes[0].owner);
    assert.equal(session!.purpose, "ledger-session");
  } finally { globalThis.fetch = original; }
});

test("callback rejects extra scopes before reading any email", async () => {
  const original = globalThis.fetch;
  const { state } = await oauthStart("test-client", secret, site);
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ access_token: "test-token", scope: `${GMAIL_SCOPE} openid` }); };
  try {
    const response = await route("/gmail/callback")({}, new Request(`${site}/gmail/callback?state=${state}&code=test`, { headers: { cookie: `__Host-finsightx_oauth=${state}` } }));
    assert.equal(response.status, 400); assert.equal(calls, 1);
    assert.ok((await response.text()).includes("exactly Gmail read-only"));
  } finally { globalThis.fetch = original; }
});

test("saved ledger requires a valid signed account session", async () => {
  const response = await route("/gmail/ledger")({}, new Request(`${site}/gmail/ledger`, { headers: { cookie: "__Host-finsightx_session=forged" } }));
  assert.equal(response.status, 401);
});

test("callback displays Google's safe 403 reason and setup fix without saving anything", async () => {
  const original = globalThis.fetch;
  const { state } = await oauthStart("test-client", secret, site);
  globalThis.fetch = async input => String(input).includes("oauth2.googleapis.com")
    ? Response.json({ access_token: "invented-token", scope: GMAIL_SCOPE })
    : Response.json({ error: { message: "PRIVATE GOOGLE MESSAGE", details: [{ reason: "SERVICE_DISABLED", metadata: { secret: "PRIVATE SECRET" } }] } }, { status: 403 });
  try {
    const response = await route("/gmail/callback")({ runMutation: async () => { throw Error("must not save"); } },
      new Request(`${site}/gmail/callback?state=${state}&code=invented`, { headers: { cookie: `__Host-finsightx_oauth=${state}` } }));
    assert.equal(response.status, 503);
    const html = await response.text();
    assert.ok(html.includes("HTTP 403; reason: SERVICE_DISABLED"));
    assert.ok(html.includes("Enable the Gmail API in the same Google Cloud project"));
    assert.equal(html.includes("PRIVATE"), false);
    assert.equal(html.includes("invented-token"), false);
  } finally { globalThis.fetch = original; }
});
