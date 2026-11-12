import { argon2Verify, argon2id } from "hash-wasm";
import { randomBytes } from "node:crypto";

/**
 * Share-link passwords: argon2id through hash-wasm (MIT). It is WebAssembly embedded in the JS bundle, so there is no native
 * binary to break a Vercel build and nothing to read from disk; it runs in the Node runtime (and in Vitest) unchanged.
 *
 * Parameters (hash-wasm takes memory in KiB): m = 65,536 KiB (64 MiB), t = 2, p = 1, 16-byte salt, 32-byte tag, PHC string.
 * That is above the OWASP floor (19 MiB / t=2 / p=1) and measured at about 150 ms on a 2020s x86 core (see docs/DEPENDENCIES.md);
 * the work is synchronous WASM, so requests are naturally processed one at a time per instance, which also bounds memory.
 * Verification reads the parameters from the stored string, so raising them later does not lock out old hashes.
 *
 * Nothing here logs, and no error message contains the password or the hash.
 */

export const PASSWORD_MIN = 4;
export const PASSWORD_MAX = 128;

export const ARGON2_PARAMS = { m: 65536, t: 2, p: 1, saltBytes: 16, hashBytes: 32 } as const;

export interface PasswordHasher {
  hash(pw: string): Promise<string>;
  verify(pw: string, encoded: string): Promise<boolean>;
}

export type PasswordCheck = { ok: true } | { ok: false; message: string };

/** Rules for a password the owner sets on a link. Messages are for the owner's UI. */
export function validatePassword(pw: unknown): PasswordCheck {
  if (typeof pw !== "string") return { ok: false, message: "Enter a password." };
  if (pw.length < PASSWORD_MIN) return { ok: false, message: `Use at least ${PASSWORD_MIN} characters.` };
  if (pw.length > PASSWORD_MAX) return { ok: false, message: `Use at most ${PASSWORD_MAX} characters.` };
  return { ok: true };
}

const MAX_ENCODED = 512;

export const passwordHasher: PasswordHasher = {
  async hash(pw) {
    const check = validatePassword(pw);
    if (!check.ok) throw new RangeError(check.message);
    return argon2id({
      password: pw,
      salt: randomBytes(ARGON2_PARAMS.saltBytes),
      parallelism: ARGON2_PARAMS.p,
      iterations: ARGON2_PARAMS.t,
      memorySize: ARGON2_PARAMS.m,
      hashLength: ARGON2_PARAMS.hashBytes,
      outputType: "encoded",
    });
  },

  /** True only for a correct password. Anything malformed (a bad hash, an oversized or non-string password) is simply false. */
  async verify(pw, encoded) {
    if (typeof pw !== "string" || pw.length > PASSWORD_MAX) return false; // never spend 64 MiB on a megabyte "password"
    if (typeof encoded !== "string" || encoded.length === 0 || encoded.length > MAX_ENCODED) return false;
    try {
      return await argon2Verify({ password: pw, hash: encoded });
    } catch {
      return false;
    }
  },
};

let dummy: Promise<string> | undefined;

/**
 * Spends the same time as a real verification and always answers false. For a link with no password, or an unknown link,
 * so response time does not tell a visitor which case they hit.
 */
export async function verifyDummy(pw: string): Promise<false> {
  dummy ??= passwordHasher.hash("not-a-real-password");
  await passwordHasher.verify(pw, await dummy);
  return false;
}
