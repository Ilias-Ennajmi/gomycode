import { act, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaPlaybackBridge } from "@/components/chrome/MediaPlaybackBridge";
import { getPlaybackStore, resetPlaybackStore } from "@/lib/engine/media/playback-store";
import { makeEditor, obj } from "./helpers/editor";

const AID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";

beforeEach(() => resetPlaybackStore());
afterEach(() => cleanup());

function mount() {
  const t = makeEditor([obj("video", "v", { assetId: AID }), obj("video", "w", { assetId: AID, x: 500 })]);
  t.render(<MediaPlaybackBridge />);
  return t;
}

describe("MediaPlaybackBridge", () => {
  it("keeps the store's idea of what is selected in step with the canvas", () => {
    const t = mount();
    const store = getPlaybackStore();
    expect(store.isSelected("v")).toBe(false);
    act(() => t.selection.set(["v"]));
    expect(store.isSelected("v")).toBe(true);
    act(() => t.selection.set(["w"]));
    expect(store.isSelected("v")).toBe(false);
    expect(store.isSelected("w")).toBe(true);
  });

  it("Escape sends every live video back to its poster (and leaves the key to the canvas)", () => {
    mount();
    const store = getPlaybackStore();
    act(() => {
      store.activate("v");
      store.activate("w");
    });
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    act(() => void document.body.dispatchEvent(ev));
    expect(store.activeIds()).toEqual([]);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("a video that is deleted gives its playback slot back", () => {
    const t = mount();
    const store = getPlaybackStore();
    act(() => store.activate("v"));
    act(() => t.doc.remove(["v"]));
    expect(store.state("v")).toBe("off");
    expect(store.activeIds()).toEqual([]);
  });

  it("leaving the board stops everything", () => {
    const t = mount();
    const store = getPlaybackStore();
    act(() => store.activate("v"));
    cleanup();
    expect(store.activeIds()).toEqual([]);
    void t;
    void fireEvent;
  });
});
