import { GMAIL_SCOPE } from "./gmailClient";

const encoder = new TextEncoder();
function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
async function key(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
export async function hmac(secret: string, value: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(value))));
}
export async function sign(secret: string, payload: object): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}
export async function verify(secret: string, signed: string): Promise<{ purpose: string; expires: number; nonce?: string; owner?: string } | null> {
  try {
    const [body, signature, extra] = signed.split(".");
    if (!body || !signature || extra) return null;
    if (!await crypto.subtle.verify("HMAC", await key(secret), bytes(signature), encoder.encode(body))) return null;
    const payload = JSON.parse(new TextDecoder().decode(bytes(body)));
    if (typeof payload.expires !== "number" || payload.expires <= Date.now()) return null;
    return payload;
  } catch { return null; }
}
export function cookie(request: Request, name: string): string {
  return (request.headers.get("cookie") ?? "").split(";").map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}
export function setCookie(name: string, value: string, seconds: number): string {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
}
export async function oauthStart(clientId: string, secret: string, site: string) {
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = await sign(secret, { purpose: "gmail-oauth", nonce, expires: Date.now() + 10 * 60 * 1000 });
  const verifier = await hmac(secret, `pkce:${state}`);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(verifier))));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: `${site}/gmail/callback`, response_type: "code",
    scope: GMAIL_SCOPE, state, access_type: "online", include_granted_scopes: "false",
    prompt: "consent select_account", code_challenge: challenge, code_challenge_method: "S256",
  }).toString();
  return { url: url.toString(), state };
}
