import { describe, expect, it } from "vitest";
import { assetBaseFromEnv } from "@/lib/server/viewer-board";

describe("assetBaseFromEnv", () => {
  it("is https plus the public host, tolerating a scheme and slashes", () => {
    expect(assetBaseFromEnv({ NEXT_PUBLIC_R2_PUBLIC_HOST: "assets.example.com" })).toBe("https://assets.example.com");
    expect(assetBaseFromEnv({ R2_PUBLIC_HOST: "https://pub-abc.r2.dev/" })).toBe("https://pub-abc.r2.dev");
    expect(assetBaseFromEnv({ NEXT_PUBLIC_R2_PUBLIC_HOST: "a.example.com", R2_PUBLIC_HOST: "b.example.com" })).toBe("https://a.example.com");
  });
  it("is empty when unset or not a host", () => {
    expect(assetBaseFromEnv({})).toBe("");
    expect(assetBaseFromEnv({ R2_PUBLIC_HOST: "evil.com/path?x" })).toBe("");
    expect(assetBaseFromEnv({ R2_PUBLIC_HOST: "javascript:alert(1)" })).toBe("");
    expect(assetBaseFromEnv({ R2_PUBLIC_HOST: "a b" })).toBe("");
  });
});
