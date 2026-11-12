import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/server/next-path";

describe("safeNextPath", () => {
  it("keeps same-site paths, including query and hash", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/b/abc")).toBe("/b/abc");
    expect(safeNextPath("/b/abc?frame=2#x")).toBe("/b/abc?frame=2#x");
  });

  it("falls back to / for anything that could leave the site", () => {
    for (const bad of [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "b/abc",
      "",
      "/\nhttps://evil.example",
    ]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });

  it("falls back to / for missing or non-string values", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath(["/a", "/b"])).toBe("/");
  });

  it("never sends a signed-in person back to the login pages", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login/verify?next=%2F")).toBe("/");
  });
});
