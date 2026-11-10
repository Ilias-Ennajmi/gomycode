import { describe, expect, it } from "vitest";
import { SPRINGS, parseDuration, spring, tokenMs } from "@/lib/motionTokens";
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
    expect(tokenMs("--dur-press")).toBe(120);
    expect(tokenMs("--dur-screen")).toBe(260);
    expect(tokenMs("--dur-sheet")).toBe(380);
  });

  it("springs collapse to an instant change with reduce motion", () => {
    expect(spring("sheet", true)).toBe(SPRINGS.sheet);
    for (const name of Object.keys(SPRINGS) as (keyof typeof SPRINGS)[]) {
      expect(spring(name, false)).toEqual({ duration: 0 });
    }
  });

  it("fallbacks match the duration tokens in tokens.css", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");
    for (const name of ["--dur-press", "--dur-fast", "--dur-screen", "--dur-sheet"] as const) {
      const m = new RegExp(`${name}:\\s*(\\d+)ms`).exec(css);
      expect(Number(m?.[1]), name).toBe(tokenMs(name));
    }
  });

  it("view-transition names are valid CSS identifiers", () => {
    expect(morphName("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe("save-0f8fad5b-d9cb-469f-a165-70867728950e");
    expect(morphName("a b\"c")).toBe("save-abc");
  });
});
