import { describe, expect, it, vi } from "vitest";
import { TextureCache } from "@/lib/engine/render/texture-cache";

describe("TextureCache", () => {
  it("evicts least recently used first", () => {
    const c = new TextureCache<string>(250);
    c.set("a", "A", 100);
    c.set("b", "B", 100);
    c.set("c", "C", 100);
    c.get("a"); // a is now the freshest; b is the oldest
    expect(c.evict()).toEqual(["b"]);
    expect(c.bytes).toBe(200);
    expect(c.has("b")).toBe(false);
    expect(c.has("a")).toBe(true);
  });

  it("skips keys marked in use, even when over budget", () => {
    const c = new TextureCache<string>(100);
    c.set("a", "A", 100);
    c.set("b", "B", 100);
    c.set("c", "C", 100);
    c.markInUse(new Set(["a", "b"]));
    expect(c.evict()).toEqual(["c"]);
    expect(c.bytes).toBe(200); // still over budget: what is on screen stays
    c.markInUse(new Set(["b"]));
    expect(c.evict()).toEqual(["a"]);
    expect(c.has("b")).toBe(true);
  });

  it("ends within budget after evict() when nothing is in use", () => {
    const c = new TextureCache<number>(1000);
    for (let i = 0; i < 50; i++) c.set(`k${i}`, i, 100);
    c.evict();
    expect(c.bytes).toBeLessThanOrEqual(1000);
    expect(c.size).toBe(10);
    expect(c.has("k49")).toBe(true); // the newest survive
    expect(c.has("k0")).toBe(false);
  });

  it("does nothing under budget", () => {
    const c = new TextureCache<string>(1000);
    c.set("a", "A", 10);
    expect(c.evict()).toEqual([]);
  });

  it("tells the owner about every texture that leaves, so it can be destroyed", () => {
    const gone = vi.fn();
    const c = new TextureCache<string>(100, gone);
    c.set("a", "A", 80);
    c.set("b", "B", 80);
    c.evict();
    expect(gone).toHaveBeenCalledWith("a", "A");
    c.set("b", "B2", 80); // replaced
    expect(gone).toHaveBeenCalledWith("b", "B");
    c.clear();
    expect(gone).toHaveBeenCalledWith("b", "B2");
    expect(c.size).toBe(0);
    expect(c.bytes).toBe(0);
  });

  it("copes with a replaced entry and nonsense sizes", () => {
    const c = new TextureCache<string>(100);
    c.set("a", "A", 60);
    c.set("a", "A", 40);
    expect(c.bytes).toBe(40);
    c.set("b", "B", NaN);
    expect(c.bytes).toBe(40);
  });
});
