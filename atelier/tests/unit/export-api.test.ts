import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { AssetMetaStore } from "@/lib/assets/meta-store";
import { AssetResolverImpl } from "@/lib/assets/resolver";
import { estimateMeasurer, exportFileName, exportImage, exportSvg, framesInOrder, previewSceneSize } from "@/lib/engine/export/export-api";
import { ExportCancelled } from "@/lib/engine/export/protocol";
import { boardDocSource } from "@/lib/engine/export/scene";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

const ID = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
function board() {
  const doc = new BoardDoc();
  doc.meta.title = "Acme: Spring / 2027";
  const f1 = doc.create({ ...defaultsFor("frame"), name: "Hero", x: 0, y: 0, w: 1920, h: 1080, order: "b0" } as unknown as NewObject);
  doc.create({ ...defaultsFor("frame"), name: "Intro", x: 3000, y: 0, w: 1920, h: 1080, order: "a0" } as unknown as NewObject);
  doc.create({ ...defaultsFor("image"), assetId: ID, x: 100, y: 100, w: 400, h: 300, parentId: f1 } as unknown as NewObject);
  return { doc, f1, src: boardDocSource(doc) };
}

class FakeManager {
  runs: { kind: string; payload: { scene: { width: number; assetIds: string[] }; options?: { scale: number } } }[] = [];
  cancelled = false;
  run(kind: string, payload: unknown) {
    this.runs.push({ kind, payload: payload as never });
    return { promise: Promise.resolve({ blob: new Blob(["x"]), summary: { failedAssets: [], substitutedFonts: [], warnings: [] } }), cancel: () => { this.cancelled = true; } };
  }
}
const resolver = new AssetResolverImpl({ publicHost: "img.example.com", meta: new AssetMetaStore({ persist: false }) });

describe("export api", () => {
  it("orders frames by their presentation key, not by z-order", () => {
    const { src } = board();
    expect(framesInOrder(src).map((f) => f.name)).toEqual(["Intro", "Hero"]);
  });

  it("names files after the board and frame, sanitised", () => {
    const { src, f1 } = board();
    expect(exportFileName(src, { kind: "board" }, "png")).toBe("Acme- Spring - 2027.png");
    expect(exportFileName(src, { kind: "frame", id: f1 }, "jpg", "@2x")).toBe("Acme- Spring - 2027 - Hero@2x.jpg");
  });

  it("previews the output size of a scope without a worker", () => {
    const { src, f1 } = board();
    expect(previewSceneSize(src, { kind: "frame", id: f1 })).toMatchObject({ width: 1920, height: 1080, empty: false });
    expect(previewSceneSize(boardDocSource(new BoardDoc()), { kind: "board" }).empty).toBe(true);
  });

  it("sends a raster job with the clamped scale and the assets the scene uses, and reports the clamp", async () => {
    const { src, f1 } = board();
    const m = new FakeManager();
    const h = exportImage(src, { kind: "frame", id: f1 }, { format: "png", size: { scale: 4 } }, { manager: m, assets: resolver, measure: estimateMeasurer });
    const r = await h.promise;
    expect(m.runs[0].kind).toBe("raster");
    expect(m.runs[0].payload.options?.scale).toBe(4);
    expect(m.runs[0].payload.scene.assetIds).toEqual([ID]);
    expect(r.filename).toBe("Acme- Spring - 2027 - Hero@4x.png");
    expect([r.width, r.height]).toEqual([7680, 4320]);
    // an absurd request is reduced and explained
    const big = exportImage(src, { kind: "frame", id: f1 }, { format: "png", size: { widthPx: 100000 } }, { manager: m, assets: resolver, measure: estimateMeasurer });
    const rb = await big.promise;
    expect(rb.width).toBeLessThanOrEqual(16384);
    expect(rb.summary.clampedReason).toContain("16,384");
  });

  it("sends an svg job and a jpg is never transparent", async () => {
    const { src } = board();
    const m = new FakeManager();
    await exportSvg(src, { kind: "board" }, { imageMode: "link" }, { manager: m, assets: resolver, measure: estimateMeasurer }).promise;
    expect(m.runs[0].kind).toBe("svg");
    await exportImage(src, { kind: "board" }, { format: "jpeg", size: { scale: 1 }, transparent: true }, { manager: m, assets: resolver, measure: estimateMeasurer }).promise;
    expect((m.runs[1].payload.options as unknown as { transparent: boolean }).transparent).toBe(false);
  });

  it("cancels before the job starts with ExportCancelled", async () => {
    const { src } = board();
    const m = new FakeManager();
    const h = exportImage(src, { kind: "board" }, { format: "png", size: { scale: 1 } }, { manager: m, assets: resolver, measure: estimateMeasurer });
    h.cancel();
    await expect(h.promise).rejects.toBeInstanceOf(ExportCancelled);
    expect(m.runs).toHaveLength(0);
  });

  it("cancels the running job through the handle", async () => {
    const { src } = board();
    const m = new FakeManager();
    const h = exportImage(src, { kind: "board" }, { format: "png", size: { scale: 1 } }, { manager: m, assets: resolver, measure: estimateMeasurer });
    await h.promise;
    h.cancel();
    expect(m.cancelled).toBe(true);
  });
});

describe("AssetResolverImpl.urlsFor", () => {
  it("lists every reachable file by variant", () => {
    const r = new AssetResolverImpl({ publicHost: "img.example.com", meta: new AssetMetaStore({ persist: false }) });
    expect(r.urlsFor(ID)).toEqual({ w1024: `https://img.example.com/a/${ID}/w1024.webp`, original: `https://img.example.com/a/${ID}/original` });
    expect(r.urlsFor("not-an-id")).toEqual({});
    const none = new AssetResolverImpl({ publicHost: null, meta: new AssetMetaStore({ persist: false }) });
    expect(none.urlsFor(ID)).toEqual({});
  });
});
