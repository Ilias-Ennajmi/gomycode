import { describe, expect, it } from "vitest";
import {
  badCharacters,
  codeHint,
  extractCode,
  formatCode,
  isValidCode,
  normalizeCode,
  recoveryError,
  recoveryErrorText,
  recoveryLink,
} from "@/lib/recoveryCode";
import { isPublicPath } from "@/lib/supabase/session";

const CODE = "4F7QK-2M9XA-0TB3R-H8ZNC";

describe("recovery code: tidy and check", () => {
  it("normalises the way the function does (uppercase, O→0, I/L→1, punctuation dropped)", () => {
    expect(normalizeCode(" 4f7qk 2m9xa-0tb3r_h8znc ")).toBe("4F7QK2M9XA0TB3RH8ZNC");
    expect(normalizeCode("OIL0o1il")).toBe("01100111");
  });

  it("accepts exactly 20 Crockford characters", () => {
    expect(isValidCode(CODE)).toBe(true);
    expect(isValidCode("4f7qk2m9xa0tb3rh8znc")).toBe(true);
    expect(isValidCode("4F7QK-2M9XA-0TB3R-H8ZN")).toBe(false); // 19
    expect(isValidCode(`${CODE}9`)).toBe(false); // 21
    expect(isValidCode("4F7QK-2M9XA-0TB3R-H8ZNU")).toBe(false); // U is not in the alphabet
    expect(isValidCode("")).toBe(false);
  });

  it("treats the look-alikes a person might type as the same code", () => {
    expect(isValidCode("OOOOO-IIIII-LLLLL-00000")).toBe(true);
    expect(formatCode("ooooo iiiii lllll 00000")).toBe("00000-11111-11111-00000");
  });

  it("formats in groups of five, also while typing", () => {
    expect(formatCode("4f7qk2m9xa0tb3rh8znc")).toBe(CODE);
    expect(formatCode("4f7qk2m")).toBe("4F7QK-2M");
    expect(formatCode("4f7qk")).toBe("4F7QK");
    expect(formatCode("")).toBe("");
    expect(formatCode(`${CODE}EXTRA`)).toBe(CODE);
  });

  it("gives a precise hint while typing", () => {
    expect(codeHint("")).toBeNull();
    expect(codeHint("4F7QK")).toBe("15 more to go.");
    expect(codeHint("4F7QU")).toMatch(/never contains U/);
    expect(badCharacters("uU4")).toEqual(["U"]);
    expect(codeHint(`${CODE}99`)).toMatch(/too long/);
    expect(codeHint(CODE)).toBeNull();
  });
});

describe("recovery code: QR and links", () => {
  it("puts the code after the # so it never reaches the server", () => {
    const link = recoveryLink("https://stash.example/", CODE);
    expect(link).toBe(`https://stash.example/restore#${CODE}`);
    expect(new URL(link).pathname).toBe("/restore");
    expect(new URL(link).search).toBe("");
    // The restore page never creates an identity of its own.
    expect(isPublicPath("/restore")).toBe(true);
  });

  it("reads the code back from a scanned link, a bare code or a sentence", () => {
    expect(extractCode(`https://stash.example/restore#${CODE}`)).toBe(CODE);
    expect(extractCode(CODE.toLowerCase())).toBe(CODE);
    expect(extractCode("4F7QK2M9XA0TB3RH8ZNC")).toBe(CODE);
    expect(extractCode(`my code is ${CODE}, keep it safe`)).toBe(CODE);
    expect(extractCode("https://stash.example/restore#")).toBeNull();
    expect(extractCode("https://example.com/some/page")).toBeNull();
    expect(extractCode(null)).toBeNull();
  });
});

describe("recovery errors", () => {
  it("maps the function's answers", () => {
    expect(recoveryError(400, "invalid_code")).toBe("invalid_code");
    expect(recoveryError(404, "not_found")).toBe("not_found");
    expect(recoveryError(429, "rate_limited")).toBe("rate_limited");
    expect(recoveryError(401, "unauthorized")).toBe("unauthorized");
    expect(recoveryError(429, null)).toBe("rate_limited");
    // A 404 without the function's own body: the function is not deployed.
    expect(recoveryError(404, null)).toBe("unavailable");
    expect(recoveryError(null, null)).toBe("offline");
    expect(recoveryError(500, "boom")).toBe("failed");
  });

  it("explains rate limits differently for making and restoring", () => {
    expect(recoveryErrorText("rate_limited", "create")).toMatch(/5 codes today/);
    expect(recoveryErrorText("rate_limited", "restore")).toMatch(/Wait an hour/);
    expect(recoveryErrorText("not_found", "restore")).toMatch(/No Stash matches/);
    expect(recoveryErrorText("pending_saves", "restore")).toMatch(/haven't been sent/);
    for (const e of ["offline", "unavailable", "failed"] as const) expect(recoveryErrorText(e, "restore")).toMatch(/Nothing was changed/);
  });
});
