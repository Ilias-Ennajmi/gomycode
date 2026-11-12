import { describe, expect, it, vi } from "vitest";
import { PlaybackBudget } from "@/lib/engine/media/playback-budget";
import { PlaybackStore } from "@/lib/engine/media/playback-store";

describe("PlaybackBudget", () => {
  it("grants a slot while there is room", () => {
    const b = new PlaybackBudget(3);
    expect(b.request("a")).toBe(true);
    expect(b.request("b")).toBe(true);
    expect(b.active()).toEqual(["a", "b"]);
  });

  it("evicts the least recently requested id when a 4th is requested, and says which", () => {
    const evicted: string[] = [];
    const b = new PlaybackBudget(3, (id) => evicted.push(id));
    for (const id of ["a", "b", "c"]) b.request(id);
    expect(b.request("d")).toBe(true);
    expect(evicted).toEqual(["a"]);
    expect(b.active()).toEqual(["b", "c", "d"]);
  });

  it("re-requesting an active id refreshes its recency without evicting anyone", () => {
    const onEvict = vi.fn();
    const b = new PlaybackBudget(3, onEvict);
    for (const id of ["a", "b", "c"]) b.request(id);
    b.request("a"); // a is now the most recent; b is the oldest
    expect(onEvict).not.toHaveBeenCalled();
    b.request("d");
    expect(onEvict).toHaveBeenCalledWith("b");
    expect(b.active()).toEqual(["c", "a", "d"]);
  });

  it("release frees a slot, and releasing an unknown id is a no-op", () => {
    const onEvict = vi.fn();
    const b = new PlaybackBudget(2, onEvict);
    b.request("a");
    b.request("b");
    b.release("a");
    b.release("zzz");
    b.request("c");
    expect(onEvict).not.toHaveBeenCalled();
    expect(b.active()).toEqual(["b", "c"]);
  });

  it("never holds more than max, however many are requested", () => {
    const b = new PlaybackBudget(3);
    for (let i = 0; i < 50; i++) b.request(`g${i}`);
    expect(b.active()).toHaveLength(3);
    expect(b.active()).toEqual(["g47", "g48", "g49"]);
  });

  it("defaults to 3 and treats a nonsense max as 1", () => {
    const d = new PlaybackBudget();
    for (let i = 0; i < 5; i++) d.request(`x${i}`);
    expect(d.active()).toHaveLength(3);
    const z = new PlaybackBudget(0);
    z.request("a");
    z.request("b");
    expect(z.active()).toEqual(["b"]);
  });
});

describe("PlaybackStore", () => {
  it("is off until activated; activation plays; the 4th activation evicts the oldest", () => {
    const s = new PlaybackStore(3);
    expect(s.state("a")).toBe("off");
    s.activate("a");
    expect(s.state("a")).toBe("playing");
    for (const id of ["b", "c", "d"]) s.activate(id);
    expect(s.state("a")).toBe("off");
    expect(["b", "c", "d"].map((i) => s.state(i))).toEqual(["playing", "playing", "playing"]);
  });

  it("20 GIFs activated one after the other never leave more than 3 animated", () => {
    const s = new PlaybackStore(3);
    for (let i = 0; i < 20; i++) {
      s.activate(`gif${i}`);
      expect(s.activeIds().length).toBeLessThanOrEqual(3);
    }
    expect(s.activeIds()).toEqual(["gif17", "gif18", "gif19"]);
  });

  it("toggle: first press plays, the next pauses, the next plays again", () => {
    const s = new PlaybackStore(3);
    s.toggle("a");
    expect(s.state("a")).toBe("playing");
    s.toggle("a");
    expect(s.state("a")).toBe("paused");
    s.toggle("a");
    expect(s.state("a")).toBe("playing");
  });

  it("deactivate returns to the poster and frees the slot; subscribers hear every change", () => {
    const s = new PlaybackStore(3);
    const cb = vi.fn();
    const off = s.subscribe(cb);
    s.activate("a");
    s.deactivate("a");
    expect(s.state("a")).toBe("off");
    expect(s.activeIds()).toEqual([]);
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    s.activate("a");
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("remembers which videos are selected and the element of an active one", () => {
    const s = new PlaybackStore(3);
    s.setSelected(["a", "b"]);
    expect(s.isSelected("a")).toBe(true);
    expect(s.isSelected("z")).toBe(false);
    const el = {} as HTMLVideoElement;
    s.attach("a", el);
    expect(s.element("a")).toBe(el);
    s.attach("a", null);
    expect(s.element("a")).toBeNull();
  });
});
