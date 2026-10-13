import { httpRouter } from "convex/server";
import { type ActionCtx, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { GMAIL_SCOPE, gmailOwnerEmail, importGmail } from "./gmailClient";
import { cookie, hmac, oauthStart, setCookie, sign, verify } from "./gmailAuth";
import { escapeHtml, home, ledgerPage, page, reportPage } from "./gmailPage";

import { dashboard, salaryScreen, transactionScreen, today } from "./screens";
import { validDate } from "./finance";
import { spending, salaryCycle } from "./spending";

const http = httpRouter();
const STATE_COOKIE = "__Host-finsightx_oauth";
const SESSION_COOKIE = "__Host-finsightx_session";
function response(body: string, status = 200, extra?: Headers) {
  const headers = new Headers(extra);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return new Response(body, { status, headers });
}
function configuration() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const site = process.env.CONVEX_SITE_URL?.replace(/\/$/, "");
  if (!clientId || !secret || !site) throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the Convex environment before connecting Gmail.");
  return { clientId, secret, site };
}
async function owner(request: Request): Promise<string | null> {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) return null;
  const payload = await verify(secret, cookie(request, SESSION_COOKIE));
  return payload?.purpose === "ledger-session" && typeof payload.owner === "string" ? payload.owner : null;
}
function errorPage(message: string, status = 400, headers?: Headers) {
  return response(page(`<section><h2>Import stopped</h2><p class="error">${escapeHtml(message)}</p><p>We could not connect to your Gmail.</p><p><a class="button" href="/gmail/start">Try again</a></p><p><a href="/">Back to Connect Gmail</a></p></section>`), status, headers);
}

async function financialData(ctx: ActionCtx, accountOwner: string) {
  const data = await ctx.runQuery(internal.finance.read, { owner: accountOwner, since: "0000-01-01" });
  if (!data.salary) return { ...data, currentRows: data.rows };
  const cycle = salaryCycle(data.salary.date, today());
  // Always load the current salary period even if older history exceeds the display limit.
  const current = await ctx.runQuery(internal.finance.read, { owner: accountOwner, since: cycle.start });
  return { ...data, currentRows: current.rows, more: current.more };
}
function redirect(location: string) { return response("", 303, new Headers({ Location: location })); }
http.route({ path: "/", method: "GET", handler: httpAction(async (ctx, request) => {
  const accountOwner = await owner(request);
  if (!accountOwner) return response(home(Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), false));
  const data = await financialData(ctx, accountOwner);
  if (!data.salary) return redirect("/salary");
  const allRows = [...new Map([...data.rows, ...data.currentRows].map(r => [r.sourceKey, r])).values()];
  return response(dashboard(data.salary, allRows, new URL(request.url).searchParams, today(), data.more));
}) });
for (const path of ["/salary", "/transaction"]) {
  http.route({ path, method: "GET", handler: httpAction(async (ctx, request) => {
    const accountOwner = await owner(request);
    if (!accountOwner) return redirect("/");
    const csrf = await hmac(process.env.GOOGLE_CLIENT_SECRET!, `form:${cookie(request, SESSION_COOKIE)}`);
    if (path === "/transaction") return response(transactionScreen(csrf));
    const data = await financialData(ctx, accountOwner);
    return response(salaryScreen(csrf, {}, data.salary ? { amount: String(data.salary.amount), date: data.salary.date } : {}));
  }) });
  http.route({ path, method: "POST", handler: httpAction(async (ctx, request) => {
    const accountOwner = await owner(request);
    if (!accountOwner) return errorPage("Connect Gmail in this browser to save your personal ledger.", 401);
    const form = await request.formData();
    if ([...form.values()].some(value => typeof value !== "string")) return errorPage("Please enter text in the form fields.");
    const values = Object.fromEntries(form) as Record<string,string>;
    const csrf = await hmac(process.env.GOOGLE_CLIENT_SECRET!, `form:${cookie(request, SESSION_COOKIE)}`);
    if (values.csrf !== csrf || (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)) return errorPage("This form expired. Open it again and retry.", 403);
    const errors: Record<string,string> = {};
    const amount = Number(values.amount);
    if (!(amount > 0) || !Number.isFinite(amount)) errors.amount = path === "/salary" ? "Enter the salary amount" : "Enter the amount";
    if (!validDate(values.date || "")) errors.date = path === "/salary" ? "Enter the salary date" : "Enter the date";
    if (path === "/transaction") {
      if (!values.payee?.trim() || values.payee.length > 200) errors.payee = "Enter the payee";
      if (values.kind !== "spent" && values.kind !== "upcoming") return errorPage("Choose Spent or Upcoming.");
      if (values.kind === "spent" && validDate(values.date || "") && values.date > today()) errors.date = "For a future date, choose Upcoming";
      if (values.kind === "upcoming" && validDate(values.date || "") && values.date < today()) errors.date = "For a past date, choose Spent";
      if ((values.note?.length || 0) > 500) return errorPage("Keep your note under 500 characters.");
    }
    if (Object.keys(errors).length) return response(path === "/salary" ? salaryScreen(csrf, errors, values) : transactionScreen(csrf, errors, values, values.key), 400);
    try {
      if (path === "/salary") {
        await ctx.runMutation(internal.finance.salary, { owner: accountOwner, amount, date: values.date });
        return redirect("/?notice=salary");
      }
      const data = await financialData(ctx, accountOwner);
      if (!data.salary) return redirect("/salary");
      const old = spending(data.salary, data.currentRows, today()).available;
      const inserted = await ctx.runMutation(internal.finance.transaction, { owner: accountOwner, amount, date: values.date, payee: values.payee, kind: values.kind as "spent" | "upcoming", note: values.note || "", sourceKey: `manual:${values.key || crypto.randomUUID()}` });
      return redirect(`/?notice=${inserted ? "saved" : "duplicate"}&old=${old}`);
    } catch { return errorPage("Your changes could not be saved. Please go back and try again.", 503); }
  }) });
}

http.route({ path: "/gmail/start", method: "GET", handler: httpAction(async () => {
  try {
    const { clientId, secret, site } = configuration();
    const start = await oauthStart(clientId, secret, site);
    const headers = new Headers({ Location: start.url });
    headers.append("Set-Cookie", setCookie(STATE_COOKIE, start.state, 600));
    return response("", 302, headers);
  } catch { return errorPage("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the Convex environment before connecting Gmail.", 503); }
}) });

http.route({ path: "/gmail/callback", method: "GET", handler: httpAction(async (ctx, request) => {
  const headers = new Headers();
  headers.append("Set-Cookie", setCookie(STATE_COOKIE, "", 0));
  try {
    const { clientId, secret, site } = configuration();
    const url = new URL(request.url);
    const state = url.searchParams.get("state") ?? "";
    const payload = await verify(secret, state);
    if (!state || state !== cookie(request, STATE_COOKIE) || payload?.purpose !== "gmail-oauth") {
      return errorPage("The connection link expired or could not be verified. Start again from Connect Gmail.", 400, headers);
    }
    if (url.searchParams.has("error")) return errorPage("Gmail permission was not granted. No emails were imported.", 400, headers);
    const code = url.searchParams.get("code");
    if (!code) return errorPage("Google did not return a connection code. Please reconnect.", 400, headers);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: secret,
        redirect_uri: `${site}/gmail/callback`, grant_type: "authorization_code",
        code_verifier: await hmac(secret, `pkce:${state}`) }),
    });
    if (!tokenResponse.ok) return errorPage("Google could not complete the connection. Check the redirect URL and reconnect.", 400, headers);
    const token = await tokenResponse.json();
    const scopes = typeof token.scope === "string" ? token.scope.trim().split(/\s+/) : [];
    if (scopes.length !== 1 || scopes[0] !== GMAIL_SCOPE || typeof token.access_token !== "string") {
      return errorPage("Google did not grant exactly Gmail read-only access. No emails were imported. Remove the app’s old Google permissions and reconnect.", 400, headers);
    }
    const email = await gmailOwnerEmail(token.access_token);
    const accountOwner = await hmac(secret, `owner:${email}`);
    const report = await importGmail(token.access_token,
      value => hmac(secret, `source:${accountOwner}:${value}`),
      rows => ctx.runMutation(internal.ledger.save, { owner: accountOwner, rows }));
    const session = await sign(secret, { purpose: "ledger-session", owner: accountOwner, expires: Date.now() + 30 * 24 * 60 * 60 * 1000 });
    headers.append("Set-Cookie", setCookie(SESSION_COOKIE, session, 30 * 24 * 60 * 60));
    return response(reportPage(report), 200, headers);
  } catch (error) {
    // Only our own generic messages are returned; never log Google data or errors.
    const message = error instanceof Error && (error.message.startsWith("Gmail ") || error.message.startsWith("Set GOOGLE_CLIENT_ID"))
      ? error.message : "The import could not finish. Please reconnect; already saved rows will not be duplicated.";
    // Cloudflare replaces 502 bodies with its own error page. Preserve our guidance.
    return errorPage(message, 503, headers);
  }
}) });

http.route({ path: "/gmail/ledger", method: "GET", handler: httpAction(async (ctx, request) => {
  const accountOwner = await owner(request);
  if (!accountOwner) return errorPage("Connect Gmail in this browser to view your saved ledger.", 401);
  try {
    const result = await ctx.runQuery(internal.ledger.read, { owner: accountOwner, cursor: new URL(request.url).searchParams.get("cursor") });
    return response(ledgerPage(result.page, result.isDone ? null : result.continueCursor));
  } catch { return errorPage("This ledger page could not be loaded. Open the saved ledger again.", 400); }
}) });

export default http;
