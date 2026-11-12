import { arrowBounds } from "../geometry/arrow-path";
import { boundsOf, unionRects } from "../geometry/rect";
import { zoom100Camera, zoomFitCamera, zoomSelectionCamera, zoomStepCamera } from "../input/gestures";
import {
  applyTransform,
  beginSession,
  duplicateSession,
  refreshFollowers,
  sessionBounds,
  translation,
} from "../input/transform-ops";
import { alignRects, distribute, type AlignMode } from "../layout/align";
import { cropForAspect, cropPixelAspect } from "../images/crop";
import { imageSource } from "../images/ops";
import { IMAGE_COMMANDS } from "./image-commands";
import { LAYOUT_COMMANDS } from "./layout-commands";
import { selectedRoots } from "./selection-roots";
import { LINK_COMMANDS } from "../links/link-commands";
import { keyBetween, compareByIndex } from "../model/index-order";
import { oneStepOn } from "../model/one-step";
import { nextSiblingIndex, reorderObjects, safeKey, type ZOp } from "./z-order";
import { defaultsFor } from "../model/defaults";
import type { ArrowObj, CanvasObject, FrameObj, ObjectType, Rect, Terminal } from "../model/types";
import { setTheme } from "@/lib/theme";
import { saveSettings } from "@/lib/settings";
import { serializeSelection } from "../clipboard/serialize";
import { insertPaste, parseClipboard } from "../clipboard/parse";
import type { BoardDoc } from "../doc/board-doc";
import type { ToolId } from "../input/tool-machine";
import { EXPORT_COMMANDS } from "../export/export-commands";
import { PRESENT_COMMANDS } from "../present/present-commands";
import { SHARE_COMMANDS } from "../../share/share-commands";
import { MEDIA_COMMANDS } from "./media-commands";
import { PALETTE_COMMANDS } from "./palette-commands";
import { PROVENANCE_COMMANDS } from "./provenance-commands";
import { registry, type Command, type CommandCtx } from "./registry";

// ---- helpers (shared with the clipboard wiring) ------------------------------------------------------------------------

export { selectedRoots } from "./selection-roots";

export const oneStep = oneStepOn;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function centreOfBounds(objs: CanvasObject[]): { x: number; y: number } | null {
  const u = unionRects(objs.map(boundsOf));
  return u ? { x: u.x + u.w / 2, y: u.y + u.h / 2 } : null;
}

/**
 * Delete the selection (locked objects are skipped) as one undo step and say so with an Undo toast. Returns how many
 * objects were deleted. `verb` is "Deleted" or "Cut".
 */
export function deleteSelection(ctx: CommandCtx, verb = "Deleted"): number {
  const { doc, selection, toast } = ctx;
  const roots = selectedRoots(doc, selection.ids);
  if (roots.length === 0) {
    if (selection.size > 0) toast({ message: "Locked objects can't be deleted. Unlock them first." });
    return 0;
  }
  const ids = roots.map((o) => o.id);
  const backup = serializeSelection(doc, ids).html;
  const at = centreOfBounds(roots);
  oneStep(doc, () => doc.remove(ids));
  selection.clear();
  const stack = doc.undoManager.undoStack;
  const mine = stack[stack.length - 1];

  toast({
    message: `${verb} ${plural(roots.length, "object", "objects")}`,
    action: {
      label: "Undo",
      run: () => {
        const top = doc.undoManager.undoStack;
        if (mine && top[top.length - 1] === mine && doc.canUndo()) {
          doc.undo();
          selection.set(ids.filter((id) => doc.get(id)));
          return;
        }
        // Something else was edited since: bring the objects back as copies instead of undoing that edit.
        const items = parseClipboard({ html: backup });
        if (items.length && at) {
          doc.stopCapturing();
          const restored = insertPaste(doc, items, at);
          doc.stopCapturing();
          selection.set(restored.filter((id) => !doc.get(id)?.parentId || !restored.includes(doc.get(id)!.parentId!)));
        }
      },
    },
  });
  return roots.length;
}

// ---- style ----------------------------------------------------------------------------------------------------------

const STYLE_KEYS: Record<ObjectType, string[]> = {
  shape: ["fill", "stroke", "strokeWidth", "strokeStyle", "opacity", "cornerRadius"],
  image: ["opacity", "mask", "grayscale"],
  sticky: ["fill", "opacity"],
  text: ["color", "fontSize", "align", "lineHeight", "opacity"],
  arrow: ["stroke", "strokeWidth", "strokeStyle", "route", "startHead", "endHead", "opacity"],
  frame: ["background", "clip", "opacity"],
  stroke: ["color", "size", "opacity"],
  group: ["opacity"],
  video: ["opacity"],
  link: ["opacity"],
  embed: ["opacity"],
  swatch: ["opacity"],
  palette: ["opacity"],
  typeSpecimen: ["opacity"],
};
const STROKE_KEYS = ["stroke", "strokeWidth", "strokeStyle"];

function pick(o: CanvasObject, keys: string[]): Record<string, unknown> {
  const rec = o as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = rec[k];
  return out;
}

/** The style of an object as a clipboard value: its type plus the properties that make up its look. */
export function styleOf(o: CanvasObject): Partial<CanvasObject> {
  const style = { type: o.type, ...pick(o, STYLE_KEYS[o.type]) } as Record<string, unknown>;
  if (o.type === "image") {
    style.crop = o.crop; // with w and h this carries the displayed ratio
    style.w = o.w;
    style.h = o.h;
  }
  return style as Partial<CanvasObject>;
}

function stylePatch(style: Partial<CanvasObject>, target: CanvasObject, assets?: CommandCtx["assets"]): Partial<CanvasObject> {
  const src = style as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (style.type === target.type) {
    for (const k of STYLE_KEYS[target.type]) if (src[k] !== undefined) patch[k] = src[k];
    if (target.type === "image" && typeof src.w === "number" && typeof src.h === "number" && src.h > 0) {
      // The copied crop is carried as its pixel aspect (the source box's ratio), applied to this picture's own pixels.
      const pic = imageSource(target, assets);
      const crop = src.crop ? cropForAspect(pic, target.crop, src.w / src.h) : null;
      if (crop || target.crop) {
        const h = target.w / cropPixelAspect(pic, crop);
        patch.crop = crop;
        patch.h = h;
        patch.y = target.y + target.h / 2 - h / 2;
      }
    }
  } else {
    if (src.opacity !== undefined) patch.opacity = src.opacity;
    const strokeLike = (t: string | undefined) => t === "shape" || t === "arrow";
    if (strokeLike(style.type) && strokeLike(target.type)) for (const k of STROKE_KEYS) if (src[k] !== undefined) patch[k] = src[k];
  }
  return patch as Partial<CanvasObject>;
}

// ---- z-order --------------------------------------------------------------------------------------------------------

function reorder(ctx: CommandCtx, op: ZOp): void {
  reorderObjects(ctx.doc, selectedRoots(ctx.doc, ctx.selection.ids), op);
}

// ---- group / ungroup / lock -----------------------------------------------------------------------------------------

function groupSelection(ctx: CommandCtx): void {
  const { doc, selection } = ctx;
  const roots = selectedRoots(doc, selection.ids);
  if (roots.length < 2) return;
  const parent = roots.every((o) => o.parentId === roots[0].parentId) ? roots[0].parentId : null;
  const exclude = new Set(roots.map((o) => o.id));
  const top = roots.reduce((m, o) => (o.index > m ? o.index : m), roots[0].index);
  const index = safeKey(top, nextSiblingIndex(doc, parent, top, exclude));
  const box = unionRects(roots.map(boundsOf))!;
  let gid = "";
  oneStep(doc, () => {
    gid = doc.create({ ...defaultsFor("group"), ...box, parentId: parent, index });
    for (const o of roots) doc.update(o.id, { parentId: gid });
  });
  selection.set([gid]);
}

function ungroupSelection(ctx: CommandCtx): void {
  const { doc, selection } = ctx;
  const groups = [...selection.ids].map((id) => doc.get(id)).filter((o): o is CanvasObject => !!o && o.type === "group");
  if (groups.length === 0) return;
  const freed: string[] = [];
  oneStep(doc, () => {
    for (const g of groups) {
      const kids = doc.childrenOf(g.id).sort(compareByIndex);
      const upper = nextSiblingIndex(doc, g.parentId, g.index, new Set([g.id]));
      let prev: string | null = g.index;
      for (const k of kids) {
        const index: string = safeKey(prev, upper);
        doc.update(k.id, { parentId: g.parentId, index });
        prev = index;
        freed.push(k.id);
      }
    } // an emptied group removes itself when the transaction ends
  });
  const gone = new Set(groups.map((g) => g.id));
  selection.set([...[...selection.ids].filter((id) => !gone.has(id)), ...freed]);
}

function descendantsOf(doc: BoardDoc, o: CanvasObject, out: CanvasObject[]): void {
  for (const c of doc.childrenOf(o.id)) {
    out.push(c);
    descendantsOf(doc, c, out);
  }
}

function toggleLock(ctx: CommandCtx): void {
  const { doc, selection } = ctx;
  const sel = selectedRoots(doc, selection.ids, true);
  if (sel.length === 0) return;
  const lock = !sel.every((o) => o.locked);
  const targets: CanvasObject[] = [];
  for (const o of sel) {
    targets.push(o);
    if (o.type === "group") descendantsOf(doc, o, targets); // a locked group must not leak selectable members
  }
  oneStep(doc, () => targets.forEach((o) => doc.update(o.id, { locked: lock })));
}

// ---- align, distribute, flip, duplicate -----------------------------------------------------------------------------

function parentFrame(doc: BoardDoc, o: CanvasObject): CanvasObject | undefined {
  const p = o.parentId ? doc.get(o.parentId) : undefined;
  return p?.type === "frame" ? p : undefined;
}

function canAlign(ctx: CommandCtx): boolean {
  const roots = selectedRoots(ctx.doc, ctx.selection.ids);
  return roots.length >= 2 || (roots.length === 1 && !!parentFrame(ctx.doc, roots[0]));
}

function moveRoots(doc: BoardDoc, roots: CanvasObject[], to: Rect[]): void {
  oneStep(doc, () => {
    roots.forEach((o, i) => {
      const from = boundsOf(o);
      const dx = to[i].x - from.x;
      const dy = to[i].y - from.y;
      if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return;
      applyTransform(doc, beginSession(doc, [o.id]), translation(dx, dy));
    });
  });
}

function align(ctx: CommandCtx, mode: AlignMode): void {
  const { doc, selection } = ctx;
  const roots = selectedRoots(doc, selection.ids);
  const frame = roots.length === 1 ? parentFrame(doc, roots[0]) : undefined;
  const rects = roots.map(boundsOf);
  moveRoots(doc, roots, alignRects(rects, mode, frame ? boundsOf(frame) : undefined));
}

function distributeSelection(ctx: CommandCtx, axis: "x" | "y"): void {
  const roots = selectedRoots(ctx.doc, ctx.selection.ids);
  moveRoots(ctx.doc, roots, distribute(roots.map(boundsOf), axis));
}

function mirrorTerminal(t: Terminal, s: ReturnType<typeof beginSession>, doc: BoardDoc, axis: "x" | "y", c: number): Terminal {
  const reflect = (p: { x: number; y: number }) => (axis === "x" ? { x: 2 * c - p.x, y: p.y } : { x: p.x, y: 2 * c - p.y });
  if (t.kind === "point") {
    const p = reflect(t);
    return { kind: "point", x: p.x, y: p.y };
  }
  if (s.ids.has(t.id)) return { kind: "bound", id: t.id, anchor: axis === "x" ? { x: 1 - t.anchor.x, y: t.anchor.y } : { x: t.anchor.x, y: 1 - t.anchor.y } };
  const target = doc.get(t.id);
  if (!target) return t;
  const centre = { x: target.x + target.w / 2, y: target.y + target.h / 2 };
  const cos = Math.cos(target.rotation);
  const sin = Math.sin(target.rotation);
  const lx = (t.anchor.x - 0.5) * target.w;
  const ly = (t.anchor.y - 0.5) * target.h;
  const p = reflect({ x: centre.x + lx * cos - ly * sin, y: centre.y + lx * sin + ly * cos });
  return { kind: "point", x: p.x, y: p.y };
}

/** Mirror the selection about its own centre line. Images flip, strokes mirror their points, arrows keep their binding. */
function flip(ctx: CommandCtx, axis: "x" | "y"): void {
  const { doc, selection } = ctx;
  const s = beginSession(doc, selection.ids, true);
  const box = sessionBounds(s);
  if (!box) return;
  const c = axis === "x" ? box.x + box.w / 2 : box.y + box.h / 2;
  oneStep(doc, () => {
    for (const o of s.items) {
      if (o.type === "arrow" || o.type === "group") continue;
      const patch: Record<string, unknown> = { rotation: -o.rotation };
      if (axis === "x") patch.x = 2 * c - (o.x + o.w / 2) - o.w / 2;
      else patch.y = 2 * c - (o.y + o.h / 2) - o.h / 2;
      if (o.type === "image") patch[axis === "x" ? "flipX" : "flipY"] = !(axis === "x" ? o.flipX : o.flipY);
      if (o.type === "stroke") {
        const pts = o.points.slice();
        for (let i = 0; i + 2 < pts.length; i += 3) {
          if (axis === "x") pts[i] = o.w - pts[i];
          else pts[i + 1] = o.h - pts[i + 1];
        }
        patch.points = pts;
      }
      doc.update(o.id, patch as Partial<CanvasObject>);
    }
    for (const o of s.items) {
      if (o.type !== "arrow") continue;
      const next: ArrowObj = { ...o, start: mirrorTerminal(o.start, s, doc, axis, c), end: mirrorTerminal(o.end, s, doc, axis, c) };
      doc.update(o.id, { start: next.start, end: next.end, ...arrowBounds(next, (id) => doc.get(id)) });
    }
    refreshFollowers(doc, s);
  });
}

function duplicate(ctx: CommandCtx): void {
  const { doc, selection } = ctx;
  const s = beginSession(doc, selection.ids);
  if (s.roots.length === 0) return;
  let copies: string[] = [];
  oneStep(doc, () => {
    const { session, map } = duplicateSession(doc, s);
    applyTransform(doc, session, translation(16, 16));
    // Presentation order must stay unique: copies of frames go to the end.
    let last: string | null = null;
    for (const o of doc.all()) if (o.type === "frame" && !map.has(o.id) && (last === null || o.order > last)) last = o.order;
    for (const o of s.items) {
      if (o.type !== "frame") continue;
      last = keyBetween(last, null);
      doc.update(map.get(o.id)!, { order: last } as Partial<FrameObj>);
    }
    copies = session.roots;
  });
  selection.set(copies);
}

// ---- registration ---------------------------------------------------------------------------------------------------

const hasSelection = (c: CommandCtx) => c.selection.size > 0;
const hasRoots = (c: CommandCtx) => selectedRoots(c.doc, c.selection.ids).length > 0;
const rootCount = (c: CommandCtx) => selectedRoots(c.doc, c.selection.ids).length;

const camera = (ctx: CommandCtx, c: ReturnType<typeof zoomFitCamera> | null) => {
  if (c) ctx.canvas.setCamera(c, { animate: ctx.animate ?? false });
};

const TOOLS: { id: string; tool: ToolId; label: string; shortcut: string }[] = [
  { id: "tool.select", tool: "select", label: "Select tool", shortcut: "V" },
  { id: "tool.hand", tool: "hand", label: "Hand tool", shortcut: "H" },
  { id: "tool.sticky", tool: "sticky", label: "Sticky note", shortcut: "N" },
  { id: "tool.text", tool: "text", label: "Text", shortcut: "T" },
  { id: "tool.shape", tool: "shape", label: "Shape", shortcut: "S" },
  { id: "tool.arrow", tool: "arrow", label: "Arrow or line", shortcut: "L" },
  { id: "tool.pen", tool: "pen", label: "Pen", shortcut: "P" },
  { id: "tool.eraser", tool: "eraser", label: "Eraser", shortcut: "E" },
  { id: "tool.frame", tool: "frame", label: "Frame", shortcut: "F" },
];

const ALIGN: { mode: AlignMode; label: string }[] = [
  { mode: "left", label: "Align left" },
  { mode: "hcenter", label: "Align horizontal centres" },
  { mode: "right", label: "Align right" },
  { mode: "top", label: "Align top" },
  { mode: "vcenter", label: "Align vertical centres" },
  { mode: "bottom", label: "Align bottom" },
];

export const BUILTIN_COMMANDS: Command[] = [
  // edit
  { id: "edit.undo", label: "Undo", group: "edit", shortcut: "Mod+Z", when: (c) => c.doc.canUndo(), run: (c) => c.doc.undo() },
  { id: "edit.redo", label: "Redo", group: "edit", shortcut: "Mod+Shift+Z", altShortcuts: ["Mod+Y"], when: (c) => c.doc.canRedo(), run: (c) => c.doc.redo() },
  {
    id: "edit.selectAll",
    label: "Select all",
    group: "edit",
    shortcut: "Mod+A",
    run: (c) =>
      c.selection.set(
        c.doc
          .childrenOf(null)
          .filter((o) => !o.locked)
          .map((o) => o.id),
      ),
  },
  { id: "edit.duplicate", label: "Duplicate", group: "edit", shortcut: "Mod+D", when: hasRoots, run: duplicate },
  { id: "edit.delete", label: "Delete", group: "edit", shortcut: "Delete", altShortcuts: ["Backspace"], when: hasSelection, run: (c) => void deleteSelection(c) },
  {
    id: "edit.copyStyle",
    label: "Copy style",
    group: "edit",
    shortcut: "Mod+Alt+C",
    when: hasSelection,
    run: (c) => {
      const first = [...c.selection.ids].map((id) => c.doc.get(id)).find((o) => !!o);
      if (first) c.clipboardStyle.current = styleOf(first);
    },
  },
  {
    id: "edit.pasteStyle",
    label: "Paste style",
    group: "edit",
    shortcut: "Mod+Alt+V",
    when: (c) => c.clipboardStyle.current !== null && hasRoots(c),
    run: (c) => {
      const style = c.clipboardStyle.current;
      if (!style) return;
      const targets = [...c.selection.ids].map((id) => c.doc.get(id)).filter((o): o is CanvasObject => !!o && !o.locked);
      oneStep(c.doc, () => targets.forEach((o) => c.doc.update(o.id, stylePatch(style, o, c.assets))));
    },
  },
  // The browser's copy/cut/paste events do the work from the keyboard; run() is for menus and the palette.
  { id: "edit.copy", label: "Copy", group: "edit", shortcut: "Mod+C", native: true, when: (c) => hasSelection(c) && !!c.clipboard, run: (c) => void c.clipboard?.copy() },
  { id: "edit.cut", label: "Cut", group: "edit", shortcut: "Mod+X", native: true, when: (c) => hasRoots(c) && !!c.clipboard, run: (c) => void c.clipboard?.cut() },
  { id: "edit.paste", label: "Paste", group: "edit", shortcut: "Mod+V", native: true, when: (c) => !!c.clipboard, run: (c) => void c.clipboard?.paste() },

  // arrange
  { id: "arrange.group", label: "Group", group: "arrange", shortcut: "Mod+G", when: (c) => rootCount(c) >= 2, run: groupSelection },
  {
    id: "arrange.ungroup",
    label: "Ungroup",
    group: "arrange",
    shortcut: "Mod+Shift+G",
    when: (c) => [...c.selection.ids].some((id) => c.doc.get(id)?.type === "group"),
    run: ungroupSelection,
  },
  { id: "arrange.lock", label: "Lock or unlock", group: "arrange", shortcut: "Mod+Shift+L", when: hasSelection, run: toggleLock },
  { id: "arrange.forward", label: "Bring forward", group: "arrange", shortcut: "Mod+]", when: hasRoots, run: (c) => reorder(c, "forward") },
  { id: "arrange.backward", label: "Send backward", group: "arrange", shortcut: "Mod+[", when: hasRoots, run: (c) => reorder(c, "backward") },
  { id: "arrange.front", label: "Bring to front", group: "arrange", shortcut: "Mod+Alt+]", when: hasRoots, run: (c) => reorder(c, "front") },
  { id: "arrange.back", label: "Send to back", group: "arrange", shortcut: "Mod+Alt+[", when: hasRoots, run: (c) => reorder(c, "back") },
  ...ALIGN.map(({ mode, label }): Command => ({ id: `arrange.align.${mode}`, label, group: "arrange", when: canAlign, run: (c) => align(c, mode) })),
  { id: "arrange.distribute.x", label: "Distribute horizontally", group: "arrange", when: (c) => rootCount(c) >= 3, run: (c) => distributeSelection(c, "x") },
  { id: "arrange.distribute.y", label: "Distribute vertically", group: "arrange", when: (c) => rootCount(c) >= 3, run: (c) => distributeSelection(c, "y") },
  { id: "arrange.flipH", label: "Flip horizontally", group: "arrange", shortcut: "Shift+H", when: hasRoots, run: (c) => flip(c, "x") },
  { id: "arrange.flipV", label: "Flip vertically", group: "arrange", shortcut: "Shift+V", when: hasRoots, run: (c) => flip(c, "y") },

  // view
  { id: "view.zoomFit", label: "Zoom to fit", group: "view", shortcut: "Shift+1", run: (c) => camera(c, zoomFitCamera(c.doc, c.canvas.viewport())) },
  {
    id: "view.zoomSelection",
    label: "Zoom to selection",
    group: "view",
    shortcut: "Shift+2",
    when: hasSelection,
    run: (c) => camera(c, zoomSelectionCamera(c.doc, c.selection.ids, c.canvas.viewport())),
  },
  { id: "view.zoomIn", label: "Zoom in", group: "view", shortcut: "Mod+=", altShortcuts: ["Mod+Shift+="], run: (c) => camera(c, zoomStepCamera(c.canvas.getCamera(), c.canvas.viewport(), 1)) },
  { id: "view.zoomOut", label: "Zoom out", group: "view", shortcut: "Mod+-", run: (c) => camera(c, zoomStepCamera(c.canvas.getCamera(), c.canvas.viewport(), -1)) },
  { id: "view.zoom100", label: "Zoom to 100%", group: "view", shortcut: "Mod+0", run: (c) => camera(c, zoom100Camera(c.canvas.getCamera(), c.canvas.viewport())) },
  {
    id: "view.toggleSnap",
    label: "Toggle snapping",
    group: "view",
    run: (c) => {
      const next = !c.canvas.settings().snap;
      if (c.ui?.toggleSnap) c.ui.toggleSnap();
      else saveSettings({ ...c.canvas.settings(), snap: next });
      c.toast({ message: next ? "Snapping on" : "Snapping off", durationMs: 2000 });
    },
  },
  {
    id: "view.toggleTheme",
    label: "Toggle light and dark theme",
    group: "view",
    run: () => {
      if (typeof document === "undefined") return;
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    },
  },
  { id: "view.find", label: "Find and replace", group: "view", shortcut: "Mod+F", global: true, when: (c) => !!c.ui?.openFind, run: (c) => c.ui?.openFind?.() },
  { id: "view.layers", label: "Layers panel", group: "view", when: (c) => !!c.ui?.togglePanel, run: (c) => c.ui?.togglePanel?.("layers") },
  { id: "view.inspector", label: "Inspector panel", group: "view", when: (c) => !!c.ui?.togglePanel, run: (c) => c.ui?.togglePanel?.("inspector") },
  { id: "view.inbox", label: "Inbox panel", group: "view", when: (c) => !!c.ui?.openCapture && !!c.ui?.togglePanel, run: (c) => c.ui?.togglePanel?.("inbox") },
  { id: "inbox.capture", label: "Quick capture to Inbox", group: "insert", shortcut: "Mod+Shift+I", global: true, when: (c) => !!c.ui?.openCapture, run: (c) => c.ui?.openCapture?.() },
  { id: "view.palette", label: "Command palette", group: "view", shortcut: "Mod+K", global: true, when: (c) => !!c.ui?.togglePalette, run: (c) => c.ui?.togglePalette?.() },

  // tools
  ...TOOLS.map(({ id, tool, label, shortcut }): Command => ({ id, label, group: "insert", shortcut, run: (c) => c.setTool(tool) })),
  { id: "tool.image", label: "Add image", group: "insert", shortcut: "I", when: (c) => !!c.ui?.pickImages, run: (c) => c.ui?.pickImages?.() },

  // image tools (crop, masks, value check, replace)
  ...IMAGE_COMMANDS,

  // layout tools on a selection (grid, masonry, justified, pack, normalise, tidy)
  ...LAYOUT_COMMANDS,
  ...MEDIA_COMMANDS,

  // colour: the live board palette, colour cards, highlight, copy and format
  ...PALETTE_COMMANDS,

  // provenance: credits overlay and source fields
  ...PROVENANCE_COMMANDS,

  // link cards and embeds (paste as text, open, retry, insert by URL)
  ...LINK_COMMANDS,

  ...EXPORT_COMMANDS,

  // presentation mode and slide order
  ...PRESENT_COMMANDS,

  // sharing: the Share dialog
  ...SHARE_COMMANDS,
];

/** Add the built-in commands to a registry (done for the app-wide one on import). */
export function registerBuiltinCommands(into: { register(c: Command): void } = registry): void {
  for (const c of BUILTIN_COMMANDS) into.register(c);
}

registerBuiltinCommands();
