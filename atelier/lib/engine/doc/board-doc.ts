import * as Y from "yjs";
import { compareByIndex, keyBetween } from "../model/index-order";
import { boundsOf } from "../geometry/rect";
import { rotateAround } from "../geometry/transform";
import type { ArrowObj, CanvasObject, NewObject, Point, Terminal } from "../model/types";
import { validateObject } from "../model/validate";
import { newId } from "@/lib/ids";

/** Origin of every local transaction. Only this origin is tracked by the undo manager. */
export const LOCAL_ORIGIN = Symbol("atelier.local");

const CURRENT_SCHEMA_VERSION = 1;
const UNDO_CAPTURE_MS = 400;
/** Keys that change an object's own box (and therefore the box of its parent group). */
const GEOMETRY_KEYS = new Set(["x", "y", "w", "h", "rotation", "parentId"]);
/** Keys that cannot be patched through update(). */
const FROZEN_KEYS = new Set(["id", "type", "createdAt"]);
const EPS = 1e-9;

type YObj = Y.Map<unknown>;

/** Canvas position of a normalised anchor on a (possibly rotated) target. */
function anchorPoint(t: CanvasObject, anchor: Point): Point {
  const center = { x: t.x + t.w / 2, y: t.y + t.h / 2 };
  return rotateAround({ x: t.x + anchor.x * t.w, y: t.y + anchor.y * t.h }, center, t.rotation);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

const HAS_CONTENT = new Set(["text", "sticky", "shape"]);

/**
 * A board is one Yjs document: `meta` (Y.Map) and `objects` (Y.Map<id, Y.Map>). Every object map holds its props
 * as plain values; rich content of text/sticky/shape lives in `content` (Y.XmlFragment).
 *
 * All coordinates are absolute canvas coordinates, also for children of frames and groups.
 * Returned objects are immutable snapshots: never mutate them, call update().
 */
export class BoardDoc {
  readonly ydoc: Y.Doc;
  readonly undoManager: Y.UndoManager;
  readonly meta: { title: string; schemaVersion: number };

  private readonly objects: Y.Map<YObj>;
  private readonly metaMap: Y.Map<unknown>;
  private readonly listeners = new Set<(ids: Set<string>, origin: unknown) => void>();

  // Caches. `cache` is write-through for local edits so reads inside a transaction see pending writes.
  private cache = new Map<string, CanvasObject | null>();
  private order: string[] | null = null; // valid ids, sorted by (index, id)
  private kids: Map<string | null, string[]> | null = null;
  private top: string | null | undefined = undefined; // highest index in use; undefined = unknown
  private fresh = new Set<string>(); // ids whose cache entry is already exact for the running transaction
  private warned = new Set<string>();
  private dirtyGroups = new Set<string>();
  private depth = 0;

  constructor(ydoc: Y.Doc = new Y.Doc()) {
    this.ydoc = ydoc;
    this.objects = ydoc.getMap<YObj>("objects");
    this.metaMap = ydoc.getMap<unknown>("meta");
    this.undoManager = new Y.UndoManager([this.objects], {
      trackedOrigins: new Set<unknown>([LOCAL_ORIGIN]),
      captureTimeout: UNDO_CAPTURE_MS,
    });
    this.objects.observeDeep(this.handleEvents);
    ydoc.on("afterTransaction", this.handleAfterTransaction);

    const metaMap = this.metaMap;
    const write = (key: string, value: unknown) => ydoc.transact(() => metaMap.set(key, value), LOCAL_ORIGIN);
    this.meta = {
      get title() {
        const v = metaMap.get("title");
        return typeof v === "string" ? v : "Untitled";
      },
      set title(v: string) {
        write("title", v);
      },
      get schemaVersion() {
        const v = metaMap.get("schemaVersion");
        return typeof v === "number" && Number.isFinite(v) ? v : CURRENT_SCHEMA_VERSION;
      },
      set schemaVersion(v: number) {
        write("schemaVersion", v);
      },
    };
  }

  // ---- reads ---------------------------------------------------------------------------------------------

  get(id: string): CanvasObject | undefined {
    const hit = this.cache.get(id);
    if (hit !== undefined) return hit ?? undefined;
    const m = this.mapOf(id);
    if (!m) {
      if (this.objects.has(id) && !this.warned.has(id)) {
        this.warned.add(id);
        console.warn(`BoardDoc: skipping invalid object "${id}"`);
      }
      return undefined;
    }
    const raw: Record<string, unknown> = {};
    m.forEach((v, k) => {
      if (k !== "content") raw[k] = v;
    });
    raw.id = id; // the map key is authoritative
    const obj = validateObject(raw);
    if (obj) {
      this.warned.delete(id);
      this.cache.set(id, obj);
      return obj;
    }
    if (!this.warned.has(id)) {
      this.warned.add(id);
      console.warn(`BoardDoc: skipping invalid object "${id}"`);
    }
    this.cache.set(id, null);
    return undefined;
  }

  /** All valid objects sorted by z-order (index, then id). */
  all(): CanvasObject[] {
    const out: CanvasObject[] = [];
    for (const id of this.ensureOrder()) {
      const o = this.get(id);
      if (o) out.push(o);
    }
    return out;
  }

  childrenOf(parentId: string | null): CanvasObject[] {
    const ids = this.ensureKids().get(parentId) ?? [];
    const out: CanvasObject[] = [];
    for (const id of ids) {
      const o = this.get(id);
      if (o) out.push(o);
    }
    return out;
  }

  content(id: string): Y.XmlFragment | undefined {
    const c = this.mapOf(id)?.get("content");
    return c instanceof Y.XmlFragment ? c : undefined;
  }

  // ---- writes --------------------------------------------------------------------------------------------

  /** Create one object on top of the z-order. Throws if the object is invalid or its id is taken. */
  create(obj: NewObject): string {
    let id = "";
    this.transact(() => {
      id = this.insert(obj);
    });
    return id;
  }

  createMany(objs: NewObject[]): string[] {
    const ids: string[] = [];
    this.transact(() => {
      for (const o of objs) ids.push(this.insert(o));
    });
    return ids;
  }

  /**
   * Merge `patch` into an object. `id`, `type` and `createdAt` cannot change. A patch that would make the object
   * invalid (NaN, negative size, ...) is ignored and logged. Always touches `updatedAt` (monotonic).
   */
  update(id: string, patch: Partial<CanvasObject>): void {
    this.transact(() => this.updateInternal(id, patch, false));
  }

  /** Remove objects and all their descendants. Arrows bound to a removed object keep their place as free points. */
  remove(ids: string[]): void {
    this.transact(() => this.removeInternal(ids));
  }

  /** Run `fn` as one undoable step (origin LOCAL_ORIGIN). Not atomic: if `fn` throws, earlier writes stay. */
  transact(fn: () => void): void {
    this.depth++;
    try {
      this.ydoc.transact(() => {
        fn();
        if (this.depth === 1) this.flushGroups();
      }, LOCAL_ORIGIN);
    } finally {
      this.depth--;
    }
  }

  undo(): void {
    this.undoManager.undo();
  }
  redo(): void {
    this.undoManager.redo();
  }
  canUndo(): boolean {
    return this.undoManager.canUndo();
  }
  canRedo(): boolean {
    return this.undoManager.canRedo();
  }
  /**
   * Make edits written under `origin` undoable with Cmd+Z, like local edits. Needed for editors that write to a
   * content fragment under their own transaction origin (the Tiptap sync plugin uses its plugin key): without this
   * their typing is not on the undo stack. Edits of other origins (remote peers, persistence) stay untracked, so
   * undo never reverts someone else's work. Returns a function that stops tracking the origin.
   */
  trackOrigin(origin: unknown): () => void {
    this.undoManager.addTrackedOrigin(origin);
    return () => this.undoManager.removeTrackedOrigin(origin);
  }

  /** End the current undo group (call on pointerup) so the next edit is a new step. */
  stopCapturing(): void {
    this.undoManager.stopCapturing();
  }

  /** Subscribe to changes of objects (any origin). Returns the unsubscribe function. */
  onChange(cb: (ids: Set<string>, origin: unknown) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  destroy(): void {
    this.objects.unobserveDeep(this.handleEvents);
    this.ydoc.off("afterTransaction", this.handleAfterTransaction);
    this.undoManager.destroy();
    this.listeners.clear();
  }

  // ---- internals -----------------------------------------------------------------------------------------

  private insert(spec: NewObject): string {
    const now = Date.now();
    const id = spec.id ?? newId();
    if (this.objects.has(id)) throw new Error(`BoardDoc.create: id "${id}" already exists`);
    let index = spec.index;
    if (index === undefined) {
      index = keyBetween(this.topKey(), null);
    }
    const obj = validateObject({ ...spec, id, index, createdAt: now, updatedAt: now });
    if (!obj) throw new Error(`BoardDoc.create: invalid ${String((spec as { type?: unknown }).type)} object`);

    const m = this.objects.set(id, new Y.Map<unknown>());
    for (const [k, v] of Object.entries(obj)) m.set(k, v);
    if (HAS_CONTENT.has(obj.type)) m.set("content", new Y.XmlFragment());

    if (this.top !== undefined && (this.top === null || obj.index > this.top)) this.top = obj.index;
    this.cache.set(id, obj);
    this.warned.delete(id);
    this.fresh.add(id);
    this.invalidateStructure();
    if (obj.parentId) this.dirtyGroups.add(obj.parentId);
    return id;
  }

  private updateInternal(id: string, patch: Partial<CanvasObject>, fromFlush: boolean): void {
    const m = this.mapOf(id);
    const cur = this.get(id);
    if (!m || !cur) return;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (!FROZEN_KEYS.has(k) && v !== undefined) clean[k] = v;
    }
    const next = validateObject({ ...cur, ...clean, updatedAt: Math.max(Date.now(), cur.updatedAt + 1) });
    if (!next) {
      console.warn(`BoardDoc: ignored invalid update of "${id}"`);
      return;
    }
    const nextRec = next as unknown as Record<string, unknown>;
    const curRec = cur as unknown as Record<string, unknown>;
    const changed: string[] = [];
    for (const k of Object.keys(clean)) {
      if (k in nextRec && !sameValue(curRec[k], nextRec[k])) changed.push(k);
    }
    if (changed.length === 0) return;

    for (const k of [...changed, "updatedAt"]) m.set(k, nextRec[k]);
    this.cache.set(id, next);
    this.fresh.add(id);

    if (changed.includes("index") || changed.includes("parentId")) this.invalidateStructure();
    if (changed.includes("index") && this.top !== undefined && next.index > (this.top ?? "")) this.top = next.index;
    if (changed.some((k) => GEOMETRY_KEYS.has(k))) {
      if (cur.parentId) this.dirtyGroups.add(cur.parentId);
      if (next.parentId) this.dirtyGroups.add(next.parentId);
      if (next.type === "group" && !fromFlush) this.dirtyGroups.add(id); // bounds are derived: self-heal
    }
  }

  private removeInternal(ids: string[]): void {
    // Descendant closure over the raw parent links, so invalid children are removed too. Cycle safe.
    const children = new Map<string, string[]>();
    this.objects.forEach((_m, id) => {
      const p = this.mapOf(id)?.get("parentId");
      if (typeof p === "string") {
        const list = children.get(p);
        if (list) list.push(id);
        else children.set(p, [id]);
      }
    });
    const doomed = new Set<string>();
    const stack = ids.filter((id) => this.objects.has(id));
    while (stack.length) {
      const id = stack.pop()!;
      if (doomed.has(id)) continue;
      doomed.add(id);
      for (const c of children.get(id) ?? []) stack.push(c);
    }
    if (doomed.size === 0) return;

    // Unbind arrows that survive but point at something being removed (positions read before deletion).
    for (const o of this.all()) {
      if (o.type !== "arrow" || doomed.has(o.id)) continue;
      const start = this.unbound(o.start, doomed);
      const end = this.unbound(o.end, doomed);
      if (start !== o.start || end !== o.end) this.updateInternal(o.id, { start, end } as Partial<ArrowObj>, false);
    }

    for (const id of doomed) {
      const parent = this.get(id)?.parentId ?? this.rawParent(id);
      if (parent && !doomed.has(parent)) this.dirtyGroups.add(parent);
      this.objects.delete(id);
      this.cache.delete(id);
      this.warned.delete(id);
      this.dirtyGroups.delete(id);
    }
    this.top = undefined;
    this.invalidateStructure();
  }

  /**
   * The object's Y.Map, or undefined when there is none. A damaged or foreign document can hold something else under an
   * object id (a string, a number, a nested array); such entries are not objects and are skipped, never dereferenced.
   */
  private mapOf(id: string): YObj | undefined {
    const m: unknown = this.objects.get(id);
    return m instanceof Y.Map ? (m as YObj) : undefined;
  }

  private rawParent(id: string): string | null {
    const p = this.mapOf(id)?.get("parentId");
    return typeof p === "string" ? p : null;
  }

  private unbound(t: Terminal, doomed: Set<string>): Terminal {
    if (t.kind !== "bound" || !doomed.has(t.id)) return t;
    const target = this.get(t.id);
    if (!target) return t; // dangling already; nothing to resolve
    const p = anchorPoint(target, t.anchor);
    return { kind: "point", x: p.x, y: p.y };
  }

  /** Recompute derived group bounds (and drop empty groups), propagating to parent groups. */
  private flushGroups(): void {
    const seen = new Map<string, number>();
    while (this.dirtyGroups.size > 0) {
      const id = this.dirtyGroups.values().next().value as string;
      this.dirtyGroups.delete(id);
      const n = (seen.get(id) ?? 0) + 1;
      seen.set(id, n);
      if (n > 8) continue; // malformed (cyclic) data: stop propagating
      const g = this.get(id);
      if (!g || g.type !== "group") continue;
      const kids = this.childrenOf(id);
      if (kids.length === 0) {
        this.removeInternal([id]);
        continue;
      }
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const k of kids) {
        const b = boundsOf(k);
        x0 = Math.min(x0, b.x);
        y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w);
        y1 = Math.max(y1, b.y + b.h);
      }
      const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      if (
        Math.abs(g.x - box.x) > EPS ||
        Math.abs(g.y - box.y) > EPS ||
        Math.abs(g.w - box.w) > EPS ||
        Math.abs(g.h - box.h) > EPS ||
        g.rotation !== 0
      ) {
        this.updateInternal(id, { ...box, rotation: 0 }, true);
      }
    }
  }

  private topKey(): string | null {
    if (this.top === undefined) {
      let top: string | null = null;
      this.objects.forEach((_m, id) => {
        const i = this.mapOf(id)?.get("index");
        if (typeof i === "string" && (top === null || i > top)) top = i;
      });
      this.top = top;
    }
    return this.top;
  }

  private invalidateStructure(): void {
    this.order = null;
    this.kids = null;
  }

  private ensureOrder(): string[] {
    if (this.order) return this.order;
    const objs: CanvasObject[] = [];
    this.objects.forEach((_m, id) => {
      const o = this.get(id);
      if (o) objs.push(o);
    });
    objs.sort(compareByIndex);
    this.order = objs.map((o) => o.id);
    return this.order;
  }

  private ensureKids(): Map<string | null, string[]> {
    if (this.kids) return this.kids;
    const kids = new Map<string | null, string[]>();
    for (const id of this.ensureOrder()) {
      const p = this.get(id)?.parentId ?? null;
      const list = kids.get(p);
      if (list) list.push(id);
      else kids.set(p, [id]);
    }
    this.kids = kids;
    return kids;
  }

  private handleEvents = (events: Array<Y.YEvent<Y.AbstractType<unknown>>>, tr: Y.Transaction): void => {
    const touched = new Set<string>();
    for (const ev of events) {
      if (ev.target === this.objects) {
        for (const k of (ev as Y.YMapEvent<YObj>).keysChanged) touched.add(k);
      } else {
        const first = ev.path[0];
        if (typeof first === "string") touched.add(first);
      }
    }
    if (touched.size === 0) return;
    const local = tr.origin === LOCAL_ORIGIN;
    for (const id of touched) {
      if (local && this.fresh.has(id)) continue; // our own write-through entry is exact
      this.cache.delete(id);
      this.warned.delete(id);
      this.invalidateStructure();
      this.top = undefined;
    }
    for (const cb of [...this.listeners]) cb(touched, tr.origin);
  };

  private handleAfterTransaction = (): void => {
    this.fresh.clear();
  };
}

