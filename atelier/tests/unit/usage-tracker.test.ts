// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { collectAssetIds, UsageTracker } from "@/lib/assets/usage-tracker";

const A = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e01";
const B = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e02";
const C = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e03";
const D = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e04";
const E = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e05";

const image = (assetId: string) => ({ ...defaultsFor("image"), assetId }) as NewObject;
const video = (assetId: string, posterAssetId: string | null) => ({ ...defaultsFor("video"), assetId, posterAssetId }) as NewObject;
const link = (imageAssetId: string | null) => ({ ...defaultsFor("link"), url: "https://example.com", imageAssetId }) as NewObject;

describe("collectAssetIds", () => {
  it("lists every asset a board uses once: images, videos with their poster, link-card pictures", () => {
    const doc = new BoardDoc();
    doc.create(image(A));
    doc.create(image(A)); // a second image of the same asset
    doc.create(video(B, C));
    doc.create(link(D));
    doc.create({ ...defaultsFor("text") } as NewObject);
    expect([...collectAssetIds(doc)].sort()).toEqual([A, B, C, D].sort());
  });

  it("ignores empty, null and malformed ids", () => {
    const doc = new BoardDoc();
    doc.create(image(""));
    doc.create(video(A, null));
    doc.create(link(null));
    doc.create(image("not-an-asset-id"));
    expect(collectAssetIds(doc)).toEqual([A]);
  });
});

describe("UsageTracker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(debounceMs = 5000) {
    const doc = new BoardDoc();
    const calls: string[][] = [];
    const putUsage = vi.fn(async (_board: string, ids: string[]) => {
      calls.push([...ids].sort());
    });
    const tracker = new UsageTracker({ doc, boardId: "board-1", api: { putUsage }, debounceMs });
    return { doc, calls, putUsage, tracker };
  }

  it("sends the set once the debounce passes after opening", async () => {
    const { doc, calls, tracker } = setup();
    doc.create(image(A));
    tracker.start();
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual([[A]]);
    tracker.stop();
  });

  it("does not send again while the set of assets is unchanged", async () => {
    const { doc, calls, tracker } = setup();
    const id = doc.create(image(A));
    tracker.start();
    await vi.advanceTimersByTimeAsync(5000);
    doc.update(id, { x: 50 }); // moving an image does not change which assets are used
    doc.create({ ...defaultsFor("text") } as NewObject);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(1);
    tracker.stop();
  });

  it("sends once for ten changes inside the debounce", async () => {
    const { doc, calls, tracker } = setup();
    tracker.start();
    await vi.advanceTimersByTimeAsync(5000);
    calls.length = 0;
    const ids = [A, B, C, D, E];
    for (let i = 0; i < 10; i++) {
      doc.create(image(ids[i % ids.length]));
      await vi.advanceTimersByTimeAsync(300);
    }
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual([[A, B, C, D, E]]);
    tracker.stop();
  });

  it("sends an empty set when the last image is removed", async () => {
    const { doc, calls, tracker } = setup();
    const id = doc.create(image(A));
    tracker.start();
    await vi.advanceTimersByTimeAsync(5000);
    doc.remove([id]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).toEqual([[A], []]);
    tracker.stop();
  });

  it("retries after a rejected PUT on the next change", async () => {
    const { doc, putUsage, tracker } = setup();
    putUsage.mockRejectedValueOnce(new Error("offline"));
    doc.create(image(A));
    tracker.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(putUsage).toHaveBeenCalledTimes(1);
    // nothing changes in the set, but the failed send is still owed
    doc.create({ ...defaultsFor("text") } as NewObject);
    await vi.advanceTimersByTimeAsync(5000);
    expect(putUsage).toHaveBeenCalledTimes(2);
    expect(putUsage).toHaveBeenLastCalledWith("board-1", [A]);
    // and once it succeeded, the same set is not sent again
    doc.create({ ...defaultsFor("text") } as NewObject);
    await vi.advanceTimersByTimeAsync(5000);
    expect(putUsage).toHaveBeenCalledTimes(2);
    tracker.stop();
  });

  it("retries when the browser comes back online", async () => {
    const { doc, putUsage, tracker } = setup();
    putUsage.mockRejectedValueOnce(new Error("offline"));
    doc.create(image(A));
    tracker.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(putUsage).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(putUsage).toHaveBeenCalledTimes(2);
    tracker.stop();
  });

  it("flush() sends immediately", async () => {
    const { doc, calls, tracker } = setup();
    doc.create(image(B));
    tracker.start();
    await tracker.flush();
    expect(calls).toEqual([[B]]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(1); // the pending timer found nothing new
    tracker.stop();
  });

  it("sends nothing after stop()", async () => {
    const { doc, calls, tracker } = setup();
    tracker.start();
    doc.create(image(A));
    tracker.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toHaveLength(0);
  });

  it("never runs two sends at once and sends the newest set afterwards", async () => {
    const { doc, tracker, putUsage } = setup(100);
    let release!: () => void;
    putUsage.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    doc.create(image(A));
    tracker.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(putUsage).toHaveBeenCalledTimes(1);
    doc.create(image(B));
    await vi.advanceTimersByTimeAsync(100);
    expect(putUsage).toHaveBeenCalledTimes(1); // the first is still in flight
    release();
    await vi.advanceTimersByTimeAsync(100);
    expect(putUsage).toHaveBeenCalledTimes(2);
    expect([...putUsage.mock.calls[1][1]].sort()).toEqual([A, B]);
    tracker.stop();
  });
});
