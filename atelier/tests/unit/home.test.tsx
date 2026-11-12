import { describe, expect, it } from "vitest";

// The home screen itself is covered in home-app.test.tsx. This keeps the jsdom project honest:
// IndexedDB must exist for every offline test.
describe("jsdom project", () => {
  it("has IndexedDB available", () => {
    expect(typeof indexedDB.open).toBe("function");
  });
});
