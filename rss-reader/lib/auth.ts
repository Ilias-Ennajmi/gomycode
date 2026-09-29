// Runs in both the Edge runtime (middleware) and Node (route handlers), so it
// only uses Web Crypto.

export const SESSION_COOKIE = "rss_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isAuthConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

// Keyed on the password too, so changing APP_PASSWORD signs everyone out.
async function signingKey(): Promise<CryptoKey> {
  const material = `${process.env.APP_PASSWORD ?? ""}:${process.env.AUTH_SECRET ?? ""}`;
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(material),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function sign(value: string): Promise<string> {
  return base64url(await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(value)));
}

async function digest(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

/** Compares two strings without leaking where they differ. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  const expires = String(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  return `${expires}.${await sign(expires)}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature || Number(expires) < Date.now()) return false;
  return safeEqual(signature, await sign(expires));
}

export async function verifyPassword(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(candidate, expected);
}
