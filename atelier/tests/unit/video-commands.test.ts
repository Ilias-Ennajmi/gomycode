import { beforeEach, describe, expect, it, vi } from "vitest";

const capture = vi.fn();
vi.mock("@/lib/assets/video", async (orig) => ({ ...(await orig<typeof import("@/lib/assets/video")>()), captureVideoFrame: (...a: unknown[]) => capture(...a) }));

import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { SelectionStore } from "@/lib/engine/input/selection-store";
import { registry, type CommandCtx } from "@/lib/engine/commands/registry";
import "@/lib/engine/commands/commands";
import { getPlaybackStore, resetPlaybackStore } from "@/lib/engine/media/playback-store";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject, VideoObj } from "@/lib/engine/model/types";

const AID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const PID = "7a1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const frame = () => new Blob(["frame"], { type: "image/webp" });

function setup(over: Partial<VideoObj> = {}, ui: Partial<NonNullable<CommandCtx["ui"]>> = {}) {
  const doc = new BoardDoc();
  doc.create({ ...defaultsFor("video"), id: "v", assetId: AID, x: 100, y: 50, w: 320, h: 180, ...over } as NewObject);
  doc.stopCapturing();
  const selection = new SelectionStore();
  selection.set(["v"]);
  const toasts: string[] = [];
  const ctx: CommandCtx = {
    doc,
    selection,
    canvas: { getCamera: () => ({ x: 0, y: 0, z: 1 }), viewport: () => ({ w: 1000, h: 800 }) } as never,
    setTool: () => {},
    toast: (o) => void toasts.push(o.message),
    clipboardStyle: { current: null },
    ui,
  };
  return { doc, selection, ctx, toasts };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const video = (doc: BoardDoc) => doc.get("v") as VideoObj;

beforeEach(() => {
  resetPlaybackStore();
  capture.mockReset();
  capture.mockResolvedValue(frame());
});

describe("insert.video", () => {
  it("is an insert command that opens the picker, available only when the app provides one", () => {
    expect(registry.get("insert.video").group).toBe("insert");
    const without = setup();
    expect(registry.available("insert.video", without.ctx)).toBe(false);
    const pick = vi.fn();
    const withUi = setup({}, { pickVideos: pick });
    expect(registry.run("insert.video", withUi.ctx)).toBe(true);
    expect(pick).toHaveBeenCalledTimes(1);
  });
});

describe("video.play", () => {
  it("plays, pauses and resumes the selected video", () => {
    const { ctx } = setup();
    const store = getPlaybackStore();
    registry.run("video.play", ctx);
    expect(store.state("v")).toBe("playing");
    registry.run("video.play", ctx);
    expect(store.state("v")).toBe("paused");
  });
  it("needs exactly one video selected", () => {
    const { ctx, doc, selection } = setup();
    doc.create({ ...defaultsFor("video"), id: "w", assetId: AID } as NewObject);
    selection.set(["v", "w"]);
    expect(registry.available("video.play", ctx)).toBe(false);
    selection.set([]);
    expect(registry.available("video.play", ctx)).toBe(false);
  });
});

describe("video.toggleLoop and video.toggleMute", () => {
  it("flip the setting as one undo step", () => {
    const { ctx, doc } = setup({ loop: false, muted: true });
    registry.run("video.toggleLoop", ctx);
    expect(video(doc).loop).toBe(true);
    registry.run("video.toggleMute", ctx);
    expect(video(doc).muted).toBe(false);
    doc.undo();
    expect(video(doc).muted).toBe(true);
    expect(video(doc).loop).toBe(true);
    doc.undo();
    expect(video(doc).loop).toBe(false);
  });
  it("do nothing to a locked video", () => {
    const { ctx, doc } = setup({ locked: true, loop: false });
    expect(registry.available("video.toggleLoop", ctx)).toBe(false);
    expect(video(doc).loop).toBe(false);
  });
});

describe("video.setPoster", () => {
  it("captures the current frame of the live video and sets posterAssetId in one undo step", async () => {
    const addAssetFile = vi.fn(async () => PID);
    const { ctx, doc } = setup({}, { addAssetFile });
    getPlaybackStore().activate("v", { play: false });
    getPlaybackStore().attach("v", { currentTime: 4.25, videoWidth: 640, videoHeight: 360 } as HTMLVideoElement);
    registry.run("video.setPoster", ctx);
    await flush();
    expect(capture).toHaveBeenCalledTimes(1);
    expect(addAssetFile).toHaveBeenCalledTimes(1);
    expect(video(doc).posterAssetId).toBe(PID);
    expect(video(doc).posterTime).toBeCloseTo(4.25);
    const before = doc.undoManager.undoStack.length;
    doc.undo();
    expect(video(doc).posterAssetId).toBeNull();
    expect(doc.undoManager.undoStack.length).toBe(before - 1);
  });

  it("asks to play first when the video is still on its poster", async () => {
    const addAssetFile = vi.fn(async () => PID);
    const { ctx, doc, toasts } = setup({}, { addAssetFile });
    registry.run("video.setPoster", ctx);
    await flush();
    expect(addAssetFile).not.toHaveBeenCalled();
    expect(video(doc).posterAssetId).toBeNull();
    expect(toasts.join(" ")).toMatch(/play the video/i);
  });

  it("reports a frame it cannot read and changes nothing", async () => {
    capture.mockRejectedValue(new Error("Couldn't read this frame"));
    const { ctx, doc, toasts } = setup({}, { addAssetFile: async () => PID });
    getPlaybackStore().activate("v");
    getPlaybackStore().attach("v", { currentTime: 1 } as HTMLVideoElement);
    registry.run("video.setPoster", ctx);
    await flush();
    expect(video(doc).posterAssetId).toBeNull();
    expect(toasts.join(" ")).toMatch(/couldn't read this frame/i);
  });

  it("is not offered for a GIF (its first frame is the poster)", () => {
    const { ctx } = setup({ kind: "gif" }, { addAssetFile: async () => PID });
    expect(registry.available("video.setPoster", ctx)).toBe(false);
    expect(registry.available("video.grabFrame", ctx)).toBe(false);
  });
});

describe("video.grabFrame ('Grab frame as image')", () => {
  it("adds the current frame as an image next to the video and selects it", async () => {
    const addImageFile = vi.fn<(f: File, at: { x: number; y: number }) => Promise<string>>(async () => "img-1");
    const { ctx, selection } = setup({}, { addImageFile });
    expect(registry.get("video.grabFrame").label).toBe("Grab frame as image");
    getPlaybackStore().activate("v", { play: false });
    getPlaybackStore().attach("v", { currentTime: 2, videoWidth: 1280, videoHeight: 720 } as HTMLVideoElement);
    registry.run("video.grabFrame", ctx);
    await flush();
    expect(addImageFile).toHaveBeenCalledTimes(1);
    const [file, at] = addImageFile.mock.calls[0];
    expect(file).toBeInstanceOf(File);
    expect(file.type).toBe("image/webp");
    // To the right of the video (x 100..420), top aligned (y 50), sized to fit a 320 box: 320 x 180 centred on the point.
    expect(at.x).toBeGreaterThan(420);
    expect(at.x - 160).toBeGreaterThanOrEqual(420);
    expect(at.y).toBeCloseTo(50 + 90);
    expect([...selection.ids]).toEqual(["img-1"]);
  });

  it("asks to play first when there is no live frame", async () => {
    const addImageFile = vi.fn(async () => "img-1");
    const { ctx, toasts } = setup({}, { addImageFile });
    registry.run("video.grabFrame", ctx);
    await flush();
    expect(addImageFile).not.toHaveBeenCalled();
    expect(toasts.join(" ")).toMatch(/play the video/i);
  });
});
