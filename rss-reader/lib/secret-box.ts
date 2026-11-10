import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Secrets the reader pastes in (Readwise and Notion tokens) are encrypted before they go in
// the database: AES-256-GCM with a key made from AUTH_SECRET (and the app password), which
// only exist in the server's environment. Someone reading the database alone gets nothing
// usable. Changing either makes the stored secrets unreadable, which reads as "not
// connected": paste the token again.

const PREFIX = "enc:v1:";

function key() {
  const material = `${process.env.AUTH_SECRET ?? ""}:${process.env.APP_PASSWORD ?? ""}`;
  return createHash("sha256").update(`reader-secret-box:${material}`).digest();
}

export function seal(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

/** The secret back, or null when it can't be read (another key, or tampered with). */
export function open(sealed: string): string | null {
  if (!sealed.startsWith(PREFIX)) return null;
  const [iv, tag, data] = sealed
    .slice(PREFIX.length)
    .split(".")
    .map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function isSealed(value: string) {
  return value.startsWith(PREFIX);
}
