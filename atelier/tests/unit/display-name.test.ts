import { describe, expect, it } from "vitest";
import { sanitiseDisplayName } from "@/lib/share/display-name";

describe("sanitiseDisplayName", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitiseDisplayName("  Jane   Doe ")).toBe("Jane Doe");
    expect(sanitiseDisplayName("Jane\t\n Doe")).toBe("Jane Doe");
    expect(sanitiseDisplayName("a b c")).toBe("a b c");
  });

  it("keeps ordinary names in any script, and emoji", () => {
    for (const n of ["Jane", "José", "李雷", "Åsa-Märta O'Neil", "محمد", "Дмитрий", "Jo 🎨"]) {
      expect(sanitiseDisplayName(n)).toBe(n);
    }
  });

  it("normalises to NFC", () => {
    expect(sanitiseDisplayName("José")).toBe("José");
  });

  it("removes bidi overrides and isolates", () => {
    expect(sanitiseDisplayName("‮evil")).toBe("evil");
    expect(sanitiseDisplayName("a‪b‬c⁦d⁩e‎f‏")).toBe("abcdef");
  });

  it("removes zero-width and other invisible format characters", () => {
    expect(sanitiseDisplayName("Ja​ne‌ Do‍e⁠﻿")).toBe("Jane Doe");
    expect(sanitiseDisplayName("soft­hyphen")).toBe("softhyphen");
  });

  it("removes control characters and NUL", () => {
    expect(sanitiseDisplayName("Ja\u0000ne\u0007\u001b[31m")).toBe("Jane[31m");
    expect(sanitiseDisplayName("a\u0085b")).toBe("a b"); // NEL is whitespace, not dropped silently into "ab"
  });

  it("removes private-use characters and lone surrogates", () => {
    expect(sanitiseDisplayName("ab")).toBe("ab");
    expect(sanitiseDisplayName("a\ud800b")).toBe("ab");
  });

  it("keeps markup verbatim: escaping is the renderer's job", () => {
    expect(sanitiseDisplayName("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
    expect(sanitiseDisplayName('"><img src=x onerror=1>')).toBe('"><img src=x onerror=1>');
  });

  it("caps at 60 characters after cleaning (counted as characters, not UTF-16 units)", () => {
    expect(sanitiseDisplayName("x".repeat(60))).toBe("x".repeat(60));
    expect(sanitiseDisplayName("x".repeat(61))).toBeNull();
    expect(sanitiseDisplayName("😀".repeat(60))).toBe("😀".repeat(60));
    expect(sanitiseDisplayName("😀".repeat(61))).toBeNull();
    // Invisible padding does not count towards the cap.
    expect(sanitiseDisplayName("x".repeat(60) + "​".repeat(20))).toBe("x".repeat(60));
  });

  it("refuses absurdly long raw input without scanning it", () => {
    expect(sanitiseDisplayName("x ".repeat(5000))).toBeNull();
  });

  it("returns null when nothing visible is left", () => {
    for (const empty of ["", " ", "​", "​‍", "‮", "\t\n", "⠀", "ㅤ", "ᅟᅠ", " "]) {
      expect(sanitiseDisplayName(empty)).toBeNull();
    }
  });

  it("returns null for anything that is not a string", () => {
    for (const bad of [123, null, undefined, {}, [], ["Jane"], true, Symbol("x")]) {
      expect(sanitiseDisplayName(bad)).toBeNull();
    }
  });

  it("limits stacked combining marks (zalgo) to 3 per base character", () => {
    const zalgo = "Z" + "̀".repeat(30) + "a";
    const out = sanitiseDisplayName(zalgo)!;
    expect(out).toBe("Z̀̀̀a");
  });
});
