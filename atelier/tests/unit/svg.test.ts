// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { sceneToSvg } from "@/lib/engine/export/svg";
import type { ClipRect, Scene, SceneNode } from "@/lib/engine/export/scene";

const paint = { fill: "#112233", stroke: null, strokeWidth: 0, dash: null, opacity: 1 };
const rect = (id: string, clip: ClipRect | null = null, x = 0): SceneNode => ({ kind: "rect", sourceId: id, clip, x, y: 0, w: 10, h: 10, rotation: 0, radius: 0, ...paint });
const image = (assetId: string, extra: Partial<Extract<SceneNode, { kind: "image" }>> = {}): SceneNode => ({
  kind: "image", sourceId: assetId, clip: null, assetId, x: 10, y: 20, w: 100, h: 50, rotation: 0, crop: null, rx: 0, ry: 0, flipX: false, flipY: false, grayscale: false, opacity: 1, ...extra,
});
const text = (s: string, extra: Partial<Extract<SceneNode, { kind: "text" }>> = {}): SceneNode => ({
  kind: "text", sourceId: "t", clip: null, x: 5, y: 6, w: 100, h: 30, rotation: 0, cx: 55, cy: 21, color: "#123456", opacity: 1,
  lines: [{ x: 0, y: 18, width: 50, runs: [{ text: s, marks: [], x: 0, width: 50, font: { family: "Inter", weight: 400, italic: false, size: 16 } }] }], ...extra,
});
const scene = (nodes: SceneNode[], extra: Partial<Scene> = {}): Scene => ({ width: 200, height: 100, origin: { x: 0, y: 0 }, background: "#ffffff", nodes, assetIds: [], fonts: [], warnings: [], ...extra });
const png = "data:image/png;base64,iVBORw0KGgo=";
const provider = (over: Partial<{ dataUrl(id: string): Promise<string | null>; url(id: string): string | null }> = {}) => ({ dataUrl: async () => png, url: (id: string) => `https://cdn.example.com/a/${id}/original`, ...over });
const d = { signal: new AbortController().signal, onProgress: () => {} };

function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, "application/xml");
  expect(doc.getElementsByTagName("parsererror")).toHaveLength(0);
  return doc;
}

describe("sceneToSvg", () => {
  it("writes a well-formed standalone SVG of the scene's size", async () => {
    const { svg } = await sceneToSvg(scene([rect("a"), text("Hello")]), { imageMode: "embed", images: provider() }, d);
    const doc = parse(svg);
    const root = doc.documentElement;
    expect(root.localName).toBe("svg");
    expect(root.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(root.getAttribute("width")).toBe("200");
    expect(root.getAttribute("viewBox")).toBe("0 0 200 100");
    expect(svg).toContain(">Hello</");
    expect(svg).toContain('font-family="');
  });

  it("escapes text and attribute values, and never writes script, foreignObject or event attributes", async () => {
    const nasty = '</text><script>alert(1)</script>"&\'';
    const { svg } = await sceneToSvg(scene([text(nasty), { ...text("x"), sourceId: 'a"b&c' }]), { imageMode: "embed", images: provider() }, d);
    const doc = parse(svg);
    expect(doc.getElementsByTagName("script")).toHaveLength(0);
    expect(doc.getElementsByTagName("foreignObject")).toHaveLength(0);
    const all = doc.getElementsByTagName("*");
    for (let i = 0; i < all.length; i++) for (const a of Array.from(all[i].attributes)) expect(a.name.startsWith("on")).toBe(false);
    expect(doc.getElementsByTagName("text")[0].textContent).toContain("<script>alert(1)</script>");
  });

  it("embeds pictures as data URLs, or links them", async () => {
    const e = await sceneToSvg(scene([image("a")], { assetIds: ["a"] }), { imageMode: "embed", images: provider() }, d);
    expect(e.svg).toContain(png);
    const l = await sceneToSvg(scene([image("a")]), { imageMode: "link", images: provider() }, d);
    expect(l.svg).toContain("https://cdn.example.com/a/a/original");
    expect(l.svg).not.toContain("data:image");
  });

  it("replaces an unsafe picture address with a placeholder and lists unreadable pictures", async () => {
    const bad = await sceneToSvg(scene([image("a")]), { imageMode: "link", images: provider({ url: () => "javascript:alert(1)" }) }, d);
    expect(bad.svg).not.toContain("javascript:");
    expect(bad.failedAssets).toEqual(["a"]);
    const none = await sceneToSvg(scene([image("b")]), { imageMode: "embed", images: provider({ dataUrl: async () => null }) }, d);
    expect(none.failedAssets).toEqual(["b"]);
    parse(none.svg);
    const evil = await sceneToSvg(scene([image("c")]), { imageMode: "embed", images: provider({ dataUrl: async () => "data:text/html;base64,PHNjcmlwdD4=" }) }, d);
    expect(evil.svg).not.toContain("text/html");
  });

  it("gives every clip a unique id (50 clipped nodes) and groups the nodes in them", async () => {
    const nodes = Array.from({ length: 50 }, (_, i) => rect(`n${i}`, { x: i, y: 0, w: 5, h: 5 }, i));
    const { svg } = await sceneToSvg(scene(nodes), { imageMode: "embed", images: provider() }, d);
    const doc = parse(svg);
    const ids = Array.from(doc.getElementsByTagName("clipPath")).map((c) => c.getAttribute("id"));
    expect(ids).toHaveLength(50);
    expect(new Set(ids).size).toBe(50);
    expect(svg.match(/clip-path="url\(#/g)!.length).toBeGreaterThanOrEqual(50);
  });

  it("shares one clip between nodes that share a frame", async () => {
    const clip: ClipRect = { x: 0, y: 0, w: 50, h: 50 };
    const { svg } = await sceneToSvg(scene([rect("a", clip), rect("b", clip)]), { imageMode: "embed", images: provider() }, d);
    expect(parse(svg).getElementsByTagName("clipPath")).toHaveLength(1);
  });

  it("uses a grayscale filter, a mask clip and a crop for pictures", async () => {
    const { svg } = await sceneToSvg(scene([image("a", { grayscale: true, rx: 50, ry: 25, crop: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, flipX: true, rotation: 0.3 })]), { imageMode: "embed", images: provider() }, d);
    const doc = parse(svg);
    expect(doc.getElementsByTagName("feColorMatrix")).toHaveLength(1);
    expect(svg).toContain('rx="50"');
    expect(svg).toContain("rotate(");
    expect(svg).toContain("scale(-1 1)");
  });

  it("writes shapes, paths and dashes", async () => {
    const nodes: SceneNode[] = [
      { kind: "rect", sourceId: "r", clip: null, x: 1, y: 2, w: 30, h: 40, rotation: 0.5, radius: 4, fill: "#ff0000", stroke: "#000000", strokeWidth: 2, dash: [6, 4], opacity: 0.5 },
      { kind: "ellipse", sourceId: "e", clip: null, x: 0, y: 0, w: 10, h: 20, rotation: 0, ...paint },
      { kind: "path", sourceId: "p", clip: null, d: "M 0 0 L 10 10 Z", closed: true, dx: 3, dy: 4, ...paint },
      { kind: "path", sourceId: "bad", clip: null, d: "M 0 0 <script>", closed: false, dx: 0, dy: 0, ...paint },
    ];
    const { svg } = await sceneToSvg(scene(nodes), { imageMode: "embed", images: provider() }, d);
    const doc = parse(svg);
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(doc.getElementsByTagName("ellipse")).toHaveLength(1);
    expect(doc.getElementsByTagName("path")).toHaveLength(1); // the path with markup in `d` is dropped
    expect(svg).toContain("translate(3 4)");
  });

  it("stops when aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(sceneToSvg(scene([rect("a")]), { imageMode: "embed", images: provider() }, { ...d, signal: ac.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
