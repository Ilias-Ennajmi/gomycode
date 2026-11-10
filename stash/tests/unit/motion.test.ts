import { describe, expect, it } from "vitest";
import { parseDuration, tokenMs } from "@/lib/motionTokens";
import { morphName } from "@/lib/morph";

describe("motion tokens", () => {
  it("parses CSS durations", () => {
    expect(parseDuration("150ms")).toBe(150);
    expect(parseDuration(" 0.35s ")).toBe(350);
    expect(parseDuration("0ms")).toBe(0);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("fast")).toBeNull();
  });

  it("falls back to the token values on the server", () => {
    expect(tokenMs("--dur-screen")).toBe(250);
    expect(tokenMs("--dur-sheet")).toBe(350);
  });

  it("view-transition names are valid CSS identifiers", () => {
    expect(morphName("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("save-0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(morphName("a b\"c")).toBe("save-abc");
  });
});
