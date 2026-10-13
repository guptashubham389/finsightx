import { decodeHTML } from "entities";

export type LedgerRow = { date: string; amount: number; direction: "debit" | "credit"; payee: string };
export type ParsedAlert = { row: LedgerRow; reference?: string };
export type MessagePart = { mimeType?: string; body?: { data?: string }; parts?: MessagePart[] };
export type GmailMessage = {
  id: string; snippet?: string; internalDate?: string;
  payload?: MessagePart & { headers?: { name: string; value: string }[] };
};

export function emailHeader(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBody(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(base64), c => c.charCodeAt(0)));
}

export function messageText(message: GmailMessage): string | null {
  const plain: string[] = [], html: string[] = [];
  function visit(part: MessagePart) {
    if (part.body?.data) {
      if (part.mimeType === "text/plain") plain.push(decodeBody(part.body.data));
      if (part.mimeType === "text/html") html.push(decodeBody(part.body.data));
    }
    part.parts?.forEach(visit);
  }
  try {
    if (message.payload) visit(message.payload);
    if (plain.length) return plain.join("\n");
    if (!html.length) return null;
    return decodeHTML(html.join("\n")
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<[^>]*>/g, " "));
  } catch { return null; }
}

function transactionDate(value: string): string | null {
  const match = value.match(/^(\d{1,2})[-\/]([A-Za-z]{3}|\d{1,2})[-\/](\d{4}|\d{2})$/);
  if (!match) return null;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const day = Number(match[1]);
  const month = /^\d+$/.test(match[2]) ? Number(match[2]) : months.indexOf(match[2].toLowerCase()) + 1;
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 2000 || month < 1 || month > 12 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

// Deliberately conservative: all four ledger fields must be explicit in the body.
// Subjects, snippets, arrival dates and balances are never used to fill missing fields.
export function parseAlert(body: string): ParsedAlert | null {
  const text = body.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const debit = /\b(?:debited|debit\s*:|spent|paid)\b|\bdebit\s*:/i.test(text);
  const credit = /\bcredited\b|\bcredit\s*:/i.test(text);
  if (debit === credit) return null;
  if (/\b(?:failed|declined|unsuccessful|reversed|reversal)\b/i.test(text)) return null;
  const direction = debit ? "debit" : "credit";
  const money = "(?:INR|Rs\\.?|₹)\\s*((?:\\d{1,3}(?:,\\d{2})*,\\d{3}|\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{1,2})?)(?![\\d,]|\\.\\d)";
  const candidates: string[] = [];
  for (const expression of [
    new RegExp("\\b(?:debited|credited|spent|paid|debit|credit)\\s*:?\\s*" + money, "gi"),
    new RegExp(money + "\\s+(?:(?:has been|is|was)\\s+)?(?:debited|credited|spent|paid)\\b", "gi"),
    new RegExp("\\b(?:debited|credited)\\s+(?:with|by)\\s+" + money, "gi"),
  ]) for (const match of text.matchAll(expression)) candidates.push(match[1]);
  // One transaction per email; reject even two identical transaction clauses.
  if (candidates.length !== 1) return null;
  const amount = Number(candidates[0].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) return null;
  const dates = [...text.matchAll(/\b(?:on|date)\s*:?\s*(\d{1,2}[-\/](?:[A-Za-z]{3}|\d{1,2})[-\/](?:\d{4}|\d{2}))\b/gi)];
  if (dates.length !== 1) return null;
  const date = transactionDate(dates[0][1]);
  if (!date) return null;
  const stop = "(?=\\s+(?:on\\s*:?\\s*\\d|(?:UPI|transaction|txn)\\s+(?:ref|reference)|(?:Ref|Reference)\\s*(?:No\\.?|number|:)|(?:your|available|avl|balance)\\b)|[.;](?:\\s|$)|$)";
  const payeePatterns = direction === "debit" ? [
    new RegExp("\\bto\\s+VPA\\s*:?\\s*(.+?)" + stop, "i"),
    new RegExp("\\b(?:to|at|towards|payee|merchant)\\s*:\\s*(.+?)" + stop, "i"),
    new RegExp("\\b(?:to|at|towards)\\s+(?!your\\b|(?:a/c|account|acct)\\b)(.+?)" + stop, "i"),
  ] : [
    new RegExp("\\bby\\s+VPA\\s*:?\\s*(.+?)" + stop, "i"),
    new RegExp("\\b(?:from|by|payer|remitter)\\s*:\\s*(.+?)" + stop, "i"),
    new RegExp("\\b(?:by|from)\\s+(?!your\\b|(?:a/c|account|acct)\\b)(.+?)" + stop, "i"),
  ];
  let payee: string | undefined;
  for (const pattern of payeePatterns) { const match = text.match(pattern); if (match) { payee = match[1].trim(); break; } }
  if (!payee || payee.length > 160 || /\b(?:debited|credited|account|balance|click|https?|INR|Rs)\b/i.test(payee) || !/[A-Za-z]/.test(payee)) return null;
  const reference = text.match(/\b(?:UPI\s*(?:transaction\s*)?(?:ref(?:erence)?)(?:\s*(?:no\.?|number))?|UTR)\s*(?:is\s*)?[:#-]?\s*(\d{8,24})\b/i)?.[1];
  return { row: { date, amount, direction, payee }, ...(reference ? { reference } : {}) };
}

export function parseMessage(message: GmailMessage): ParsedAlert | null {
  const from = emailHeader(message, "from").trim();
  if (!/^(?:[^<>]*<)?alerts@hdfcbank\.bank\.in>?$/i.test(from)) return null;
  const body = messageText(message);
  return body ? parseAlert(body) : null;
}
