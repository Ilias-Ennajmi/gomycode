import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContextBar } from "@/components/chrome/ContextBar";
import { EditorProvider } from "@/components/editor/EditorContext";
import { getPlaybackStore, resetPlaybackStore } from "@/lib/engine/media/playback-store";
import type { VideoObj } from "@/lib/engine/model/types";
import { makeEditor, obj } from "./helpers/editor";

const AID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";

beforeEach(() => resetPlaybackStore());
afterEach(() => cleanup());

const bar = () => screen.getByRole("toolbar", { name: "Selection" });
const btn = (name: string | RegExp) => within(bar()).getByRole("button", { name });
const maybe = (name: string | RegExp) => within(bar()).queryByRole("button", { name });

function mount(extra: Record<string, unknown> = {}, withUploader = false) {
  const t = makeEditor([obj("video", "v", { assetId: AID, x: 100, y: 200, loop: false, ...extra })]);
  t.selection.set(["v"]);
  if (withUploader) {
    const uploader = { add: vi.fn(async () => "x"), addAssetOnly: vi.fn(async () => "a") };
    render(
      <EditorProvider handle={t.handle} uploader={uploader as never} toast={() => {}}>
        <ContextBar />
      </EditorProvider>,
    );
  } else {
    t.render(<ContextBar />);
  }
  return t;
}
const v = (t: ReturnType<typeof makeEditor>) => t.doc.get("v") as VideoObj;

describe("selection bar for a video", () => {
  it("has named, keyboard-reachable controls: play, mute, loop", () => {
    mount();
    for (const name of ["Play video", "Mute", "Loop"]) expect(btn(name).getAttribute("aria-label") ?? btn(name).textContent).toBeTruthy();
    expect(btn("Mute").getAttribute("aria-pressed")).toBe("true"); // muted by default
    expect(btn("Loop").getAttribute("aria-pressed")).toBe("false");
  });

  it("Play starts playback in the store, the label becomes Pause, and Pause pauses", () => {
    mount();
    fireEvent.click(btn("Play video"));
    expect(getPlaybackStore().state("v")).toBe("playing");
    fireEvent.click(btn("Pause video"));
    expect(getPlaybackStore().state("v")).toBe("paused");
    expect(maybe("Play video")).not.toBeNull();
  });

  it("Mute and Loop toggle the object, each as an undo step, and show their state", () => {
    const t = mount();
    fireEvent.click(btn("Mute"));
    expect(v(t).muted).toBe(false);
    act(() => void new Promise((r) => setTimeout(r, 20)));
    fireEvent.click(btn("Loop"));
    expect(v(t).loop).toBe(true);
    t.doc.undo();
    expect(v(t).loop).toBe(false);
    t.doc.undo();
    expect(v(t).muted).toBe(true);
  });

  it("has no frame buttons without an uploader; with one they are there but wait for a live video", () => {
    mount();
    expect(maybe("Use this frame as the poster")).toBeNull();
    expect(maybe("Grab frame as image")).toBeNull();
    cleanup();
    resetPlaybackStore();
    const t = mount({}, true);
    // The provider publishes its UI hooks after its first render; selecting again lets the bar read them.
    act(() => {
      t.selection.clear();
      t.selection.set(["v"]);
    });
    const poster = btn("Use this frame as the poster");
    expect(poster.getAttribute("aria-disabled")).toBe("true");
    expect(btn("Grab frame as image").getAttribute("aria-disabled")).toBe("true");
    act(() => {
      getPlaybackStore().activate("v", { play: false });
      getPlaybackStore().attach("v", { currentTime: 2, duration: 10, addEventListener() {}, removeEventListener() {} } as unknown as HTMLVideoElement);
    });
    expect(btn("Use this frame as the poster").getAttribute("aria-disabled")).toBe("false");
  });

  it("a seek slider appears while the video is live and moves the playhead", () => {
    const t = mount();
    expect(screen.queryByRole("slider", { name: "Seek" })).toBeNull();
    const el = { currentTime: 2, duration: 10, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as HTMLVideoElement;
    act(() => {
      getPlaybackStore().activate("v", { play: false });
      getPlaybackStore().attach("v", el);
    });
    const slider = screen.getByRole("slider", { name: "Seek" }) as HTMLInputElement;
    expect(slider.max).toBe("10");
    fireEvent.change(slider, { target: { value: "6.5" } });
    expect(el.currentTime).toBe(6.5);
    void t;
  });

  it("a GIF gets Play and Pause only (no mute, loop or frame tools)", () => {
    mount({ kind: "gif" });
    expect(maybe("Play GIF")).not.toBeNull();
    expect(maybe("Mute")).toBeNull();
    expect(maybe("Loop")).toBeNull();
    fireEvent.click(btn("Play GIF"));
    expect(maybe("Pause GIF")).not.toBeNull();
  });

  it("a locked video can still be played but not changed", () => {
    const t = mount({ locked: true });
    expect(maybe("Play video")).not.toBeNull();
    expect(maybe("Mute")).toBeNull();
    void t;
  });
});
