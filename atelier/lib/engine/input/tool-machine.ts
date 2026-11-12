import type { BoardDoc } from "../doc/board-doc";
import type { Camera } from "../geometry/camera";
import type { Guide } from "../geometry/snap";
import type { Point, Rect, StrokeObj } from "../model/types";
import type { SpatialIndex } from "../spatial/spatial-index";
import type { NavSettings } from "@/lib/settings";
import type { EditingStore } from "./editing-store";
import { SelectionStore } from "./selection-store";
import { createAllTools } from "./tools";

export { SelectionStore };

export type ToolId = "select" | "hand" | "sticky" | "text" | "shape" | "arrow" | "pen" | "highlighter" | "eraser" | "frame" | "image";

/** A pointer event in canvas terms. `point` is canvas coordinates, `screen` is CSS px relative to the canvas element. */
export type CanvasPointer = {
  point: Point;
  screen: Point;
  pointerId: number;
  pointerType: "mouse" | "pen" | "touch" | (string & {});
  /** 0..1; 0.5 for a mouse. */
  pressure: number;
  button: number;
  /** Bit mask of pressed buttons: 0 means hover. */
  buttons: number;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  /** Milliseconds, monotonic (PointerEvent.timeStamp). */
  timeStamp: number;
};

export interface ToolCtx {
  doc: BoardDoc;
  index: SpatialIndex;
  camera(): Camera;
  selection: SelectionStore;
  settings: NavSettings;
  setTool(id: ToolId): void;
  overlays: OverlayStore;
  /** Size of the canvas element in CSS px. */
  viewport(): { w: number; h: number };
  /** The object being edited (text, frame name). Tools start editing after creating a sticky or text. */
  editing: EditingStore;
  /** A creation tool is done: return to Select, unless the tool is locked (toolbar double-click). */
  finishTool(): void;
}

/**
 * A tool is driven by pointer events from the canvas. `onMove` is also called for hover (`e.buttons === 0`).
 * Exactly one primary pointer is delivered at a time; extra touches never reach a tool. `onCancel` is called when a
 * gesture must be abandoned (second finger down, tool switched, Escape): the tool should undo what it did.
 */
export interface Tool {
  id: ToolId;
  onDown(ctx: ToolCtx, e: CanvasPointer): void;
  onMove(ctx: ToolCtx, e: CanvasPointer): void;
  onUp(ctx: ToolCtx, e: CanvasPointer): void;
  onCancel?(ctx: ToolCtx): void;
  onDoubleClick?(ctx: ToolCtx, e: CanvasPointer): void;
  /** Return true when the key was handled (the canvas then prevents its default). */
  onKey?(ctx: ToolCtx, e: KeyboardEvent): boolean;
  cursor?(ctx: ToolCtx): string;
}

export type OverlayState = {
  guides: readonly Guide[];
  /** Marquee rectangle in canvas coordinates. */
  marquee: Rect | null;
  /** Object id to outline as the current drop or bind target. */
  highlight: string | null;
  /** A stroke being drawn. It joins the document on pointer up, so a long stroke is not rewritten on every move. */
  draft: StrokeObj | null;
};

const EMPTY_OVERLAYS: OverlayState = { guides: [], marquee: null, highlight: null, draft: null };

/** Transient drawing state of tools (snap guides, marquee, target highlight), rendered by the overlays. */
export class OverlayStore {
  private current: OverlayState = EMPTY_OVERLAYS;
  private readonly listeners = new Set<() => void>();

  get state(): OverlayState {
    return this.current;
  }

  set(patch: Partial<OverlayState>): void {
    this.current = { ...this.current, ...patch };
    this.notify();
  }

  reset(): void {
    if (this.current === EMPTY_OVERLAYS) return;
    this.current = EMPTY_OVERLAYS;
    this.notify();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of [...this.listeners]) cb();
  }
}

/** Holds the registered tools and which one is active. Tools that are not registered (yet) leave the canvas inert. */
export class ToolMachine {
  /** Called with the outgoing tool just before the active tool changes, so it can abandon a gesture in progress. */
  beforeSwitch: ((outgoing: Tool | undefined) => void) | null = null;

  private readonly tools = new Map<ToolId, Tool>();
  private active: ToolId;
  private lockedFlag = false;
  private readonly listeners = new Set<() => void>();

  constructor(tools: Tool[] = [], initial: ToolId = "select") {
    for (const t of tools) this.tools.set(t.id, t);
    this.active = initial;
  }

  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
    this.notify();
  }

  get id(): ToolId {
    return this.active;
  }

  get tool(): Tool | undefined {
    return this.tools.get(this.active);
  }

  /** A registered tool by id, typed as the tool's own interface (for example `ShapeTool` to read or set its kind). */
  get<T extends Tool = Tool>(id: ToolId): T | undefined {
    return this.tools.get(id) as T | undefined;
  }

  /**
   * Locked tool: a creation tool that stays active after each use (the toolbar sets it on a double-click). Switching
   * to another tool unlocks it.
   */
  get locked(): boolean {
    return this.lockedFlag;
  }

  set locked(v: boolean) {
    if (v === this.lockedFlag) return;
    this.lockedFlag = v;
    this.notify();
  }

  setTool(id: ToolId): void {
    if (id === this.active) return;
    this.beforeSwitch?.(this.tool);
    this.active = id;
    this.lockedFlag = false;
    this.notify();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of [...this.listeners]) cb();
  }
}

/** A machine with every implemented tool. Each machine gets its own tool instances (tools keep gesture state). */
export function createToolMachine(initial: ToolId = "select"): ToolMachine {
  return new ToolMachine(createAllTools(), initial);
}
