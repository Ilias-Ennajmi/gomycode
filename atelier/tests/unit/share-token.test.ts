import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateToken, hashToken, isPlausibleToken, safeEqual } from "@/lib/share/token";

describe("generateToken", () => {
  it("makes 43-character base64url tokens (32 random bytes)", () => {
    const { token, hash } = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never repeats across 1,000 tokens", () => {
    const seen = new Set<string>();
    const hashes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const { token, hash } = generateToken();
      seen.add(token);
      hashes.add(hash);
    }
    expect(seen.size).toBe(1000);
    expect(hashes.size).toBe(1000);
  });

  it("returns the SHA-256 hex of the token, and the token itself is not the hash", () => {
    const { token, hash } = generateToken();
    expect(hash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
  });
});

describe("hashToken", () => {
  it("is plain SHA-256 hex of the UTF-8 string", () => {
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("accepts any string and never throws", () => {
    for (const s of ["", " ", "\u0000", "\ud800", "é".repeat(10_000), "💥", "x".repeat(1_000_000)]) {
      expect(hashToken(s)).toMatch(/^[0-9a-f]{64}$/);
    }
    // Not a string at runtime (a malformed request): still no throw, still a hash.
    expect(hashToken(undefined as unknown as string)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(null as unknown as string)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isPlausibleToken", () => {
  it("accepts exactly 43 base64url characters", () => {
    expect(isPlausibleToken("A".repeat(43))).toBe(true);
    expect(isPlausibleToken(generateToken().token)).toBe(true);
    expect(isPlausibleToken("a-_Z9".padEnd(43, "0"))).toBe(true);
  });

  it("rejects the wrong length, other characters, and non-strings", () => {
    expect(isPlausibleToken("A".repeat(42))).toBe(false);
    expect(isPlausibleToken("A".repeat(44))).toBe(false);
    expect(isPlausibleToken("")).toBe(false);
    for (const bad of ["+", "/", "=", " ", "\n", "é", "."]) {
      expect(isPlausibleToken("A".repeat(42) + bad)).toBe(false);
    }
    expect(isPlausibleToken("A".repeat(43) + "\n")).toBe(false); // `$` must not match before a trailing newline
    expect(isPlausibleToken(undefined as unknown as string)).toBe(false);
    expect(isPlausibleToken(42 as unknown as string)).toBe(false);
  });
});

describe("safeEqual (constant-time string comparison)", () => {
  it("compares equal and unequal strings, of any lengths, without throwing", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("", "a")).toBe(false);
    expect(safeEqual("é", "é")).toBe(true);
    expect(safeEqual("a".repeat(100_000), "a".repeat(100_000))).toBe(true);
    expect(safeEqual(undefined as unknown as string, "a")).toBe(false);
  });
});
