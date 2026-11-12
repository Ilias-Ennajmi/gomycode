import { describe, expect, it } from "vitest";
import { writeRichContent, type RichJSON } from "@/lib/engine/clipboard/rich";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { toJsonCanvas, type JsonCanvas } from "@/lib/engine/export/json-canvas";
import { boardDocSource } from "@/lib/engine/export/scene";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";

const A1 = "11111111-1111-4111-8111-111111111111";
const add = (doc: BoardDoc, type: string, patch: Record<string, unknown> = {}) => doc.create({ ...defaultsFor(type as "shape"), ...patch } as unknown as NewObject);
function richText(doc: BoardDoc, id: string, content: RichJSON[]) {
  doc.transact(() => writeRichContent(doc.content(id)!, { type: "doc", content: [{ type: "paragraph", content }] }));
}
const run = (doc: BoardDoc, assetPath: (id: string) => string | null = (id) => `attachments/${id}.png`) => toJsonCanvas(boardDocSource(doc), { assetPath });

/** A minimal structural check of JSON Canvas 1.0. */
function validate(c: JsonCanvas): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const color = (v: unknown) => v === undefined || (typeof v === "string" && (/^[1-6]$/.test(v) || /^#[0-9a-fA-F]{6}$/.test(v)));
  for (const n of c.nodes) {
    if (ids.has(n.id)) errors.push(`duplicate id ${n.id}`);
    ids.add(n.id);
    if (n.id.length > 64) errors.push("id too long");
    for (const k of ["x", "y", "width", "height"] as const) if (!Number.isInteger(n[k])) errors.push(`${n.id}.${k} not an integer`);
    if (n.width < 1 || n.height < 1) errors.push("size");
    if (!color(n.color)) errors.push("color");
    if (n.type === "text" && typeof n.text !== "string") errors.push("text");
    if (n.type === "file" && typeof n.file !== "string") errors.push("file");
    if (n.type === "link" && !/^https?:/.test(n.url)) errors.push("url");
    if (!["text", "file", "link", "group"].includes(n.type)) errors.push("type");
  }
  const edgeIds = new Set<string>();
  for (const e of c.edges) {
    if (ids.has(e.id) || edgeIds.has(e.id)) errors.push(`duplicate edge id ${e.id}`);
    edgeIds.add(e.id);
    if (!ids.has(e.fromNode) || !ids.has(e.toNode)) errors.push("edge endpoint missing");
    for (const s of [e.fromSide, e.toSide]) if (s !== undefined && !["top", "right", "bottom", "left"].includes(s)) errors.push("side");
    if (!color(e.color)) errors.push("edge color");
  }
  return errors;
}

describe("toJsonCanvas", () => {
  it("maps text, stickies, shapes, images, links, frames, swatches, palettes and specimens", () => {
    const doc = new BoardDoc();
    add(doc, "frame", { name: "Intro", x: 0, y: 0, w: 960, h: 540 });
    const sticky = add(doc, "sticky", { x: 10, y: 10, w: 200, h: 200, fill: "mint" });
    richText(doc, sticky, [{ type: "text", text: "Bold idea", marks: [{ type: "bold" }] }]);
    const labelled = add(doc, "shape", { x: 300, y: 10, w: 100, h: 60 });
    richText(doc, labelled, [{ type: "text", text: "Step" }]);
    add(doc, "shape", { x: 500, y: 10, w: 100, h: 60 }); // no text, no arrow: left out
    add(doc, "image", { assetId: A1, x: 0, y: 300, w: 320, h: 240 });
    add(doc, "link", { url: "https://example.com/a", x: 400, y: 300 });
    add(doc, "embed", { provider: "youtube", url: "https://youtu.be/x", embedUrl: "https://www.youtube-nocookie.com/embed/x", x: 800, y: 300 });
    add(doc, "swatch", { hex: "#2F4A6D", name: "Ink", x: 0, y: 700 });
    add(doc, "palette", { x: 200, y: 700, swatches: [{ hex: "#112233", weight: 0.5, name: "a", locked: false }, { hex: "#aabbcc", weight: 0.5, name: "", locked: false }] });
    add(doc, "typeSpecimen", { family: "Playfair Display", weight: 700, sample: "Aa", x: 700, y: 700 });
    const { canvas, warnings } = run(doc);
    expect(validate(canvas)).toEqual([]);
    const byType = (t: string) => canvas.nodes.filter((n) => n.type === t);
    expect(byType("group")).toMatchObject([{ label: "Intro" }]);
    expect(canvas.nodes[0].type).toBe("group"); // groups first so they sit under their contents
    expect(byType("text").map((n) => (n as { text: string }).text)).toEqual(expect.arrayContaining(["**Bold idea**", "Step", "#2f4a6d Ink", "#112233 a\n#aabbcc", expect.stringContaining("Playfair Display 700")]));
    expect(byType("text").find((n) => (n as { text: string }).text === "**Bold idea**")?.color).toBe("4");
    expect(byType("file")).toMatchObject([{ file: `attachments/${A1}.png`, width: 320, height: 240 }]);
    expect(byType("link").map((n) => (n as { url: string }).url).sort()).toEqual(["https://example.com/a", "https://youtu.be/x"]);
    expect(warnings.join(" ")).toMatch(/1 shape was left out/);
  });

  it("makes an edge from an arrow bound at both ends, with sides from the anchors", () => {
    const doc = new BoardDoc();
    const a = add(doc, "shape", { x: 0, y: 0, w: 100, h: 100 });
    const b = add(doc, "shape", { x: 300, y: 0, w: 100, h: 100 });
    add(doc, "arrow", { start: { kind: "bound", id: a, anchor: { x: 1, y: 0.5 } }, end: { kind: "bound", id: b, anchor: { x: 0, y: 0.4 } }, endHead: "triangle", label: "then" });
    add(doc, "arrow", { start: { kind: "point", x: 0, y: 0 }, end: { kind: "bound", id: b, anchor: { x: 0, y: 0.5 } } });
    const { canvas, warnings } = run(doc);
    expect(validate(canvas)).toEqual([]);
    expect(canvas.nodes).toHaveLength(2); // unlabelled shapes are kept because an arrow needs them
    expect(canvas.edges).toHaveLength(1);
    expect(canvas.edges[0]).toMatchObject({ fromSide: "right", toSide: "left", toEnd: "arrow", fromEnd: "none", label: "then" });
    expect(warnings.join(" ")).toMatch(/1 arrow was left out/);
  });

  it("counts strokes, rotation and pictures without a file in the warnings, and never emits NaN", () => {
    const doc = new BoardDoc();
    add(doc, "stroke", { points: [0, 0, 0.5, 5, 5, 0.5], w: 10, h: 10 });
    add(doc, "sticky", { rotation: 0.5, x: 0.4, y: 0.6, w: 99.5, h: 0.2 });
    add(doc, "image", { assetId: A1 });
    const { canvas, warnings } = run(doc, () => null);
    expect(validate(canvas)).toEqual([]);
    expect(canvas.nodes).toHaveLength(1);
    expect(JSON.stringify(canvas)).not.toMatch(/NaN|null/);
    const w = warnings.join(" ");
    expect(w).toMatch(/1 pen stroke was/);
    expect(w).toMatch(/Rotation is not kept/);
    expect(w).toMatch(/1 picture or video was/);
  });

  it("gives every node a unique id of at most 64 characters", () => {
    const doc = new BoardDoc();
    for (let i = 0; i < 5; i++) add(doc, "sticky", { id: `${"x".repeat(80)}${i}`, x: i * 300 });
    const { canvas } = run(doc);
    expect(validate(canvas)).toEqual([]);
    expect(new Set(canvas.nodes.map((n) => n.id)).size).toBe(5);
  });
});
