import { argon2id } from "hash-wasm";
import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX,
  PASSWORD_MIN,
  ARGON2_PARAMS,
  passwordHasher,
  validatePassword,
  verifyDummy,
} from "@/lib/share/password";

describe("passwordHasher (argon2id via hash-wasm)", () => {
  it("returns a PHC string with the documented parameters", async () => {
    const encoded = await passwordHasher.hash("correct horse");
    const { m, t, p } = ARGON2_PARAMS;
    expect(encoded.startsWith(`$argon2id$v=19$m=${m},t=${t},p=${p}$`)).toBe(true);
    expect(ARGON2_PARAMS.m).toBeLessThanOrEqual(65536); // memory cap: 64 MiB
    expect(encoded).not.toContain("correct horse");
  });

  it("salts: two hashes of one password differ, and both verify", async () => {
    const a = await passwordHasher.hash("same password");
    const b = await passwordHasher.hash("same password");
    expect(a).not.toBe(b);
    expect(await passwordHasher.verify("same password", a)).toBe(true);
    expect(await passwordHasher.verify("same password", b)).toBe(true);
  });

  it("verifies right and wrong passwords", async () => {
    const encoded = await passwordHasher.hash("hunter2!");
    expect(await passwordHasher.verify("hunter2!", encoded)).toBe(true);
    expect(await passwordHasher.verify("hunter2", encoded)).toBe(false);
    expect(await passwordHasher.verify("", encoded)).toBe(false);
    expect(await passwordHasher.verify("HUNTER2!", encoded)).toBe(false);
  });

  it("handles non-ASCII passwords", async () => {
    const encoded = await passwordHasher.hash("pässwörd 🔐 密码");
    expect(await passwordHasher.verify("pässwörd 🔐 密码", encoded)).toBe(true);
    expect(await passwordHasher.verify("passwörd 🔐 密码", encoded)).toBe(false);
  });

  it("resolves false (never throws) for a garbage or truncated encoded hash", async () => {
    for (const bad of ["", "nope", "$argon2id$", "$argon2id$v=19$m=1,t=1,p=1$abc$def", "$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234", "\u0000"]) {
      await expect(passwordHasher.verify("x", bad)).resolves.toBe(false);
    }
    const good = await passwordHasher.hash("abcd");
    await expect(passwordHasher.verify("abcd", good.slice(0, -4))).resolves.toBe(false);
    await expect(passwordHasher.verify(undefined as unknown as string, good)).resolves.toBe(false);
    await expect(passwordHasher.verify("abcd", undefined as unknown as string)).resolves.toBe(false);
  });

  it("refuses to spend the memory on oversized passwords", async () => {
    const encoded = await passwordHasher.hash("abcd");
    expect(await passwordHasher.verify("x".repeat(PASSWORD_MAX + 1), encoded)).toBe(false);
    expect(await passwordHasher.verify("x".repeat(1_000_000), encoded)).toBe(false);
    await expect(passwordHasher.hash("x".repeat(PASSWORD_MAX + 1))).rejects.toThrow();
    // Even a CORRECT oversized password is refused (the length guard runs before any hashing).
    const long = "y".repeat(PASSWORD_MAX + 1);
    const forged = await argon2id({ password: long, salt: new Uint8Array(16).fill(7), parallelism: 1, iterations: 1, memorySize: 8, hashLength: 32, outputType: "encoded" });
    expect(await passwordHasher.verify(long, forged)).toBe(false);
  });

  it("hashes in well under a second and a half (generous CI bound)", async () => {
    const t0 = performance.now();
    await passwordHasher.hash("timing check");
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe("verifyDummy", () => {
  it("always resolves false (equalises the cost of a link with no password / an unknown link)", async () => {
    await expect(verifyDummy("anything")).resolves.toBe(false);
    await expect(verifyDummy("")).resolves.toBe(false);
  });
});

describe("validatePassword", () => {
  it("accepts 4 to 128 characters", () => {
    expect(PASSWORD_MIN).toBe(4);
    expect(PASSWORD_MAX).toBe(128);
    expect(validatePassword("abcd")).toEqual({ ok: true });
    expect(validatePassword("x".repeat(128))).toEqual({ ok: true });
    expect(validatePassword("pass phrase with spaces")).toEqual({ ok: true });
  });

  it("rejects too short, too long and non-strings, with a message", () => {
    for (const bad of ["abc", "", "x".repeat(129), 1234, null, undefined, {}]) {
      const r = validatePassword(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(5);
    }
    const long = validatePassword("x".repeat(129));
    expect(long.ok === false && long.message).toContain("128");
  });
});
