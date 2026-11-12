import * as Y from "yjs";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { NewObject } from "@/lib/engine/model/types";
import { passwordHasher } from "@/lib/share/password";
import type { LinkRow } from "@/lib/share/link";
import { EMPTY_ROUND_DIFF } from "@/lib/share/round-types";
import { generateToken } from "@/lib/share/token";
import type { MemoryShareStore } from "./share-store-memory";

/*
 * Test support for local-only mode (ATELIER_LOCAL_ONLY=1, end-to-end tests and screenshots): builds a board from a compact spec
 * inside the in-memory share store and makes a share link to it. Reached only through app/api/test/seed-share/route.ts, which
 * does not exist outside local-only mode (and local-only mode is refused in production). Nothing here is used by the product.
 */

export interface SeedFrame {
  name: string;
  w?: number;
  h?: number;
  /** How many pictures to put in the frame (a grid). */
  images?: number;
  sticky?: string;
  note?: string;
  notes?: string;
}

export interface SeedSpec {
  title?: string;
  frames: SeedFrame[];
  mode?: "round" | "live";
  scope?: "board" | "frames";
  /** Indexes into `frames` for a frames-scope link. */
  scopeFrames?: number[];
  permission?: "view" | "react" | "comment";
  password?: string;
  welcomeNote?: string;
  allowDownload?: boolean;
  watermark?: boolean;
  showCredits?: boolean;
  blindVotes?: boolean;
  expiresInSec?: number;
  /** Credit line on every picture (makes `showCredits` visible). */
  credit?: string;
  /** Visitor name for a pre-made session (cookie value returned for tests that skip the name step); not used by default. */
  withPreviews?: boolean;
}

const OWNER = "00000000-0000-4000-8000-000000000001";

/** A 128-bit-looking asset id that is a pure function of (board, index): the e2e route handler can recognise and paint it. */
export function seedAssetId(boardNo: number, i: number): string {
  const hex = (n: number, len: number) => n.toString(16).padStart(len, "0");
  return `5eed${hex(boardNo & 0xffff, 4)}-${hex(i, 4)}-4000-8000-${hex(boardNo, 12)}`;
}

function paragraph(frag: Y.XmlFragment, text: string) {
  const p = new Y.XmlElement("paragraph");
  const t = new Y.XmlText();
  p.insert(0, [t]);
  frag.insert(frag.length, [p]);
  t.insert(0, text);
}

let boardCounter = 0;

export async function seedShare(store: MemoryShareStore, spec: SeedSpec): Promise<Record<string, unknown>> {
  const boardNo = ++boardCounter;
  const boardId = crypto.randomUUID();
  const doc = new BoardDoc();
  const frameIds: Record<string, string> = {};
  const images: Record<string, { objectId: string; assetId: string }[]> = {};
  const assetIds: string[] = [];
  let assetN = 0;

  spec.frames.forEach((f, i) => {
    const w = f.w ?? 1600;
    const h = f.h ?? 900;
    const x = i * (w + 300);
    const id = doc.create({ ...defaultsFor("frame"), name: f.name, x, y: 0, w, h, order: `a${i}`, notes: f.notes ?? "", background: null, clip: true } as NewObject);
    frameIds[f.name] = id;
    const n = f.images ?? 0;
    const cols = Math.ceil(Math.sqrt(n || 1));
    const rows = Math.ceil((n || 1) / cols);
    const gap = 24;
    const cw = (w - gap * (cols + 1)) / cols;
    const ch = (h - gap * (rows + 1) - (f.sticky ? 140 : 0)) / rows;
    images[f.name] = [];
    for (let k = 0; k < n; k++) {
      const assetId = seedAssetId(boardNo, assetN++);
      assetIds.push(assetId);
      const objectId = doc.create({
        ...defaultsFor("image"), assetId, title: `${f.name} picture ${k + 1}`, parentId: id,
        x: x + gap + (k % cols) * (cw + gap), y: gap + Math.floor(k / cols) * (ch + gap), w: cw, h: ch,
      } as NewObject);
      images[f.name].push({ objectId, assetId });
    }
    if (f.sticky) {
      const s = doc.create({ ...defaultsFor("sticky"), x: x + gap, y: h - 140 - gap, w: 420, h: 120, parentId: id } as NewObject);
      const frag = doc.content(s);
      if (frag) paragraph(frag, f.sticky);
    }
    if (f.note) {
      const t = doc.create({ ...defaultsFor("text"), x: x + w - 520, y: h - 140 - gap, w: 480, h: 100, parentId: id } as NewObject);
      const frag = doc.content(t);
      if (frag) paragraph(frag, f.note);
    }
  });

  const state = Y.encodeStateAsUpdate(doc.ydoc);
  const title = spec.title ?? "Brand refresh";
  store.seedBoard({ id: boardId, ownerId: OWNER, title });
  for (const id of assetIds) store.seedAsset({ id, width: 2400, height: 1600, variants: { w256: true, w1024: true, w2048: true }, credit: spec.credit ?? null, licence: spec.credit ? "CC BY 4.0" : null });

  const mode = spec.mode ?? "round";
  let roundId: string | null = null;
  if (mode === "round") {
    roundId = crypto.randomUUID();
    const snapId = crypto.randomUUID();
    store.seedSnapshot(boardId, snapId, state);
    const previews: Record<string, { w480: string; w1280: string; w: number; h: number }> = {};
    spec.frames.forEach((f) => {
      const id = frameIds[f.name];
      if (spec.withPreviews !== false) previews[id] = { w480: `p/seed/${id}-w480.webp`, w1280: `p/seed/${id}-w1280.webp`, w: f.w ?? 1600, h: f.h ?? 900 };
    });
    store.seedRound({ id: roundId, boardId, number: 1, label: "Round 1", snapshotId: snapId, previews, diff: { ...EMPTY_ROUND_DIFF }, publishedAt: new Date().toISOString() });
  } else {
    store.seedLiveState(boardId, state);
  }

  const t = generateToken();
  const link: LinkRow = await store.insertLink({
    boardId, ownerId: OWNER, name: "Client", tokenHash: t.hash, mode, roundId, scope: spec.scope ?? "board",
    frameIds: spec.scope === "frames" ? (spec.scopeFrames ?? [0]).map((i) => frameIds[spec.frames[i].name]) : [],
    permission: spec.permission ?? "comment", passwordHash: spec.password ? await passwordHasher.hash(spec.password) : null,
    expiresAt: spec.expiresInSec ? new Date(Date.now() + spec.expiresInSec * 1000).toISOString() : null,
    welcomeNote: spec.welcomeNote ?? "", allowDownload: !!spec.allowDownload, watermark: !!spec.watermark, showCredits: !!spec.showCredits, blindVotes: !!spec.blindVotes,
  });
  return { token: t.token, linkId: link.id, boardId, roundId, frames: frameIds, images, assetIds };
}
