import { resizeRect, rotateAround, snapAngle, type Handle } from "../../geometry/transform";
import { boundsOf, contains, intersects } from "../../geometry/rect";
import { dragThreshold } from "../gestures";
import { computeSnap, type Guide } from "../../geometry/snap";
import type { CanvasObject, Point, Rect } from "../../model/types";
import { hitHandle, resizeCursor, selectionBox, type HandleHit, type SelectionBox } from "../handles";
import { pickObject, topSelectable } from "../pick";
import {
  MIN_SIZE,
  applyTransform,
  beginSession,
  dropTarget,
  duplicateSession,
  reparentRoots,
  sessionBounds,
  translation,
  type Session,
  type Transform,
} from "../transform-ops";
import { beginUndoGesture, endUndoGesture } from "../undo-gesture";
import type { CanvasPointer, Tool, ToolCtx } from "../tool-machine";

const SNAP_THRESHOLD_PX = 6;
/** Pointer speed (screen px per ms) above which snapping is switched off. */
const SOFT_SNAP_SPEED = 1.5;
const NEIGHBOUR_REACH_PX = 400;
const MAX_NEIGHBOURS = 48;
const ROTATE_STEP_DEG = 15;

type Mode = "pointing" | "move" | "marquee" | "resize" | "rotate" | "none";

type Gesture = {
  mode: Mode;
  start: CanvasPointer;
  prev: CanvasPointer;
  /** Object under the pointer that a drag will move (null: empty space or a handle). */
  hitId: string | null;
  /** A click (no drag) on one object of a multi-selection narrows the selection to it. */
  collapseTo: string | null;
  baseSelection: ReadonlySet<string>;
  handle: HandleHit | null;
  box: SelectionBox | null;
  session: Session | null;
  selectionBefore: ReadonlySet<string>;
  pivot: Point;
  startAngle: number;
  undoOpen: boolean;
  touched: boolean;
};

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function normRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function keepsAspect(o: CanvasObject): boolean {
  return o.type === "image" || o.type === "sticky";
}

/** A key that types a character (no Cmd/Ctrl/Alt chord). Space is excluded: it pans. */
function isTypingKey(e: KeyboardEvent): boolean {
  return e.key.length === 1 && e.key !== " " && !e.metaKey && !e.ctrlKey && !e.altKey;
}

/** Local y of a canvas point relative to a frame's top edge, in the frame's own (rotated) frame. */
function frameLocalY(f: CanvasObject, p: Point): number {
  const q = f.rotation === 0 ? p : rotateAround(p, { x: f.x + f.w / 2, y: f.y + f.h / 2 }, -f.rotation);
  return q.y - f.y;
}

const ARROW_KEYS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

export function createSelectTool(): Tool {
  let g: Gesture | null = null;
  let hover: { hit: HandleHit; rotation: number } | null = null;

  const env = (ctx: ToolCtx) => ({ doc: ctx.doc, index: ctx.index, camera: ctx.camera });

  function finish(ctx: ToolCtx) {
    if (g?.undoOpen) endUndoGesture(ctx.doc);
    ctx.overlays.reset();
    g = null;
  }

  function cancel(ctx: ToolCtx) {
    if (!g) return;
    const { doc } = ctx;
    const gesture = g;
    finish(ctx);
    if (gesture.touched) {
      doc.undo(); // the gesture was a single undo step
      doc.undoManager.clear(false, true); // and it must not be redoable
      ctx.selection.set(gesture.selectionBefore);
    }
  }

  // ---- moving ------------------------------------------------------------------------------------------------

  function beginMove(ctx: ToolCtx, e: CanvasPointer) {
    const gesture = g!;
    const session = beginSession(ctx.doc, ctx.selection.ids);
    if (session.roots.length === 0) {
      gesture.mode = "none"; // only locked objects: nothing to move
      return;
    }
    gesture.mode = "move";
    gesture.selectionBefore = new Set(ctx.selection.ids);
    beginUndoGesture(ctx.doc);
    gesture.undoOpen = true;
    if (e.altKey) {
      const copy = duplicateSession(ctx.doc, session);
      gesture.session = copy.session;
      gesture.touched = true;
      ctx.selection.set(copy.session.roots);
    } else {
      gesture.session = session;
    }
  }

  function neighbours(ctx: ToolCtx, s: Session, moving: Rect): Rect[] {
    const z = ctx.camera().z;
    const reach = NEIGHBOUR_REACH_PX / z;
    const area = { x: moving.x - reach, y: moving.y - reach, w: moving.w + 2 * reach, h: moving.h + 2 * reach };
    const cx = moving.x + moving.w / 2;
    const cy = moving.y + moving.h / 2;
    const out: Array<{ r: Rect; d: number }> = [];
    for (const id of ctx.index.search(area)) {
      if (s.ids.has(id)) continue;
      const o = ctx.doc.get(id);
      if (!o || o.type === "arrow" || o.type === "stroke" || o.type === "group") continue;
      const r = boundsOf(o);
      out.push({ r, d: Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy) });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, MAX_NEIGHBOURS).map((x) => x.r);
  }

  function updateMove(ctx: ToolCtx, e: CanvasPointer) {
    const gesture = g!;
    const s = gesture.session!;
    let dx = e.point.x - gesture.start.point.x;
    let dy = e.point.y - gesture.start.point.y;
    let guides: readonly Guide[] = [];

    const dt = e.timeStamp - gesture.prev.timeStamp;
    const fast = dt > 0 && dist(e.screen, gesture.prev.screen) / dt > SOFT_SNAP_SPEED;
    const snapOn = ctx.settings.snap && !e.metaKey && !e.ctrlKey && !fast;
    const box = sessionBounds(s);
    if (snapOn && box) {
      const moving = { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
      const res = computeSnap(moving, neighbours(ctx, s, moving), SNAP_THRESHOLD_PX / ctx.camera().z);
      dx += res.dx;
      dy += res.dy;
      guides = res.guides;
    }

    ctx.doc.transact(() => applyTransform(ctx.doc, s, translation(dx, dy)));
    gesture.touched = true;
    const lead = ctx.doc.get(s.roots[0]);
    const target = lead && lead.parentId !== undefined ? dropTarget(ctx.doc, ctx.index, lead, s.ids) : null;
    ctx.overlays.set({ guides, highlight: lead && target !== lead.parentId ? target : null });
  }

  // ---- marquee -----------------------------------------------------------------------------------------------

  function updateMarquee(ctx: ToolCtx, e: CanvasPointer) {
    const gesture = g!;
    const rect = normRect(gesture.start.point, e.point);
    const hits = new Set<string>();
    for (const id of ctx.index.search(rect)) {
      const o = ctx.doc.get(id);
      if (!o || o.locked) continue;
      if (o.parentId && ctx.doc.get(o.parentId)?.type === "group") continue; // the group stands for its children
      const b = boundsOf(o);
      if (e.altKey ? intersects(b, rect) : contains(rect, b)) hits.add(id);
    }
    // A frame selected by the marquee stands for its contents.
    for (const id of [...hits]) {
      let p = ctx.doc.get(id)?.parentId ?? null;
      for (let d = 0; p && d < 16; d++) {
        if (hits.has(p)) {
          hits.delete(id);
          break;
        }
        p = ctx.doc.get(p)?.parentId ?? null;
      }
    }
    ctx.overlays.set({ marquee: rect });
    ctx.selection.set([...gesture.baseSelection, ...hits]);
  }

  // ---- resizing and rotating ---------------------------------------------------------------------------------

  function beginHandle(ctx: ToolCtx) {
    const gesture = g!;
    const box = gesture.box!;
    const hit = gesture.handle!;
    const session = beginSession(ctx.doc, ctx.selection.ids, hit.kind === "rotate");
    if (session.roots.length === 0) {
      gesture.mode = "none";
      return;
    }
    gesture.session = session;
    gesture.selectionBefore = new Set(ctx.selection.ids);
    gesture.pivot = box.center;
    gesture.startAngle = Math.atan2(gesture.start.point.y - box.center.y, gesture.start.point.x - box.center.x);
    gesture.mode = hit.kind === "rotate" ? "rotate" : "resize";
    beginUndoGesture(ctx.doc);
    gesture.undoOpen = true;
  }

  function resizeTransform(ctx: ToolCtx, e: CanvasPointer): Transform {
    const gesture = g!;
    const box = gesture.box!;
    const handle = (gesture.handle as { handle: Handle }).handle;
    const s = gesture.session!;
    const rect0 = box.rect;
    const c0 = box.center;
    const rot = box.rotation;
    const world = { x: e.point.x - gesture.start.point.x, y: e.point.y - gesture.start.point.y };
    const local = rot === 0 ? world : rotateAround(world, { x: 0, y: 0 }, -rot);
    const keepAspect = e.shiftKey || s.items.some((o) => s.roots.includes(o.id) && keepsAspect(o));
    const r1 = resizeRect(rect0, handle, local, { keepAspect, fromCenter: e.altKey, minSize: MIN_SIZE });
    const sx = rect0.w > 0 ? r1.w / rect0.w : 1;
    const sy = rect0.h > 0 ? r1.h / rect0.h : 1;

    const only = box.single && box.id ? ctx.doc.get(box.id) : undefined;
    if (only && only.type !== "group") {
      // Exact for a single (possibly rotated) object: keep the fixed edge or point where it was in the world.
      const hx = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
      const hy = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
      const fixed = {
        x: e.altKey || hx === 0 ? c0.x : hx > 0 ? rect0.x : rect0.x + rect0.w,
        y: e.altKey || hy === 0 ? c0.y : hy > 0 ? rect0.y : rect0.y + rect0.h,
      };
      const fixedWorld = rotateAround(fixed, c0, rot);
      const c1 = { x: r1.x + r1.w / 2, y: r1.y + r1.h / 2 };
      const off = rotateAround({ x: c1.x - fixed.x, y: c1.y - fixed.y }, { x: 0, y: 0 }, rot);
      const centre = { x: fixedWorld.x + off.x, y: fixedWorld.y + off.y };
      return { map: () => centre, sx, sy, dRot: 0 };
    }
    // Several objects (or a group): scale positions and sizes with the box.
    return { map: (p) => ({ x: r1.x + (p.x - rect0.x) * sx, y: r1.y + (p.y - rect0.y) * sy }), sx, sy, dRot: 0 };
  }

  function rotateTransform(e: CanvasPointer): Transform {
    const gesture = g!;
    const box = gesture.box!;
    const a = Math.atan2(e.point.y - gesture.pivot.y, e.point.x - gesture.pivot.x);
    let delta = a - gesture.startAngle;
    if (e.shiftKey) {
      delta = box.single
        ? snapAngle(box.rotation + delta, ROTATE_STEP_DEG) - box.rotation
        : snapAngle(delta, ROTATE_STEP_DEG);
    }
    const pivot = gesture.pivot;
    return { map: (p) => rotateAround(p, pivot, delta), sx: 1, sy: 1, dRot: delta };
  }

  function updateHandle(ctx: ToolCtx, e: CanvasPointer) {
    const gesture = g!;
    const tr = gesture.mode === "rotate" ? rotateTransform(e) : resizeTransform(ctx, e);
    ctx.doc.transact(() => applyTransform(ctx.doc, gesture.session!, tr));
    gesture.touched = true;
  }

  // ---- the Tool ----------------------------------------------------------------------------------------------

  return {
    id: "select",

    onDown(ctx, e) {
      if (g) cancel(ctx);
      const sel = ctx.selection.ids;
      const base: Gesture = {
        mode: "pointing",
        start: e,
        prev: e,
        hitId: null,
        collapseTo: null,
        baseSelection: new Set(),
        handle: null,
        box: null,
        session: null,
        selectionBefore: new Set(sel),
        pivot: { x: 0, y: 0 },
        startAngle: 0,
        undoOpen: false,
        touched: false,
      };

      const box = selectionBox(ctx.doc, sel);
      const handle = box ? hitHandle(box, e.point, ctx.camera().z, e.pointerType) : null;
      if (handle) {
        g = { ...base, handle, box };
        return;
      }

      const obj = pickObject(env(ctx), e.point, { selected: sel });
      if (obj) {
        if (e.shiftKey) {
          ctx.selection.toggle(obj.id);
          g = { ...base, hitId: ctx.selection.has(obj.id) ? obj.id : null };
        } else if (!sel.has(obj.id)) {
          ctx.selection.set([obj.id]);
          g = { ...base, hitId: obj.id };
        } else {
          g = { ...base, hitId: obj.id, collapseTo: sel.size > 1 ? obj.id : null };
        }
        return;
      }

      if (!e.shiftKey) ctx.selection.clear();
      g = { ...base, baseSelection: e.shiftKey ? new Set(sel) : new Set() };
    },

    onMove(ctx, e) {
      if (!g) {
        const box = selectionBox(ctx.doc, ctx.selection.ids);
        const hit = box ? hitHandle(box, e.point, ctx.camera().z, e.pointerType) : null;
        hover = hit && box ? { hit, rotation: box.rotation } : null;
        return;
      }
      if (g.mode === "pointing") {
        if (dist(e.screen, g.start.screen) < dragThreshold(e.pointerType)) return;
        if (g.handle) beginHandle(ctx);
        else if (g.hitId) beginMove(ctx, e);
        else g.mode = "marquee";
      }
      switch (g.mode) {
        case "move":
          updateMove(ctx, e);
          break;
        case "marquee":
          updateMarquee(ctx, e);
          break;
        case "resize":
        case "rotate":
          updateHandle(ctx, e);
          break;
      }
      g.prev = e;
    },

    onUp(ctx, e) {
      if (!g) return;
      const gesture = g;
      if (gesture.mode === "pointing" && gesture.collapseTo) ctx.selection.set([gesture.collapseTo]);
      if (gesture.mode === "move" && gesture.session && gesture.touched) {
        const s = gesture.session;
        ctx.doc.transact(() => reparentRoots(ctx.doc, ctx.index, s));
      }
      void e;
      finish(ctx);
    },

    onCancel(ctx) {
      cancel(ctx);
    },

    onDoubleClick(ctx, e) {
      const o = pickObject(env(ctx), e.point, { enterGroups: true, selected: ctx.selection.ids });
      if (!o) return;
      // Inside a group the first double-click enters the group: it selects the object itself.
      if (topSelectable(ctx.doc, o).id !== o.id) {
        ctx.selection.set([o.id]);
        return;
      }
      if (o.type === "text" || o.type === "sticky" || o.type === "shape") {
        ctx.selection.set([o.id]);
        ctx.editing.start(o.id, { selectAll: false });
      } else if (o.type === "frame" && frameLocalY(o, e.point) < 0) {
        // Only the name above the frame is editable, not its body or border.
        ctx.selection.set([o.id]);
        ctx.editing.start(o.id, { selectAll: true });
      }
    },

    onKey(ctx, e) {
      if (e.key === "Escape") {
        if (g) {
          cancel(ctx);
          return true;
        }
        if (ctx.selection.size > 0) {
          ctx.selection.clear();
          return true;
        }
        return false;
      }
      if (e.key === "Enter" || isTypingKey(e)) {
        const only = ctx.selection.size === 1 ? ctx.doc.get([...ctx.selection.ids][0]) : undefined;
        if (!only || only.locked || g) return false;
        // Enter edits a text, sticky or shape; typing a character on a selected sticky starts its text with it.
        if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
          if (only.type !== "text" && only.type !== "sticky" && only.type !== "shape") return false;
          ctx.editing.start(only.id);
          return true;
        }
        if (e.key !== "Enter" && only.type === "sticky") {
          ctx.editing.start(only.id, { initialText: e.key });
          return true;
        }
        return false;
      }
      const dir = ARROW_KEYS[e.key];
      if (!dir || e.metaKey || e.ctrlKey || e.altKey || g || ctx.selection.size === 0) return false;
      const step = e.shiftKey ? 10 : 1;
      const s = beginSession(ctx.doc, ctx.selection.ids);
      if (s.roots.length > 0) ctx.doc.transact(() => applyTransform(ctx.doc, s, translation(dir.x * step, dir.y * step)));
      return true;
    },

    cursor() {
      if (g?.mode === "resize" && g.handle?.kind === "resize") return resizeCursor(g.handle.handle, g.box?.rotation ?? 0);
      if (g?.mode === "rotate") return "grabbing";
      if (!g && hover) return hover.hit.kind === "rotate" ? "grab" : resizeCursor(hover.hit.handle, hover.rotation);
      return "default";
    },
  };
}
