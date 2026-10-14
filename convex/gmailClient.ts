import { emailHeader, messageText, parseMessage, type GmailMessage, type LedgerRow } from "./gmailParser";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_QUERY = "from:alerts@hdfcbank.bank.in newer_than:6m UPI";
export type StoredRow = LedgerRow & { sourceKey: string };
export type GmailTiming = { sleep?: (milliseconds: number) => Promise<void>; random?: () => number };
const sleep = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
export type ImportReport = {
  query: string; totalEmailsFound: number; rowsParsed: number; rowsSkipped: number;
  rowsInserted: number; duplicateRowsNotInserted: number;
  first5ParsedRows: { emailDate: string; alertText: string; row: LedgerRow }[];
};

const ERROR_REASONS = new Set([
  "accessNotConfigured", "SERVICE_DISABLED", "insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
  "domainPolicy", "ORG_RESTRICTION_VIOLATION", "rateLimitExceeded", "userRateLimitExceeded",
  "dailyLimitExceeded", "quotaExceeded", "backendError", "authError", "forbidden", "failedPrecondition",
]);

async function safeErrorReasons(response: Response): Promise<string[]> {
  try {
    const body = await response.json();
    const reasons = [...(Array.isArray(body?.error?.errors) ? body.error.errors : []),
      ...(Array.isArray(body?.error?.details) ? body.error.details : [])]
      .map(item => item?.reason).filter(reason => typeof reason === "string" && ERROR_REASONS.has(reason));
    // Only recognized reason codes leave this function. No Google messages or metadata.
    return [...new Set<string>(reasons)];
  } catch { return []; }
}

function errorMessage(status: number, operation: string, reasons: string[]): string {
  const prefix = `Gmail ${operation} failed (HTTP ${status}; reason: ${reasons.join(", ") || "not supplied"}).`;
  if (reasons.some(reason => ["accessNotConfigured", "SERVICE_DISABLED"].includes(reason))) {
    return `${prefix} Enable the Gmail API in the same Google Cloud project that owns your OAuth client. Wait a few minutes, then connect Gmail again.`;
  }
  if (reasons.some(reason => ["insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"].includes(reason))) {
    return `${prefix} Google rejected the Gmail read-only permission. Remove FinSightX from your Google account connections, then reconnect and approve Gmail read-only access. No additional permission is needed.`;
  }
  if (reasons.some(reason => ["domainPolicy", "ORG_RESTRICTION_VIOLATION"].includes(reason))) {
    return `${prefix} Your Google Workspace administrator has blocked this Gmail connection. Ask your administrator to allow FinSightX.`;
  }
  if (reasons.some(reason => ["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded", "quotaExceeded"].includes(reason))) {
    return `${prefix} Google’s request limit was reached. Wait before reconnecting; already saved rows will not be duplicated.`;
  }
  if (status === 401) return `${prefix} Gmail access expired or was revoked. Connect Gmail again.`;
  return `${prefix} Google blocked this request. Check that the Gmail API is enabled for your OAuth client’s project and that your account permits Gmail access. Already saved rows will not be duplicated.`;
}

async function googleJson(url: URL, token: string, request: typeof fetch, operation: string, timing: GmailTiming = {}): Promise<any> {
  const pause = timing.sleep ?? sleep;
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await request(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) return response.json();
    const reasons = await safeErrorReasons(response);
    const rateLimited = response.status === 403 && reasons.some(reason => ["rateLimitExceeded", "userRateLimitExceeded"].includes(reason));
    if ((response.status === 429 || response.status >= 500 || rateLimited) && attempt < 5) {
      const retryAfter = response.headers.get("Retry-After");
      const requestedDelay = retryAfter === null ? 0 : /^\d+$/.test(retryAfter)
        ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now());
      const backoff = 2000 * 2 ** attempt + Math.floor((timing.random ?? Math.random)() * 250);
      const delay = Math.max(backoff, Number.isFinite(requestedDelay) ? requestedDelay : 0);
      // A long server-requested cooldown needs a fresh connection later, not an early retry.
      if (delay > 60_000) throw new Error(errorMessage(response.status, operation, reasons));
      for (let remaining = delay; remaining > 0; remaining -= 30_000) await pause(Math.min(remaining, 30_000));
      continue;
    }
    // Never include the response body, token or request URL in errors/logs.
    throw new Error(errorMessage(response.status, operation, reasons));
  }
  throw new Error("Gmail request failed. Please reconnect.");
}

export async function gmailOwnerEmail(token: string, request: typeof fetch = fetch, timing: GmailTiming = {}): Promise<string> {
  const profile = await googleJson(new URL("https://gmail.googleapis.com/gmail/v1/users/me/profile"), token, request, "account lookup", timing);
  if (typeof profile.emailAddress !== "string" || !profile.emailAddress.includes("@")) throw new Error("Gmail did not return an account identity.");
  return profile.emailAddress.toLowerCase();
}

export async function importGmail(
  token: string,
  sourceKey: (value: string) => Promise<string>,
  save: (rows: StoredRow[]) => Promise<number>,
  request: typeof fetch = fetch,
  timing: GmailTiming = {},
): Promise<ImportReport> {
  const ids = new Set<string>();
  const pages = new Set<string>();
  let pageToken: string | undefined;
  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("q", GMAIL_QUERY);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    if (pageToken) await (timing.sleep ?? sleep)(500);
    const page = await googleJson(url, token, request, "email listing", timing);
    for (const message of page.messages ?? []) {
      if (typeof message.id !== "string") throw new Error("Gmail returned an invalid message list.");
      ids.add(message.id);
    }
    pageToken = page.nextPageToken;
    if (pageToken) {
      if (pages.has(pageToken)) throw new Error("Gmail repeated a pagination token. Import stopped; reconnect to retry.");
      pages.add(pageToken);
    }
  } while (pageToken);
  const report: ImportReport = {
    query: GMAIL_QUERY, totalEmailsFound: ids.size, rowsParsed: 0, rowsSkipped: 0,
    rowsInserted: 0, duplicateRowsNotInserted: 0, first5ParsedRows: [],
  };
  const orderedIds = [...ids];
  // Fetch serially, at most two emails a second. Keep small ledger writes, but
  // never start another Gmail request while the previous request is backing off.
  for (let offset = 0; offset < orderedIds.length; offset += 5) {
    const messages: GmailMessage[] = [];
    for (const id of orderedIds.slice(offset, offset + 5)) {
      await (timing.sleep ?? sleep)(500);
      const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
      url.searchParams.set("format", "full");
      messages.push(await googleJson(url, token, request, "email fetch", timing));
    }
    const rows: StoredRow[] = [];
    for (const message of messages) {
      const alertText = messageText(message);
      const parsed = alertText && /\bUPI\b/i.test(alertText) ? parseMessage(message) : null;
      if (!parsed) { report.rowsSkipped++; continue; }
      report.rowsParsed++;
      // UPI reference prevents two separate alert emails counting the same transaction twice.
      const identity = parsed.reference
        ? `upi:${parsed.reference}:${parsed.row.date}:${parsed.row.direction}:${parsed.row.amount}`
        : `message:${message.id}`;
      rows.push({ ...parsed.row, sourceKey: await sourceKey(identity) });
      if (report.first5ParsedRows.length < 5) {
        report.first5ParsedRows.push({
          emailDate: emailHeader(message, "date") || (message.internalDate && Number.isFinite(Number(message.internalDate))
            ? new Date(Number(message.internalDate)).toISOString() : "Not supplied by Gmail"),
          alertText: alertText!, row: parsed.row,
        });
      }
    }
    if (rows.length) report.rowsInserted += await save(rows);
  }
  report.duplicateRowsNotInserted = report.rowsParsed - report.rowsInserted;
  return report;
}
