// Recovery codes (contract 0007 §4.3). The derivation lives here and nowhere else: the app never
// derives anything, and the code itself is stored nowhere.

export const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
export const CODE_LENGTH = 20; // 20 x 5 bits = 100 random bits
// Synthetic addresses nobody can receive mail at. Restore reads the stored email, so this can change.
export const EMAIL_DOMAIN = "recovery.stash.invalid";

const enc = new TextEncoder();
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 20 alphabet characters from 100 bits of `crypto.getRandomValues` (no modulo bias: 32 = 2^5). */
export function generateCode(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(13)); // 104 bits; the top 4 are dropped
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out = ALPHABET[Number(n & 31n)] + out;
    n >>= 5n;
  }
  return out;
}

/** XXXXX-XXXXX-XXXXX-XXXXX */
export const formatCode = (norm: string): string => norm.match(/.{5}/g)!.join("-");

/** Uppercase, letters and digits only, O→0, I→1, L→1. Null unless 20 alphabet characters remain. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 80) return null;
  const norm = input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  if (norm.length !== CODE_LENGTH) return null;
  for (const ch of norm) if (!ALPHABET.includes(ch)) return null;
  return norm;
}

export type Derived = { lookup: string; password: string; email: string };

export async function derive(norm: string): Promise<Derived> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode("stash-recovery/v1/id/" + norm)));
  const lookup = hex(digest).slice(0, 32);
  const key = await crypto.subtle.importKey("raw", enc.encode(norm), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("stash-recovery/v1/password")));
  return { lookup, password: base64url(mac), email: `${lookup}@${EMAIL_DOMAIN}` };
}
