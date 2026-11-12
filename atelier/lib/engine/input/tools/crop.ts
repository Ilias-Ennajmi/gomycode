import { rotateAround, type Handle } from "../../geometry/transform";
import {
  CROP_PRESETS,
  clampCrop,
  cropForAspect,
  moveCropWindow,
  resizeCropWindow,
  type CropPresetId,
  type Size,
} from "../../images/crop";
import { applyCrop, imageSource, type SourceSizes } from "../../images/ops";
import { toDisplayCrop } from "../../model/image-style";
import type { ImageObj, Point, Rect } from "../../model/types";
import { HANDLES, HANDLE_UNIT, resizeCursor } from "../handles";
import type { Tool, ToolCtx } from "../tool-machine";

/**
 * What the crop overlay draws. `win` is the crop window in normalised coordinates of the picture as displayed (so a
 * flipped image is cropped the way it looks); `frame` is where the whole picture sits on the canvas while cropping
 * (the window starts exactly on the object's box), in the object's own unrotated frame about `centre`.
 */
export type CropState = {
  id: string;
  win: Rect;
  preset: CropPresetId;
  src: Size;
  flipX: boolean;
  flipY: boolean;
  frame: Rect;
  centre: Point;
  rotation: number;
};

export interface CropTool extends Tool {
  id: "crop";
  readonly state: CropState | null;
  subscribe(cb: () => void): () => void;
  /** Where the real pixel size of assets comes from (otherwise it is derived from the image's box). */
  setAssets(a: SourceSizes | null): void;
  setPreset(id: CropPresetId): void;
  /** Set the window directly (the Inspector's X/Y/W/H fields): clamped to the picture. */
  setWindow(win: Rect): void;
  /** Apply / discard the crop in progress. `ctx` defaults to the one the tool was activated with. */
  commit(ctx?: ToolCtx): void;
  cancel(ctx?: ToolCtx): void;
}

const NUDGE = 0.01;
const NUDGE_BIG = 0.1;
const HIT_PX = { fine: 10, coarse: 22 };

type Drag = { kind: "move" | "resize"; handle: Handle | null; from: Point; start: Rect; ratio: number | null };

export function createCropTool(): CropTool {
  let state: CropState | null = null;
  let assets: SourceSizes | null = null;
  let drag: Drag | null = null;
  let lastCtx: ToolCtx | null = null;
  let cursor = "default";
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const cb of [...listeners]) cb();
  };
  const set = (next: CropState | null) => {
    state = next;
    notify();
  };

  const ratioOf = (preset: CropPresetId): number | null => CROP_PRESETS.find((p) => p.id === preset)?.ratio ?? null;
  const windowRatio = (s: CropState, w: Rect) => (w.w * (s.src.w / s.src.h)) / w.h;

  /** Canvas point -> the object's unrotated frame. */
  const local = (s: CropState, p: Point): Point => (s.rotation === 0 ? p : rotateAround(p, s.centre, -s.rotation));
  const winRect = (s: CropState): Rect => ({
    x: s.frame.x + s.win.x * s.frame.w,
    y: s.frame.y + s.win.y * s.frame.h,
    w: s.win.w * s.frame.w,
    h: s.win.h * s.frame.h,
  });

  function hitHandleAt(ctx: ToolCtx, s: CropState, p: Point, pointerType: string): Handle | null {
    const r = winRect(s);
    const reach = (pointerType === "touch" ? HIT_PX.coarse : HIT_PX.fine) / ctx.camera().z;
    let best: Handle | null = null;
    let bestD = Infinity;
    for (const h of HANDLES) {
      const u = HANDLE_UNIT[h];
      const d = Math.hypot(p.x - (r.x + u.x * r.w), p.y - (r.y + u.y * r.h));
      if (d <= reach && d < bestD) {
        best = h;
        bestD = d;
      }
    }
    return best;
  }

  const insideWin = (s: CropState, p: Point) => {
    const r = winRect(s);
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  };
  const insideFrame = (s: CropState, p: Point) =>
    p.x >= s.frame.x && p.x <= s.frame.x + s.frame.w && p.y >= s.frame.y && p.y <= s.frame.y + s.frame.h;

  function begin(ctx: ToolCtx): boolean {
    const only = ctx.selection.size === 1 ? ctx.doc.get([...ctx.selection.ids][0]) : undefined;
    if (!only || only.type !== "image" || only.locked) return false;
    const o = only as ImageObj;
    const src = imageSource(o, assets ?? undefined);
    const dc = o.crop && o.crop.w > 0 && o.crop.h > 0 ? toDisplayCrop(o.crop, o.flipX, o.flipY) : { x: 0, y: 0, w: 1, h: 1 };
    const fw = o.w / dc.w;
    const fh = o.h / dc.h;
    set({
      id: o.id,
      win: dc,
      preset: "free",
      src,
      flipX: o.flipX,
      flipY: o.flipY,
      frame: { x: o.x - dc.x * fw, y: o.y - dc.y * fh, w: fw, h: fh },
      centre: { x: o.x + o.w / 2, y: o.y + o.h / 2 },
      rotation: o.rotation,
    });
    return true;
  }

  function end(ctx: ToolCtx): void {
    drag = null;
    cursor = "default";
    set(null);
    ctx.overlays.reset();
  }

  const tool: CropTool = {
    id: "crop",

    get state() {
      return state;
    },

    subscribe(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },

    setAssets(a) {
      assets = a;
    },

    setPreset(id) {
      if (!state) return;
      const ratio = ratioOf(id);
      set({ ...state, preset: id, win: ratio === null ? state.win : clampCrop(cropForAspect(state.src, state.win, ratio)) });
    },

    setWindow(win) {
      if (!state) return;
      set({ ...state, win: clampCrop(win) });
    },

    commit(given) {
      const ctx = given ?? lastCtx;
      const s = state;
      if (!s || !ctx) return;
      const cur = ctx.doc.get(s.id);
      end(ctx);
      if (cur && cur.type === "image" && !cur.locked) applyCrop(ctx.doc, s.id, toDisplayCrop(s.win, s.flipX, s.flipY), s.src);
      ctx.setTool("select");
    },

    cancel(given) {
      const ctx = given ?? lastCtx;
      if (!ctx) return;
      end(ctx);
      ctx.setTool("select");
    },

    onActivate(ctx) {
      lastCtx = ctx;
      if (!begin(ctx)) ctx.setTool("select");
    },

    onDown(ctx, e) {
      const s = state;
      if (!s) return;
      const p = local(s, e.point);
      const handle = hitHandleAt(ctx, s, p, e.pointerType);
      const ratio = ratioOf(s.preset) ?? (e.shiftKey ? windowRatio(s, s.win) : null);
      if (handle) {
        drag = { kind: "resize", handle, from: p, start: s.win, ratio };
      } else if (insideWin(s, p)) {
        drag = { kind: "move", handle: null, from: p, start: s.win, ratio: null };
      } else if (!insideFrame(s, p)) {
        tool.commit(ctx); // a click away from the picture applies the crop
      }
    },

    onMove(ctx, e) {
      const s = state;
      if (!s) return;
      const p = local(s, e.point);
      if (!drag || e.buttons === 0) {
        const h = hitHandleAt(ctx, s, p, e.pointerType);
        cursor = h ? resizeCursor(h, s.rotation) : insideWin(s, p) ? "move" : "default";
        return;
      }
      const dx = (p.x - drag.from.x) / s.frame.w;
      const dy = (p.y - drag.from.y) / s.frame.h;
      const win =
        drag.kind === "move"
          ? moveCropWindow(drag.start, dx, dy)
          : resizeCropWindow(drag.start, drag.handle!, dx, dy, { src: s.src, ratio: drag.ratio });
      set({ ...s, win });
    },

    onUp() {
      drag = null;
    },

    onCancel(ctx) {
      // The tool was switched away from (or the gesture was interrupted): discard the crop in progress.
      if (state) end(ctx);
    },

    onDoubleClick(ctx) {
      tool.commit(ctx);
    },

    onKey(ctx, e) {
      const s = state;
      if (!s) return false;
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        tool.commit(ctx);
        return true;
      }
      if (e.key === "Escape") {
        tool.cancel(ctx);
        return true;
      }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key as string];
      if (!dir || e.metaKey || e.ctrlKey || e.altKey) return false;
      const step = e.shiftKey ? NUDGE_BIG : NUDGE;
      set({ ...s, win: moveCropWindow(s.win, dir[0] * step, dir[1] * step) });
      return true;
    },

    cursor() {
      return cursor;
    },
  };
  return tool;
}
