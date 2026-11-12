import { arrowBounds, terminalPoint } from "../../geometry/arrow-path";
import { rotateAround, snapAngle } from "../../geometry/transform";
import { defaultsFor } from "../../model/defaults";
import type { ArrowObj, CanvasObject, Head, Point, Terminal } from "../../model/types";
import { pickObject } from "../pick";
import { beginUndoGesture, endUndoGesture } from "../undo-gesture";
import type { CanvasPointer, Tool, ToolCtx } from "../tool-machine";
import { frameIdAt, isDrag, touchIgnored } from "./common";

export type ArrowTool = Tool & {
  route: ArrowObj["route"];
  startHead: Head;
  endHead: Head;
  /** The toolbar's Arrow / Line choice: a line is an arrow without heads. */
  setVariant(v: "arrow" | "line"): void;
  readonly variant: "arrow" | "line";
};

/** Object types an arrow can attach to. */
const BINDABLE = new Set<CanvasObject["type"]>(["image", "text", "sticky", "shape", "frame"]);
const ANGLE_STEP_DEG = 15;
/** Anchors this close to the middle of a side snap to it. */
const MID_SNAP = 0.06;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const snapMid = (v: number) => (Math.abs(v - 0.5) <= MID_SNAP ? 0.5 : v);

/** Normalised position of canvas point `p` within `t` (measured in the target's own, rotated frame). */
export function anchorOn(t: CanvasObject, p: Point): Point {
  const c = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  const q = t.rotation === 0 ? p : rotateAround(p, c, -t.rotation);
  return { x: snapMid(clamp01((q.x - t.x) / t.w)), y: snapMid(clamp01((q.y - t.y) / t.h)) };
}

type Gesture = {
  start: CanvasPointer;
  startTerm: Terminal;
  /** Id of the arrow once the drag has begun. */
  id: string | null;
  undoOpen: boolean;
};

export function createArrowTool(): ArrowTool {
  const settings = { route: "straight" as ArrowObj["route"], startHead: "none" as Head, endHead: "arrow" as Head };
  let g: Gesture | null = null;

  function bindTarget(ctx: ToolCtx, p: Point, exclude: ReadonlySet<string>): CanvasObject | null {
    return pickObject({ doc: ctx.doc, index: ctx.index, camera: ctx.camera }, p, {
      enterGroups: true,
      accept: (o) => BINDABLE.has(o.type) && !exclude.has(o.id),
    });
  }

  function endTerminal(ctx: ToolCtx, e: CanvasPointer, gesture: Gesture): { term: Terminal; target: string | null } {
    const exclude = new Set<string>(gesture.startTerm.kind === "bound" ? [gesture.startTerm.id] : []);
    // Cmd/Ctrl places the end free even over an object.
    const target = e.metaKey || e.ctrlKey ? null : bindTarget(ctx, e.point, exclude);
    if (target) return { term: { kind: "bound", id: target.id, anchor: anchorOn(target, e.point) }, target: target.id };
    let p = e.point;
    const from = terminalPoint(gesture.startTerm, (id) => ctx.doc.get(id));
    if (e.shiftKey && from) {
      const a = snapAngle(Math.atan2(p.y - from.y, p.x - from.x), ANGLE_STEP_DEG);
      const len = Math.hypot(p.x - from.x, p.y - from.y);
      p = { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
    }
    return { term: { kind: "point", x: p.x, y: p.y }, target: null };
  }

  function geometry(ctx: ToolCtx, start: Terminal, end: Terminal) {
    const probe: ArrowObj = {
      ...defaultsFor("arrow"),
      id: "",
      index: "",
      createdAt: 0,
      updatedAt: 0,
      start,
      end,
      route: settings.route,
    };
    return arrowBounds(probe, (id) => ctx.doc.get(id));
  }

  function write(ctx: ToolCtx, gesture: Gesture, end: Terminal) {
    const box = geometry(ctx, gesture.startTerm, end);
    if (gesture.id === null) {
      beginUndoGesture(ctx.doc);
      gesture.undoOpen = true;
      gesture.id = ctx.doc.create({
        ...defaultsFor("arrow"),
        ...box,
        start: gesture.startTerm,
        end,
        route: settings.route,
        startHead: settings.startHead,
        endHead: settings.endHead,
      });
    } else {
      ctx.doc.update(gesture.id, { end, ...box });
    }
  }

  function finish(ctx: ToolCtx) {
    if (g?.undoOpen) endUndoGesture(ctx.doc);
    ctx.overlays.reset();
    g = null;
  }

  function cancel(ctx: ToolCtx) {
    if (!g) return;
    const gesture = g;
    finish(ctx);
    if (gesture.id !== null && ctx.doc.get(gesture.id)) {
      ctx.doc.undo();
      ctx.doc.undoManager.clear(false, true);
    }
  }

  const tool: ArrowTool = {
    id: "arrow",

    get route() {
      return settings.route;
    },
    set route(v) {
      settings.route = v;
    },
    get startHead() {
      return settings.startHead;
    },
    set startHead(v) {
      settings.startHead = v;
    },
    get endHead() {
      return settings.endHead;
    },
    set endHead(v) {
      settings.endHead = v;
    },
    get variant() {
      return settings.startHead === "none" && settings.endHead === "none" ? "line" : "arrow";
    },
    setVariant(v) {
      settings.startHead = "none";
      settings.endHead = v === "line" ? "none" : "arrow";
    },

    onDown(ctx, e) {
      if (touchIgnored(ctx, e)) return;
      if (g) cancel(ctx);
      const target = e.metaKey || e.ctrlKey ? null : bindTarget(ctx, e.point, new Set());
      const startTerm: Terminal = target
        ? { kind: "bound", id: target.id, anchor: anchorOn(target, e.point) }
        : { kind: "point", x: e.point.x, y: e.point.y };
      g = { start: e, startTerm, id: null, undoOpen: false };
      ctx.overlays.set({ highlight: target?.id ?? null });
    },

    onMove(ctx, e) {
      if (!g) {
        // Hovering: show what the arrow would attach to.
        if (e.buttons === 0 && e.pointerType !== "touch") {
          const target = e.metaKey || e.ctrlKey ? null : bindTarget(ctx, e.point, new Set());
          const next = target?.id ?? null;
          if (ctx.overlays.state.highlight !== next) ctx.overlays.set({ highlight: next });
        }
        return;
      }
      if (g.id === null && !isDrag(g.start, e)) return;
      const { term, target } = endTerminal(ctx, e, g);
      write(ctx, g, term);
      if (ctx.overlays.state.highlight !== target) ctx.overlays.set({ highlight: target });
    },

    onUp(ctx, e) {
      if (!g) return;
      const gesture = g;
      if (gesture.id !== null) {
        // The end binds only when it is released over a target (the one highlighted while dragging).
        const { term } = endTerminal(ctx, e, gesture);
        write(ctx, gesture, term);
        const arrow = ctx.doc.get(gesture.id);
        if (arrow && arrow.type === "arrow") {
          const a = terminalPoint(arrow.start, (id) => ctx.doc.get(id));
          const b = terminalPoint(arrow.end, (id) => ctx.doc.get(id));
          const fa = a ? frameIdAt(ctx, a) : null;
          const fb = b ? frameIdAt(ctx, b) : null;
          const parentId = fa !== null && fa === fb ? fa : null;
          if (parentId !== arrow.parentId) ctx.doc.update(arrow.id, { parentId });
        }
      }
      const id = gesture.id;
      finish(ctx);
      if (id !== null) {
        ctx.selection.set([id]);
        ctx.finishTool();
      }
    },

    onCancel(ctx) {
      if (g) cancel(ctx);
      else if (ctx.overlays.state.highlight !== null) ctx.overlays.reset(); // a hover highlight must not outlive the tool
    },

    onKey(ctx, e) {
      if (e.key === "Escape" && g) {
        cancel(ctx);
        return true;
      }
      return false;
    },

    cursor() {
      return "crosshair";
    },
  };
  return tool;
}
