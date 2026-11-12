import * as Y from "yjs";
import { beforeEach, describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { MemoryShareStore } from "@/lib/server/share-store-memory";
import type { Visitor } from "@/lib/server/share-store";
import { ViewerBoardTooLargeError, buildViewerBoard, loadViewerBoard, visibleObject } from "@/lib/server/viewer-board";
import type { LinkRow } from "@/lib/share/link";
import { EMPTY_ROUND_DIFF, type Round, type RoundDiff } from "@/lib/share/round-types";
import { A1, A2, A3, A4, CREDIT_A, NOTES_A, NOTES_B, SOURCE_A, STICKY_B_TEXT, allStrings, assetRow, makeFixture, type Fixture } from "./helpers/viewer-fixture";

const OWNER = "11111111-1111-4111-8111-111111111111";
const BOARD = "55555555-5555-4555-8555-555555555555";
const BASE = "https://assets.example.com";

const link = (over: Partial<LinkRow> = {}): LinkRow => ({
  id: "99999999-9999-4999-8999-999999999999", boardId: BOARD, ownerId: OWNER, name: "n", tokenHash: "t".repeat(64), mode: "live", roundId: null, scope: "board", frameIds: [],
  permission: "react", passwordHash: null, expiresAt: null, welcomeNote: "Welcome!", allowDownload: true, watermark: true, showCredits: false, blindVotes: false, votesRevealed: false,
  cookieEpoch: 0, createdAt: "2026-11-01T00:00:00.000Z", revokedAt: null, ...over,
});
const visitor: Visitor = { id: "vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv", linkId: "99999999-9999-4999-8999-999999999999", displayName: "Jane", createdAt: "x", lastSeenAt: "x", lastRoundId: null };
const assets = [A1, A2, A3, A4].map((id) => assetRow(id));

let fx: Fixture;
beforeEach(() => {
  fx = makeFixture();
});

const build = (l: LinkRow, over: Partial<Parameters<typeof buildViewerBoard>[0]> = {}) =>
  buildViewerBoard({ state: fx.state, link: l, round: null, title: "Brand refresh", assets, visitor, diffsSinceLastView: [], sinceRound: null, assetBase: BASE, ...over });
const ids = (b: ReturnType<typeof build>) => b.objects.map((o) => o.id);

describe("redaction", () => {
  it("never sends presenter notes: they are empty strings and the text is nowhere in the JSON", () => {
    const b = build(link());
    const frames = b.objects.filter((o) => o.type === "frame");
    expect(frames).toHaveLength(2);
    for (const f of frames) expect(f.type === "frame" && f.notes).toBe("");
    const json = JSON.stringify(b);
    expect(json).not.toContain(NOTES_A);
    expect(json).not.toContain(NOTES_B);
  });

  it("drops locked, createdAt and updatedAt (constants), and sends no owner id", () => {
    const b = build(link());
    for (const o of b.objects) expect({ l: o.locked, c: o.createdAt, u: o.updatedAt }).toEqual({ l: false, c: 0, u: 0 });
    const json = JSON.stringify(b);
    expect(json).not.toContain(OWNER);
    expect(json).not.toMatch(/ownerId|tokenHash|passwordHash/);
  });

  it("rich text travels as runs, never HTML", () => {
    const b = build(link());
    const sticky = b.objects.find((o) => o.id === fx.ids.stickyA)!;
    expect(sticky.blocks).toEqual([
      { kind: "p", runs: [{ text: "Hello ", marks: ["bold"] }, { text: "<img src=x onerror=alert(1)>", marks: [] }, { text: " site", marks: [] }] },
    ]);
    const json = JSON.stringify(b);
    expect(json).not.toMatch(/<strong|<b>|<em>|<p>|<\/p>/);
  });

  it("a link with a script href never reaches the viewer, other hrefs stay", () => {
    expect(JSON.stringify(build(link()))).not.toContain("javascript:");
    // a safe href survives
    const doc = new BoardDoc();
    const id = doc.create({ ...defaultsFor("text") } as NewObject);
    const p = new Y.XmlElement("paragraph");
    const t = new Y.XmlText();
    p.insert(0, [t]);
    doc.content(id)!.insert(0, [p]);
    t.insert(0, "docs", { link: { href: "https://example.com/docs" } });
    t.insert(4, "mail", { link: { href: "mailto:a@b.co" } });
    t.insert(8, "bad", { link: { href: "data:text/html,x" } });
    const b = buildViewerBoard({ state: Y.encodeStateAsUpdate(doc.ydoc), link: link(), round: null, title: "t", assets: [], visitor, diffsSinceLastView: [], sinceRound: null, assetBase: BASE });
    const runs = b.objects[0].blocks![0].runs;
    expect(runs.map((r) => r.href)).toEqual(["https://example.com/docs", "mailto:a@b.co", undefined]);
  });

  it("showCredits false: no credit string and no source URL anywhere in the JSON", () => {
    const rows = assets.map((a) => (a.id === A1 ? { ...a, credit: CREDIT_A, source_url: SOURCE_A, licence: "CC BY 4.0" } : a));
    const json = JSON.stringify(build(link({ showCredits: false }), { assets: rows }));
    expect(json).not.toContain("Jane Doe");
    expect(json).not.toContain(SOURCE_A);
    expect(json).not.toContain("CC BY");
    expect(json).not.toMatch(/"provenance":\{/);
  });

  it("showCredits true: credits and source links are present", () => {
    const rows = assets.map((a) => (a.id === A1 ? { ...a, credit: CREDIT_A, source_url: SOURCE_A, licence: "CC BY 4.0" } : a));
    const b = build(link({ showCredits: true }), { assets: rows });
    const img = b.objects.find((o) => o.id === fx.ids.imgA)!;
    expect(img.type === "image" && img.provenance).toMatchObject({ credit: CREDIT_A, sourceUrl: SOURCE_A });
    expect(b.assets[A1]).toMatchObject({ credit: expect.stringContaining(CREDIT_A), sourceUrl: SOURCE_A });
  });

  it("an embed whose URL was tampered with, and a link object with a script URL, are dropped", () => {
    const b = build(link());
    expect(ids(b)).not.toContain(fx.ids.embedBad);
    expect(JSON.stringify(b)).not.toContain("evil.example");
    // the untampered link card stays
    expect(ids(b)).toContain(fx.ids.linkA);
    (fx.doc.ydoc.getMap("objects").get(fx.ids.linkA) as Y.Map<unknown>).set("url", "javascript:alert(1)");
    const again = build(link(), { state: Y.encodeStateAsUpdate(fx.doc.ydoc) });
    expect(ids(again)).not.toContain(fx.ids.linkA);
    expect(JSON.stringify(again)).not.toContain("javascript:");
  });

  it("names and titles are plain strings, kept verbatim (the renderer escapes)", () => {
    fx.doc.update(fx.ids.frameA, { name: "<script>alert(1)</script>" } as never);
    const b = build(link(), { state: Y.encodeStateAsUpdate(fx.doc.ydoc), title: "<b>t</b>" });
    expect(b.slides[0].name).toBe("<script>alert(1)</script>");
    expect(b.board.title).toBe("<b>t</b>");
    expect(typeof b.options.welcomeNote).toBe("string");
  });
});

describe("scope (Review Focus: nothing outside the frames leaks)", () => {
  const scoped = (frameIds: string[]) => build(link({ scope: "frames", frameIds }));

  it("board scope exposes everything that is valid, frames first in paint order", () => {
    const b = build(link());
    expect(new Set(ids(b))).toEqual(new Set([fx.ids.frameA, fx.ids.frameB, fx.ids.imgA, fx.ids.imgB, fx.ids.imgFree, fx.ids.stickyA, fx.ids.stickyB, fx.ids.textFree, fx.ids.arrowAB, fx.ids.arrowInA, fx.ids.arrowAtoImgB, fx.ids.linkA, fx.ids.videoA]));
  });

  it("frames [A]: A, what is inside it, and nothing else", () => {
    const b = scoped([fx.ids.frameA]);
    expect(new Set(ids(b))).toEqual(new Set([fx.ids.frameA, fx.ids.imgA, fx.ids.stickyA, fx.ids.arrowInA, fx.ids.linkA, fx.ids.videoA]));
    expect(b.slides.map((s) => s.id)).toEqual([fx.ids.frameA]);
  });

  it("a free picture lying over frame A is not part of frame A", () => {
    const b = scoped([fx.ids.frameA]);
    expect(ids(b)).not.toContain(fx.ids.imgFree);
    expect(ids(b)).not.toContain(fx.ids.textFree);
    expect(b.assets[A3]).toBeUndefined();
  });

  it("an arrow from A to B is gone when B is out of scope, and so is an arrow inside A that points at B's picture", () => {
    const b = scoped([fx.ids.frameA]);
    expect(ids(b)).not.toContain(fx.ids.arrowAB);
    expect(ids(b)).not.toContain(fx.ids.arrowAtoImgB);
  });

  it("with both frames the arrow between them stays, the free picture and text still do not", () => {
    const b = scoped([fx.ids.frameA, fx.ids.frameB]);
    expect(ids(b)).toContain(fx.ids.arrowAB);
    expect(ids(b)).toContain(fx.ids.arrowAtoImgB);
    expect(ids(b)).not.toContain(fx.ids.imgFree);
    expect(b.slides.map((s) => s.id)).toEqual([fx.ids.frameA, fx.ids.frameB]);
  });

  it("nothing of frame B is anywhere in the JSON of a frame-A link: text, ids, asset ids, name, preview keys", () => {
    const round: Round = { id: "r1", boardId: BOARD, number: 1, label: "R1", snapshotId: "s1", diff: EMPTY_ROUND_DIFF, publishedAt: "2026-11-01T00:00:00.000Z", previews: {
      [fx.ids.frameA]: { w480: "p/tok/a-w480.webp", w1280: "p/tok/a-w1280.webp", w: 800, h: 600 },
      [fx.ids.frameB]: { w480: "p/tok/b-w480.webp", w1280: "p/tok/b-w1280.webp", w: 800, h: 600 },
    } };
    const diff: RoundDiff = { ...EMPTY_ROUND_DIFF, byFrame: { [fx.ids.frameA]: { added: 1, changed: 2, removed: 0 }, [fx.ids.frameB]: { added: 5, changed: 5, removed: 0 }, _none: { added: 9, changed: 9, removed: 0 } } };
    const b = build(link({ scope: "frames", frameIds: [fx.ids.frameA], mode: "round", roundId: "r1" }), { round, diffsSinceLastView: [diff], sinceRound: 0 });
    const json = JSON.stringify(b);
    for (const secret of [STICKY_B_TEXT, "Direction B", A2, A3, fx.ids.frameB, fx.ids.imgB, fx.ids.stickyB, "b-w480", NOTES_B]) expect(json, secret).not.toContain(secret);
    expect(b.changed).toEqual({ sinceRound: 0, byFrame: { [fx.ids.frameA]: { added: 1, changed: 2 } } });
  });

  it("a frame in the link that no longer exists exposes nothing and does not throw", () => {
    const b = scoped(["gone-frame"]);
    expect(b.objects).toEqual([]);
    expect(b.slides).toEqual([]);
  });

  it("a cycle of parents cannot hang or leak: both objects are simply unreachable from a frame", () => {
    const map = fx.doc.ydoc.getMap("objects");
    (map.get(fx.ids.imgFree) as Y.Map<unknown>).set("parentId", fx.ids.textFree);
    (map.get(fx.ids.textFree) as Y.Map<unknown>).set("parentId", fx.ids.imgFree);
    const state = Y.encodeStateAsUpdate(fx.doc.ydoc);
    const b = build(link({ scope: "frames", frameIds: [fx.ids.frameA] }), { state });
    expect(ids(b)).not.toContain(fx.ids.imgFree);
    expect(ids(b)).not.toContain(fx.ids.textFree);
    expect(build(link(), { state }).objects.length).toBeGreaterThan(0); // board scope still builds
  });
});

describe("assets", () => {
  it("lists only the assets the exposed objects use, with their size and variants", () => {
    const rows = [...assets, assetRow("a9999999-9999-4999-8999-999999999999")];
    const b = build(link({ scope: "frames", frameIds: [fx.ids.frameA] }), { assets: rows });
    expect(Object.keys(b.assets).sort()).toEqual([A1, A4].sort());
    expect(b.assets[A1]).toEqual({ w: 1600, h: 1000, kind: "image", variants: ["w256", "w1024"], credit: null, sourceUrl: null });
    expect(b.assetBase).toBe(BASE);
  });

  it("an object whose asset row is missing stays (the viewer shows a placeholder); a malformed row is skipped", () => {
    const rows = [assetRow(A1, { width: null }), assetRow(A2, { kind: "file" })];
    const b = build(link(), { assets: rows });
    expect(b.assets).toEqual({});
    expect(ids(b)).toContain(fx.ids.imgA);
  });

  it("unknown variant names in the row are ignored", () => {
    const b = build(link(), { assets: [assetRow(A1, { variants: { w256: true, w999: true, original: true, w2048: false } })] });
    expect(b.assets[A1].variants).toEqual(["w256"]);
  });
});

describe("slides, options, round, preview", () => {
  it("slides follow the presentation order, not the z-order, and carry the frame's box", () => {
    fx.doc.update(fx.ids.frameA, { order: "a5" } as never);
    const b = build(link(), { state: Y.encodeStateAsUpdate(fx.doc.ydoc) });
    expect(b.slides.map((s) => s.name)).toEqual(["Direction B", "Direction A"]);
    expect(b.slides[0]).toMatchObject({ x: 1000, y: 0, w: 800, h: 600, previewW480: null, previewW1280: null });
  });

  it("an unnamed frame is called Slide n", () => {
    fx.doc.update(fx.ids.frameB, { name: "  " } as never);
    const b = build(link(), { state: Y.encodeStateAsUpdate(fx.doc.ydoc) });
    expect(b.slides.map((s) => s.name)).toEqual(["Direction A", "Slide 2"]);
  });

  it("preview URLs are built from the round's keys; keys that are not preview keys are ignored", () => {
    const round: Round = { id: "r1", boardId: BOARD, number: 2, label: "Second", snapshotId: "s1", diff: EMPTY_ROUND_DIFF, publishedAt: "2026-11-05T00:00:00.000Z", previews: {
      [fx.ids.frameA]: { w480: "p/AbCdEfGhIjKlMnOpQrStUv/f1-w480.webp", w1280: "p/AbCdEfGhIjKlMnOpQrStUv/f1-w1280.webp", w: 800, h: 600 },
      [fx.ids.frameB]: { w480: "../../etc/passwd", w1280: "https://evil.example/x.webp", w: 800, h: 600 },
    } };
    const b = build(link({ mode: "round", roundId: "r1" }), { round });
    expect(b.slides[0]).toMatchObject({ previewW480: `${BASE}/p/AbCdEfGhIjKlMnOpQrStUv/f1-w480.webp`, previewW1280: `${BASE}/p/AbCdEfGhIjKlMnOpQrStUv/f1-w1280.webp` });
    expect(b.slides[1]).toMatchObject({ previewW480: null, previewW1280: null });
    expect(b.round).toEqual({ id: "r1", number: 2, label: "Second", publishedAt: "2026-11-05T00:00:00.000Z" });
  });

  it("no preview URLs without a public host", () => {
    const round: Round = { id: "r1", boardId: BOARD, number: 1, label: "R", snapshotId: "s1", diff: EMPTY_ROUND_DIFF, publishedAt: "x", previews: { [fx.ids.frameA]: { w480: "p/t/f-w480.webp", w1280: "p/t/f-w1280.webp", w: 1, h: 1 } } };
    const b = build(link({ mode: "round", roundId: "r1" }), { round, assetBase: "" });
    expect(b.slides[0].previewW480).toBeNull();
    expect(b.assetBase).toBe("");
  });

  it("options and visitor mirror the link, the visitor has no other fields", () => {
    const b = build(link({ permission: "comment", blindVotes: true, votesRevealed: true, watermark: false, allowDownload: false }));
    expect(b.options).toEqual({ permission: "comment", allowDownload: false, watermark: false, showCredits: false, blindVotes: true, votesRevealed: true, welcomeNote: "Welcome!" });
    expect(b.visitor).toEqual({ id: visitor.id, name: "Jane" });
    expect(b.round).toBeNull();
    expect(b.board).toEqual({ title: "Brand refresh", background: null });
  });

  it("nothing of the link row itself is in the output", () => {
    const strings = allStrings(build(link()));
    for (const forbidden of [OWNER, BOARD, "t".repeat(64), visitor.linkId]) expect(strings).not.toContain(forbidden);
  });
});

describe("changed since the last visit", () => {
  const diff = (n: number): RoundDiff => ({ ...EMPTY_ROUND_DIFF, byFrame: { [fx.ids.frameA]: { added: n, changed: n * 10, removed: 7 } } });
  it("sums the diffs of every round published since, per frame, without removals", () => {
    const b = build(link(), { diffsSinceLastView: [diff(1), diff(2)], sinceRound: 1 });
    expect(b.changed).toEqual({ sinceRound: 1, byFrame: { [fx.ids.frameA]: { added: 3, changed: 30 } } });
  });
  it("is null for a first visit and when nothing was published since", () => {
    expect(build(link(), { diffsSinceLastView: [diff(1)], sinceRound: null }).changed).toBeNull();
    expect(build(link(), { diffsSinceLastView: [], sinceRound: 3 }).changed).toBeNull();
  });
});

describe("limits", () => {
  it("refuses a board with more objects than the cap, with a typed error", () => {
    expect(() =>
      buildViewerBoard({ state: fx.state, link: link(), round: null, title: "t", assets, visitor, diffsSinceLastView: [], sinceRound: null, assetBase: BASE }, { maxObjects: 5 }),
    ).toThrow(ViewerBoardTooLargeError);
  });

  it("a board of 1,000 pictures is under 450 KB and each picture under 400 bytes", () => {
    const doc = new BoardDoc();
    const frame = doc.create({ ...defaultsFor("frame"), name: "F", w: 5000, h: 5000, order: "a0" } as NewObject);
    for (let i = 0; i < 1000; i++) {
      doc.create({ ...defaultsFor("image"), assetId: `a${String(i).padStart(7, "0")}-1111-4111-8111-111111111111`, x: (i % 40) * 123.456789, y: Math.floor(i / 40) * 98.7654321, w: 320.123456, h: 240.654321, parentId: frame, title: "" } as NewObject);
    }
    const b = buildViewerBoard({ state: Y.encodeStateAsUpdate(doc.ydoc), link: link(), round: null, title: "t", assets: [], visitor, diffsSinceLastView: [], sinceRound: null, assetBase: BASE });
    const images = b.objects.filter((o) => o.type === "image");
    expect(images).toHaveLength(1000);
    expect(JSON.stringify(b).length).toBeLessThanOrEqual(450_000);
    for (const o of images) expect(JSON.stringify(o).length).toBeLessThanOrEqual(400);
  });
});

describe("visibleObject", () => {
  it("returns the frame an object is in, or null for a free object; null when it is not visible", () => {
    const l = link();
    expect(visibleObject(fx.state, l, fx.ids.imgA)).toEqual({ frameId: fx.ids.frameA });
    expect(visibleObject(fx.state, l, fx.ids.frameB)).toEqual({ frameId: fx.ids.frameB });
    expect(visibleObject(fx.state, l, fx.ids.imgFree)).toEqual({ frameId: null });
    expect(visibleObject(fx.state, l, fx.ids.embedBad)).toBeNull();
    expect(visibleObject(fx.state, l, "does-not-exist")).toBeNull();
  });

  it("follows the scope: out of scope means invisible, whatever the id", () => {
    const l = link({ scope: "frames", frameIds: [fx.ids.frameA] });
    expect(visibleObject(fx.state, l, fx.ids.imgA)).toEqual({ frameId: fx.ids.frameA });
    for (const hidden of [fx.ids.imgB, fx.ids.stickyB, fx.ids.frameB, fx.ids.imgFree, fx.ids.arrowAB]) expect(visibleObject(fx.state, l, hidden), hidden).toBeNull();
  });

  it("agrees with the board it builds: every visible id is in the output and vice versa", () => {
    for (const l of [link(), link({ scope: "frames", frameIds: [fx.ids.frameB] }), link({ scope: "frames", frameIds: [fx.ids.frameA, fx.ids.frameB] })]) {
      const built = new Set(ids(build(l)));
      for (const id of Object.values(fx.ids)) expect(visibleObject(fx.state, l, id) !== null, `${l.scope}:${id}`).toBe(built.has(id));
    }
  });
});

describe("loadViewerBoard (what the route runs)", () => {
  const LINK_ID = "99999999-9999-4999-8999-999999999999";
  let store: MemoryShareStore;
  const roundFor = (n: number, byFrame: RoundDiff["byFrame"] = {}): Round => ({
    id: `0000000${n}-0000-4000-8000-000000000000`, boardId: BOARD, number: n, label: `Round ${n}`, snapshotId: `0000000${n}-1111-4111-8111-111111111111`, previews: {}, diff: { ...EMPTY_ROUND_DIFF, byFrame }, publishedAt: `2026-11-0${n}T00:00:00.000Z`,
  });

  beforeEach(() => {
    store = new MemoryShareStore();
    store.seedBoard({ id: BOARD, ownerId: OWNER, title: "Brand refresh" });
    for (const a of assets) store.seedAsset({ id: a.id, width: a.width, height: a.height });
  });

  const seedRound = (n: number, state: Uint8Array, byFrame?: RoundDiff["byFrame"]) => {
    const r = roundFor(n, byFrame);
    store.seedSnapshot(BOARD, r.snapshotId, state);
    store.seedRound(r);
    return r;
  };

  it("round mode shows the snapshot even after the live board changed; live mode shows the change", async () => {
    const r = seedRound(1, fx.state);
    store.seedLiveState(BOARD, fx.state);
    // the owner edits afterwards
    fx.doc.update(fx.ids.frameA, { name: "Renamed later" } as never);
    store.seedLiveState(BOARD, Y.encodeStateAsUpdate(fx.doc.ydoc));

    const roundLink = link({ mode: "round", roundId: r.id });
    const liveLink = link({ mode: "live" });
    const a = await loadViewerBoard({ store, link: roundLink, visitor, assetBase: BASE });
    const b = await loadViewerBoard({ store, link: liveLink, visitor, assetBase: BASE });
    expect(a.slides.map((s) => s.name)).toEqual(["Direction A", "Direction B"]);
    expect(b.slides.map((s) => s.name)).toEqual(["Renamed later", "Direction B"]);
    expect(a.round).toMatchObject({ number: 1 });
    expect(b.round).toBeNull();
  });

  it("looks up exactly the assets the exposed objects use", async () => {
    store.seedLiveState(BOARD, fx.state);
    const b = await loadViewerBoard({ store, link: link({ scope: "frames", frameIds: [fx.ids.frameA] }), visitor, assetBase: BASE });
    expect(Object.keys(b.assets).sort()).toEqual([A1, A4].sort());
  });

  it("changed sums the rounds published since the visitor's last one, and the visit is remembered", async () => {
    seedRound(1, fx.state);
    seedRound(2, fx.state, { [fx.ids.frameA]: { added: 1, changed: 2, removed: 0 } });
    const r3 = seedRound(3, fx.state, { [fx.ids.frameA]: { added: 4, changed: 0, removed: 1 }, [fx.ids.frameB]: { added: 0, changed: 3, removed: 0 } });
    const v = await store.createVisitor(LINK_ID, null);
    await store.touchVisitor(v.id, { lastRoundId: roundFor(1).id });
    const current = (await store.getVisitor(v.id))!;
    const l = link({ mode: "round", roundId: r3.id });

    const b = await loadViewerBoard({ store, link: l, visitor: current, assetBase: BASE });
    expect(b.changed).toEqual({ sinceRound: 1, byFrame: { [fx.ids.frameA]: { added: 5, changed: 2 }, [fx.ids.frameB]: { added: 0, changed: 3 } } });
    expect((await store.getVisitor(v.id))!.lastRoundId).toBe(r3.id);

    // the next load has nothing new
    const again = await loadViewerBoard({ store, link: l, visitor: (await store.getVisitor(v.id))!, assetBase: BASE });
    expect(again.changed).toBeNull();
  });

  it("a first-time visitor gets changed: null, and is marked as having seen the round", async () => {
    const r = seedRound(2, fx.state);
    seedRound(1, fx.state);
    const v = await store.createVisitor(LINK_ID, null);
    const b = await loadViewerBoard({ store, link: link({ mode: "round", roundId: r.id }), visitor: (await store.getVisitor(v.id))!, assetBase: BASE });
    expect(b.changed).toBeNull();
    expect((await store.getVisitor(v.id))!.lastRoundId).toBe(r.id);
  });

  it("a visitor who last saw a round of ANOTHER board is treated as new", async () => {
    const r = seedRound(2, fx.state);
    store.seedRound({ ...roundFor(1), id: "00000009-0000-4000-8000-000000000000", boardId: "77777777-7777-4777-8777-777777777777" });
    const v = await store.createVisitor(LINK_ID, null);
    await store.touchVisitor(v.id, { lastRoundId: "00000009-0000-4000-8000-000000000000" });
    const b = await loadViewerBoard({ store, link: link({ mode: "round", roundId: r.id }), visitor: (await store.getVisitor(v.id))!, assetBase: BASE });
    expect(b.changed).toBeNull();
  });

  it("a live link never touches lastRoundId", async () => {
    store.seedLiveState(BOARD, fx.state);
    const v = await store.createVisitor(LINK_ID, null);
    await loadViewerBoard({ store, link: link(), visitor: (await store.getVisitor(v.id))!, assetBase: BASE });
    expect((await store.getVisitor(v.id))!.lastRoundId).toBeNull();
  });

  it("a live board nobody has edited yet is simply empty", async () => {
    const b = await loadViewerBoard({ store, link: link(), visitor, assetBase: BASE });
    expect(b.objects).toEqual([]);
    expect(b.slides).toEqual([]);
  });

  it("a round link whose round is missing, or belongs to another board, is a 404 Response", async () => {
    const l = link({ mode: "round", roundId: "00000005-0000-4000-8000-000000000000" });
    await expect(loadViewerBoard({ store, link: l, visitor, assetBase: BASE })).rejects.toMatchObject({ status: 404 });
    store.seedRound({ ...roundFor(5), boardId: "77777777-7777-4777-8777-777777777777" });
    store.seedSnapshot("77777777-7777-4777-8777-777777777777", roundFor(5).snapshotId, fx.state);
    await expect(loadViewerBoard({ store, link: l, visitor, assetBase: BASE })).rejects.toMatchObject({ status: 404 });
  });
});
