# Atelier Phase 4 — Planning & Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Atelier a solid supporting tool for planning and diagrams: a full shape library with icons, connectors that route around obstacles and re-route as things move, mind maps, kanban columns, tables, a timer that clients can see, nested boards, and sticky-note power tools; then harden the whole product and release it.

**Architecture:** New object types extend the `CanvasObject` union (schema v3) and plug into the existing registries: `OBJECT_VIEWS`, the shape path generator shared by renderer, hit-testing and export, the `arrowPath` router, `Scene` builder, `ViewerBoard` and clipboard serialiser. Derived layout (mind-map auto-layout, column stacking) is deterministic so two devices converge, and derived writes use `DERIVED_ORIGIN` where they must not become undo steps. Nested boards add one nullable `parent_board_id` with a database trigger guarding cycles and depth. The last two tasks run the whole-product end-to-end journey, accessibility sweep, performance and bundle budgets, and write the release documents.

**Tech Stack:** Phase 1–3 stack. No new runtime dependency (icon data is generated at build time from the already-installed `lucide-react`, ISC).

**Spec:** `atelier/docs/SPEC.md` §2 Phase 4, §3.2 (object list), §6, §8, §10. Earlier plans: `2026-11-12-phase-1-foundation-canvas.md`, `2026-11-12-phase-2-moodboard-power.md`, `2026-11-12-phase-3-present-and-share.md` (names such as `BoardDoc`, `ShapeObj`, `ArrowObj`, `arrowPath`, `SpatialIndex`, `SelectionStore`, `registry`, `StickyObj`, `OBJECT_VIEWS`, `DERIVED_ORIGIN`, `transactAs`, `layoutGrid`, `Scene`, `SceneNode`, `ViewerBoard`, `ViewerObject`, `PasteItem`, `insertPaste`, `searchBoard`, `migrateBoard` come from them).

> **Reconciliation with Phase 1 as built (overrides anything below that disagrees; read the code first):**
> - `assets.id` is a **uuid** (128 random bits in 8-4-4-4-12 hex, `newAssetId()` in `lib/assets/asset-id.ts`), generated on the client; not a 22-char nanoid.
> - R2 keys: `a/{assetId}/w1024.webp` and `a/{assetId}/original` (**no extension**; the Content-Type is signed into the PUT URL). New variants follow `a/{assetId}/w{N}.webp`.
> - The browser reads the public host from `NEXT_PUBLIC_R2_PUBLIC_HOST` (fallback `R2_PUBLIC_HOST`); `lib/assets/resolver.ts` (`AssetResolverImpl`, `getAssetResolver()`), `lib/assets/upload-queue.ts` (`AssetUploader`), `lib/assets/pipeline.ts` (`processImage`) are the real Phase 1 names.
> - All object coordinates are absolute canvas coordinates (children of frames/groups too). Objects returned by `BoardDoc` are immutable: always `update()`.
> - Server routes use `requireOwner()` / `responseFromError(e)` from `lib/server/owner.ts`; `requireOwner` returns 503 in local-only mode.
> - `proxy.ts` open paths and anonymous-identity rejection are as built (see the file); new public paths (`/s/*`, `/api/s/*`, `/share-target`) must be added there deliberately with tests.

## Global Constraints

- Everything in the Phase 1–3 Global Constraints still applies (tokens only, `lucide-react` only, local-first, WCAG 2.2 AA, motion rules, licence check, `ATELIER_LOCAL_ONLY` refused in production, attribution on commits, `docs/PROGRESS.md` updated per task, no secrets in code, share page < 200 KB gz).
- Migration `0004_atelier_phase4.sql` is append-only; schema version becomes **3** (`SCHEMA_VERSION = 3`); `migrateBoard` stays idempotent and old boards open unchanged.
- Derived structure (auto-layout, column stacking, tree repair) must be **deterministic functions of the document** so concurrent devices converge, must write only when the result differs, and must never loop on their own writes (ignore changes whose origin is `DERIVED_ORIGIN`).
- Every new object type needs, in the same phase: a view in `OBJECT_VIEWS`, a `SceneNode` mapping (Task 12), a `ViewerObject` mapping (Task 12), clipboard serialisation (Task 13), a Layers icon and an Inspector section (Task 13). Unknown types must keep rendering as a grey placeholder, never crash (Phase 2 rule).
- Keyboard alternatives for every drag: mind-map keys, table cell navigation, "Move to column…", shape picker by keyboard.
- Text from users (cells, labels, titles, tags, timer labels) is rendered as React text or XML-escaped in exports; never as HTML.
- No new runtime dependency without a licence check; `scripts/check-licences.mjs` (Task 15) enforces the allow-list in CI.

## Review Focus

1. **Connector routing on hostile geometry** (arrow between overlapping or nested objects, zero distance, an endpoint inside another object, 1,000 obstacles in the corridor, NaN/Infinity coordinates, an enclosed start with no free path) → always a finite path within the 8 ms routing budget, falling back to the simple elbow; never an infinite loop. Tests owned by Task 5.
2. **Corrupted tree structure after merges** (device A moves node X under Y while device B moves Y under X; a parent deleted while its child survives; a 5,000-node chain; deleting a collapsed parent) → deterministic repair (the smallest id in a cycle becomes root, orphans become roots), no recursion overflow, both devices converge to the same tree. Tests owned by Task 6.
3. **Spreadsheet paste** (50,000-cell TSV, ragged rows, quoted tabs and newlines, CRLF, `=cmd|…` formulas, `<script>` text, a 100 KB single cell, pasting into an existing table) → truncated at 200 × 50 with an explanatory toast, no freeze, text kept inert, no markup. Tests owned by Task 8.
4. **Nested board abuse** (A contains B contains A, 11 levels deep, a parent owned by another identity, a card whose child is trashed, hard-deleted or unavailable offline) → rejected by the database trigger or shown as an inert card with a clear state; breadcrumb falls back to its cache. Tests owned by Tasks 1 and 10.
5. **Timer correctness** (device clock moved backwards, 0 / negative / 100-hour durations, tab in the background for an hour, a timer running when a round is published, two devices pressing Start together, reduced motion) → display always derives from stored epoch + elapsed, never negative, frozen when published, no per-tick document writes. Tests owned by Task 9.

---

## File map (new unless marked Modify)

```
atelier/
  supabase/migrations/0004_atelier_phase4.sql  supabase/tests/rls.sql (Modify)
  scripts/build-icon-data.mjs  scripts/check-licences.mjs
  app/api/boards/route.ts (Modify)  app/api/boards/[id]/route.ts (Modify)  app/api/boards/[id]/ancestors/route.ts
  components/canvas/objects/ IconView.tsx MindNodeView.tsx ColumnView.tsx TableView.tsx TimerView.tsx BoardCardView.tsx  (ShapeView.tsx ArrowView.tsx StickyView.tsx Modify)
  components/canvas/ MindEdgesLayer.tsx TableEditor.tsx
  components/chrome/ ShapePicker.tsx IconPicker.tsx Breadcrumb.tsx (TopBar.tsx Modify)  components/dialogs/StickyBulkDialog.tsx
  lib/engine/model/ types.ts defaults.ts validate.ts migrate.ts (Modify)
  lib/engine/doc/board-doc.ts (Modify: cells)
  lib/engine/geometry/ shapes.ts route.ts arrow-path.ts (Modify) hit.ts (Modify)
  lib/engine/icons/ icons.ts icon-data.json (generated, gitignored)
  lib/engine/connectors/ arrow-router.ts
  lib/engine/mindmap/ model.ts layout.ts keys.ts
  lib/engine/columns/ columns.ts controller.ts
  lib/engine/tables/ tsv.ts ops.ts cursor.ts
  lib/engine/timer/ timer.ts
  lib/engine/boards/ nested.ts   lib/engine/stickies/ bulk.ts tags.ts color-sets.ts
  lib/engine/export/ scene.ts json-canvas.ts (Modify)   lib/server/viewer-board.ts (Modify)   components/viewer/ViewerCanvas.tsx (Modify)
  bench/budgets.json  tests/unit/** e2e/**  docs/README.md docs/PROGRESS.md docs/DEPLOY.md (Modify)
```

---

### Task 1: Migration `0004_atelier_phase4.sql` — nested boards

**Files:**
- Create: `supabase/migrations/0004_atelier_phase4.sql`
- Modify: `supabase/tests/rls.sql`
- Test: `supabase/tests/rls.sql` via `scripts/test-rls.sh`

**Interfaces:**
- Consumes: `boards` (owner_id, deleted_at), `atelier.is_owner`.
- Produces: `boards.parent_board_id uuid null references atelier.boards(id) on delete set null` + index `boards(owner_id, parent_board_id)`; trigger function `atelier.check_board_parent()` (BEFORE INSERT OR UPDATE OF parent_board_id, `security invoker`) raising `board_parent_self`, `board_parent_owner` (parent's `owner_id` differs), `board_parent_missing`, `board_parent_cycle` (walking up from the new parent reaches `NEW.id`, via a recursive CTE capped at 11 rows) and `board_parent_depth` (the chain above the new parent has ≥ 10 boards, so the maximum nesting depth is 10); function `atelier.board_ancestors(b uuid) returns table (id uuid, title text, depth int)` (`security invoker`, root first, excludes `b` itself, capped at 10 rows).
- [ ] **Step 1: Extend `rls.sql` (failing first), Review Focus #4:** (a) owner A sets a parent on an own board → ok; (b) self parent → `board_parent_self`; (c) A→B→C then setting A's parent to C → `board_parent_cycle`; (d) a chain of 10 boards is accepted, an 11th level is rejected with `board_parent_depth`; (e) user B setting `parent_board_id` to A's board → fails (owner mismatch or RLS), and B inserting a board with A's board as parent → fails; (f) hard-deleting the parent sets the child's `parent_board_id` to null; soft-deleting (`deleted_at`) leaves it; (g) `board_ancestors` of a 3-level chain returns the two ancestors root-first with depths 1, 2; as user B the same call returns zero rows for A's boards; (h) `anon` cannot call `board_ancestors`.
- [ ] **Step 2: Run `scripts/test-rls.sh` → FAIL. Step 3: Write the migration. Step 4: → PASS. Step 5: Commit** `Atelier: phase 4 migration (nested boards)`.

### Task 2: Model v3 — new object types, shape kinds, schema migration, table cells

**Files:**
- Modify: `lib/engine/model/types.ts`, `defaults.ts`, `validate.ts`, `migrate.ts`, `lib/engine/doc/board-doc.ts`, `components/canvas/ObjectLayer.tsx` (placeholder views for new types until their tasks), `lib/engine/model/templates.ts` (unchanged now; Task 7 updates kanban)
- Test: `tests/unit/model-v3.test.ts`, `tests/unit/migrate-v3.test.ts`, `tests/unit/board-cells.test.ts`

**Interfaces:**
- Consumes: Phase 1 `Base`, `ShapeObj`, `ArrowObj`, `StickyObj`, `validateObject`, `BoardDoc`; Phase 2 `SCHEMA_VERSION`, `migrateBoard`, `OBJECT_VIEWS`.
- Produces (exact):
  ```ts
  export type ObjectType = /* Phase 1–2 */ | "icon" | "mindmapNode" | "column" | "table" | "timer" | "boardCard";
  export type ShapeKind = /* Phase 1: rect roundRect ellipse triangle diamond star */
    | "terminator" | "data" | "document" | "predefinedProcess" | "manualInput" | "preparation" | "database" | "delay" | "offPage"        // flowchart
    | "hexagon" | "pentagon" | "octagon" | "cross" | "parallelogram" | "trapezoid" | "cylinder"                                          // polygons
    | "speechRect" | "speechRound" | "speechOval" | "thought"                                                                            // callouts
    | "arrowRight" | "arrowLeft" | "arrowUp" | "arrowDown" | "arrowLeftRight" | "chevron" | "pentagonArrow";                              // block arrows
  // ShapeObj gains: tail: Point  /* normalised to w/h, default {x:0.25,y:1.25}; used only by callouts */
  // ArrowObj gains: avoid: boolean /* default true: elbow routes around obstacles */
  // StickyObj gains: tags: string[] /* <= 8, each matches /^[\p{L}\p{N}_-]{1,24}$/u */
  export interface IconObj extends Base { type: "icon"; name: string /* /^[a-z0-9-]{1,60}$/ */; color: string; strokeWidth: number /* 1..4, default 2 */ }
  export interface MindNodeObj extends Base { type: "mindmapNode"; mindParent: string | null; side: "auto" | "left" | "right"; collapsed: boolean; autoLayout: boolean /* meaningful on a root */; color: string | null; fontSize: number }   // text lives in content fragment
  export interface ColumnObj extends Base { type: "column"; title: string; gap: number /* default 12 */; padding: number /* default 12 */; minH: number /* default 240 */; fill: string | null }
  export interface TableObj extends Base { type: "table"; rowIds: string[] /* 1..200 */; colIds: string[] /* 1..50 */; colWidths: number[] /* one per column, 60..800 */; headerRow: boolean; fontSize: number }
  export interface TimerObj extends Base { type: "timer"; mode: "countdown" | "stopwatch"; durationMs: number /* 1_000..86_400_000 */; state: "idle" | "running" | "paused" | "done"; startedAt: number | null /* epoch ms */; elapsedMs: number; label: string /* <= 60 */; sound: boolean }
  export interface BoardCardObj extends Base { type: "boardCard"; boardId: string /* uuid */; title: string /* <= 200 */; previewAssetIds: string[] /* <= 4 */ }
  // board-doc.ts
  BoardDoc.cells(id: string): Y.Map<string> | undefined      // table cell text, key `${rowId}:${colId}`, value <= 2000 chars
  BoardDoc.ensureCells(id: string): Y.Map<string>
  // migrate.ts: SCHEMA_VERSION = 3; v2 -> v3 adds tags: [] to stickies, tail {0.25,1.25} to shapes, avoid: true to arrows (idempotent)
  ```
  Validation rules: `colWidths.length === colIds.length` (repaired by padding with 160 or truncating), `rowIds`/`colIds` unique non-empty strings (`/^[A-Za-z0-9_-]{1,24}$/`), `durationMs` clamped, `elapsedMs ≥ 0`, `state:"running"` requires `startedAt` (else `paused`), `mindParent` may reference a missing id (repair is Task 6), `boardCard.boardId` must be a UUID, icon `name` pattern enforced, tags normalised and capped, unknown extra fields stripped.
- [ ] **Step 1: Failing tests.** Every new type validates from `defaultsFor` and from a Phase 3 board; invalid cases: icon name `../x`, table with 0 rows or 201 rows, `colWidths` of the wrong length (repaired, assert), timer `durationMs: 0` (clamped to 1000) and `-5` (clamped), timer `running` without `startedAt` (becomes `paused`), board card with `boardId: "x"` (null), sticky with 9 tags (capped at 8) and tag `"a b"` (dropped); `ObjectLayer` renders a placeholder for each new type; `migrateBoard` upgrades a v2 board to v3 with the new defaults, is idempotent (second run produces no Yjs update), and a v4 board opens untouched; `cells`: set in two docs for different cells concurrently, merge → both survive; same cell concurrently → one value (deterministic across both docs); `cells()` of a non-table id is `undefined`; value of 3,000 chars is truncated to 2,000 by `BoardDoc` setter helpers.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; `npm run typecheck`. Step 5: Commit** `Atelier engine: phase 4 object model`.

### Task 3: Full shape library, callouts, block arrows and the shape picker

**Files:**
- Create: `lib/engine/geometry/shapes.ts`, `components/chrome/ShapePicker.tsx`
- Modify: `lib/engine/geometry/hit.ts`, `arrow-path.ts` (outline clipping), `components/canvas/objects/ShapeView.tsx`, `lib/engine/input/tools/shape.ts`, `components/chrome/Toolbar.tsx` (Shapes popover), `components/chrome/ContextBar.tsx` (kind menu, callout tail handle), `lib/engine/export/scene.ts` (shape kinds -> path nodes)
- Test: `tests/unit/shapes.test.ts`, `tests/unit/shape-hit.test.ts`, `tests/unit/shape-picker.test.tsx`

**Interfaces:**
- Consumes: Task 2 `ShapeKind`, `ShapeObj.tail`; Phase 1 `hitTest`, `arrowPath` outline clipping, `ShapeTool`.
- Produces (exact):
  ```ts
  export interface ShapeInfo { kind: ShapeKind; label: string; group: "basic" | "flowchart" | "callout" | "arrow"; keywords: string[]; defaultSize: { w: number; h: number } }
  export const SHAPE_LIBRARY: ShapeInfo[];     // every ShapeKind exactly once; flowchart labels: Process (rect), Decision (diamond), Terminator, Data, Document, Predefined process, Manual input, Preparation, Database, Delay, Off-page reference, Connector (ellipse)
  shapePath(kind: ShapeKind, w: number, h: number, o?: { cornerRadius?: number; tail?: Point }): string     // SVG path `d` in local coordinates (0,0)-(w,h); callout tail may extend outside the body box; all numbers finite for w,h in (0, 1e6]
  shapeOutline(kind: ShapeKind, w: number, h: number, o?: { cornerRadius?: number; tail?: Point }): Point[]   // closed polyline flattening of the path (curves sampled to >= 48 points), used by hit-testing, arrow clipping and export
  rayOutlineIntersection(outline: Point[], from: Point, to: Point): Point | null   // first intersection of the segment from the centre (from) towards to with the outline
  searchShapes(q: string): ShapeInfo[]         // case-insensitive over label + keywords; empty query returns all
  ```
  `hitTest` for new kinds uses point-in-polygon on `shapeOutline` (rotation handled as Phase 1); arrow terminals bound to any shape clip to `rayOutlineIntersection`; text label area for non-rect kinds is the inset body box. The Shapes popover groups the library, has a search field (type-ahead), arrow-key grid navigation (roving tabindex), remembers the last kind (`ShapeTool.kind`), and each button has an accessible name and tooltip. Callout tail: a draggable handle (and Inspector X/Y fields for the keyboard alternative) edits `ShapeObj.tail`.
- [ ] **Step 1: Failing tests.** For **every** `ShapeKind` and sizes `(1,1)`, `(100,60)`, `(10000,10000)`: `shapePath` is non-empty and contains no `NaN`/`Infinity`; `shapeOutline` is closed with ≥ 3 points and finite; `rect` outline is the four corners; polygon area of `hexagon` is within 5 % of the analytic regular-hexagon-in-box area; `speechRect` with default tail has an outline point with `y > h`; `SHAPE_LIBRARY` has one entry per kind with unique labels and `defaultSize` > 0; `searchShapes("arrow")` returns the 7 block arrows, `searchShapes("decision")` returns diamond, `searchShapes("zzz")` is empty; hit tests (centre inside, far corner outside) for all kinds, and the notch of `chevron` is outside; `rayOutlineIntersection` from the centre of a `database` shape towards the right lands on the outline (±0.5); an arrow bound to a `hexagon` ends on its outline; picker: roving focus with arrow keys, `Enter` selects and sets `ShapeTool.kind`, typing "dia" filters, group headings present; scene export of `cylinder` yields a `path` node with a closed `d`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: full shape library`.

### Task 4: Icon objects from Lucide

**Files:**
- Create: `scripts/build-icon-data.mjs`, `lib/engine/icons/icons.ts`, `components/canvas/objects/IconView.tsx`, `components/chrome/IconPicker.tsx`
- Modify: `package.json` (`"prebuild"` and `"pretest"` run the script), `.gitignore` (`lib/engine/icons/icon-data.json`), `components/chrome/Toolbar.tsx` (More menu: Icon), `components/panels/InspectorPanel.tsx` (Icon section), `lib/engine/commands/commands.ts` (`insert.icon`)
- Test: `tests/unit/icons.test.ts`, `tests/unit/icon-view.test.tsx`, `tests/unit/icon-picker.test.tsx`

**Interfaces:**
- Consumes: Task 2 `IconObj`; `lucide-react` (ISC) — one icon family only.
- Produces (exact):
  ```ts
  export type IconNode = [tag: "path" | "circle" | "rect" | "line" | "polyline" | "polygon" | "ellipse", attrs: Record<string, string>][];
  // scripts/build-icon-data.mjs writes lib/engine/icons/icon-data.json = Record<string /* kebab name */, IconNode> by reading the `__iconNode` export of every icon module in the installed lucide-react (names from its dynamic import map); fails the build if fewer than 1,000 icons are found or the shape of a module differs from the expected one
  loadIconData(): Promise<Record<string, IconNode>>       // dynamic import, cached; never in the initial bundle
  getIcon(name: string): Promise<IconNode | null>
  searchIcons(q: string, data: Record<string, IconNode>, limit = 60): string[]    // name substring match, prefix matches first, stable order
  iconNodeToPaths(node: IconNode): string[]               // circle/rect/line/polyline/polygon/ellipse converted to path `d` strings (used by export and the viewer)
  iconSvgInner(node: IconNode): string                    // XML-escaped markup for inline SVG
  ```
  `IconView` renders `<svg viewBox="0 0 24 24" fill="none" stroke={obj.color} stroke-width={obj.strokeWidth} stroke-linecap="round" stroke-linejoin="round">` scaled to the object box (aspect locked square, default 96 × 96), `role="img"` with `aria-label` = icon name; while loading or for an unknown name it renders a neutral "?" placeholder (no crash). Picker (More → Icon, or `insert.icon`): search box, virtualised grid (≤ 200 DOM nodes), arrow-key navigation, Enter inserts at the viewport centre, color and stroke width in the Inspector.
- [ ] **Step 1: Failing tests.** The generated data has ≥ 1,000 icons and `arrow-right` contains a `path`; `iconNodeToPaths([["circle",{cx:"12",cy:"12",r:"10"}]])` returns one `d` starting `M` that is closed; `iconSvgInner` escapes `"` and `<` in attribute values; `searchIcons("arrow")` puts `arrow-right` before `circle-arrow-right`; `validateObject` rejects `name:"../x"`; `IconView` with an unknown name renders the placeholder and no throw, with `arrow-right` renders a `path`; the picker renders ≤ 200 items for an empty query, filters on typing, Enter inserts an object with the chosen name; the icon data chunk is not imported by `app/b/[boardId]/page.tsx` statically (source scan).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; `npm run build`. Step 5: Commit** `Atelier: icon objects`.

### Task 5: Connector routing — straight, elbow with obstacle avoidance, curved, labels, re-route on move

**Files:**
- Create: `lib/engine/geometry/route.ts`, `lib/engine/connectors/arrow-router.ts`
- Modify: `lib/engine/geometry/arrow-path.ts`, `components/canvas/objects/ArrowView.tsx`, `lib/engine/input/tools/arrow.ts` (labels, `avoid`), `components/chrome/ContextBar.tsx` (route, "Avoid objects", label), `lib/engine/commands/commands.ts` (`arrow.editLabel` on Enter when an arrow is selected), `lib/engine/export/scene.ts` (label nodes)
- Test: `tests/unit/route.test.ts`, `tests/unit/arrow-router.test.ts`, `tests/unit/arrow-path.test.ts` (extend), `tests/unit/arrow-label.test.tsx`

**Interfaces:**
- Consumes: Phase 1 `arrowPath`, `ArrowObj`, `Terminal`, `SpatialIndex`, `boundsOf`; Task 2 `ArrowObj.avoid`; Task 3 `shapeOutline`.
- Produces (exact):
  ```ts
  export type Side = "n" | "e" | "s" | "w";
  sideOfAnchor(anchor: Point): Side                 // nearest edge of the unit square; ties resolve in the order e, s, w, n
  export interface RouteInput { start: Point; end: Point; startSide: Side | null; endSide: Side | null; obstacles: Rect[]; margin: number /* 16 */; bendPenalty: number /* 24 */ }
  simpleElbow(start: Point, end: Point, startSide: Side | null, endSide: Side | null): Point[]       // exactly Phase 1's one/two-segment elbow
  routeElbow(i: RouteInput, budgetMs = 8): Point[]
  //   orthogonal polyline, always >= 2 finite points. Hanan-style grid from the x/y of start, end and every obstacle edge ± margin; A* with cost = length + bendPenalty × bends; leaves the start along startSide and enters the end along endSide with a `margin` stub; obstacles contained or touched by the terminals are ignored; falls back to simpleElbow when no path, when the grid exceeds 4,000 nodes, when the time budget is exceeded, or when any input coordinate is not finite (then straight [start,end] with sanitised points)
  polylineToPath(points: Point[], cornerRadius: number): string      // rounded corners, radius clamped to half the shortest adjacent segment
  curvePath(start: Point, end: Point, startSide: Side | null, endSide: Side | null): { d: string; mid: Point }   // cubic Bézier, control offsets = clamp(distance × 0.4, 40, 200) along the side normals
  class RouteCache { constructor(max = 2000); get(key: string): Point[] | undefined; set(key: string, p: Point[]): void; clear(): void }
  routeKey(i: RouteInput): string
  // arrow-path.ts (backwards compatible: Phase 1 callers pass two arguments)
  arrowPath(a: ArrowObj, resolve: (id: string) => CanvasObject | undefined, opts?: { obstacles?: Rect[]; cache?: RouteCache }): { d: string; start: Point; end: Point; labelAt: Point; points?: Point[] }
  //   labelAt = midpoint of the longest segment (elbow) or the curve midpoint; elbow uses routeElbow only when a.avoid && opts.obstacles
  // arrow-router.ts
  obstaclesFor(a: ArrowObj, ctx: { index: SpatialIndex; get(id: string): CanvasObject | undefined }, maxCount = 400): Rect[]
  //   bounds of non-frame, non-group, non-arrow, non-stroke objects intersecting the corridor = union(start,end) expanded by 25 % + 200 px, excluding the arrow's bound targets and their ancestors; if more than maxCount, the maxCount nearest to the straight line
  class ArrowRouter { constructor(doc: BoardDoc, index: SpatialIndex, cache?: RouteCache); route(arrowId: string): ReturnType<typeof arrowPath> | null; invalidate(changedIds: Set<string>): string[] /* arrow ids to re-render */; destroy(): void }
  //   re-routes an arrow when it, a bound target, or any object whose old/new bounds intersect its corridor changed; during a drag only arrows bound to moving objects re-route each frame, the rest on settle
  ```
  Labels: `ArrowObj.label` (plain text ≤ 120) renders as a chip centred on `labelAt` (token surface background, text only); double-click on an arrow or Enter with an arrow selected opens an inline input; empty label draws no chip; labels are exported by the scene builder.
- [ ] **Step 1: Failing tests (Review Focus #1).** `sideOfAnchor({x:1,y:.5})` = `"e"`, `{x:.5,y:.5}` = `"e"` (tie order), `{x:.1,y:.9}` = `"w"`. `routeElbow`: two boxes with a third box between them → no segment intersects the margin-expanded third box, all segments axis-aligned, ≤ 4 bends, first segment leaves along `startSide`; start inside an obstacle's margin is accepted (that obstacle ignored); enclosed start (obstacles forming a closed ring) → returns `simpleElbow` result, finite; 1,000 obstacles → completes in < 50 ms with `budgetMs 8` and returns finite points; `NaN`/`Infinity`/`1e308` input → finite two-point result; zero distance → 2 points; identical inputs → identical output (deterministic); cache hit returns the cached array and does not rerun the search (spy). `curvePath` starts and ends exactly at the inputs; `polylineToPath` with radius larger than segments does not overshoot. `obstaclesFor` excludes bound targets and their frame ancestors, caps at 400 nearest. `ArrowRouter`: moving a bound shape invalidates exactly its arrows; moving an object inside a corridor invalidates that arrow only; moving a far-away object invalidates none; an elbow arrow re-routes around an obstacle dragged into its path within one change event; `arrowPath` Phase 1 two-argument tests still pass. Labels: chip at `labelAt`, escaped text (`<b>` literal), Enter opens the input, Escape cancels, empty removes the chip, 121 chars truncated.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: connector routing and labels`.

### Task 6: Mind maps — Tab child, Enter sibling, auto-layout, collapse, tree repair

**Files:**
- Create: `lib/engine/mindmap/model.ts`, `layout.ts`, `keys.ts`, `components/canvas/objects/MindNodeView.tsx`, `components/canvas/MindEdgesLayer.tsx`
- Modify: `components/canvas/ObjectLayer.tsx` (skip nodes hidden by collapse; edges layer), `lib/engine/input/tools/select.ts` (hit candidates skip hidden nodes), `components/chrome/Toolbar.tsx` (More: Mind map), `lib/engine/commands/commands.ts`, `lib/engine/doc/board-doc.ts` (repair hook after remote updates)
- Test: `tests/unit/mindmap-model.test.ts`, `tests/unit/mindmap-layout.test.ts`, `tests/unit/mindmap-keys.test.ts`, `tests/unit/mindmap-sync.test.ts`

**Interfaces:**
- Consumes: Task 2 `MindNodeObj`, `DERIVED_ORIGIN`, `transactAs`; Phase 1 `BoardDoc.content`, `measureTextHeight`, `SelectionStore`, `registry`; Phase 2 `Placement`.
- Produces (exact):
  ```ts
  childrenOfMind(doc: BoardDoc, id: string | null): MindNodeObj[]          // by index; null = roots (mindParent null)
  rootOf(doc: BoardDoc, id: string): string                                // cycle-safe walk (stops on revisit, depth cap 5,000)
  repairMindTree(doc: BoardDoc): number
  //   one transactAs(DERIVED_ORIGIN): (1) mindParent pointing to a missing node -> null; (2) every cycle: the member with the lexicographically smallest id gets mindParent null; idempotent; returns number of nodes changed; deterministic so two devices repairing independently converge
  addChild(doc: BoardDoc, parentId: string, text?: string): string
  addSibling(doc: BoardDoc, id: string, text?: string): string              // for a root: adds a child instead
  reparent(doc: BoardDoc, id: string, newParentId: string | null): boolean  // false (no change) when newParentId is id or a descendant of id
  removeSubtree(doc: BoardDoc, id: string): string[]                        // iterative; returns removed ids
  toggleCollapse(doc: BoardDoc, id: string): void
  isHiddenByCollapse(doc: BoardDoc, id: string): boolean                    // any ancestor collapsed; cycle-safe
  measureNodeSize(text: string, fontSize: number): { w: number; h: number } // min 80×36, wraps at 280 px
  export interface MindLayoutNode { id: string; w: number; h: number; side: "auto" | "left" | "right"; collapsed: boolean; children: MindLayoutNode[] }
  layoutMindMap(root: MindLayoutNode, o: { origin: Point; levelGap: number /* 80 */; siblingGap: number /* 16 */ }): Placement[]
  //   root centred at origin; for root children with side "auto" assign each subtree (in order) to the side with the smaller accumulated height, "left"/"right" respected; each subtree is vertically centred on its parent; collapsed nodes' children are omitted; no overlaps
  mindEdgePath(parent: Rect, child: Rect, side: "left" | "right"): string  // smooth cubic from parent edge midpoint to child edge midpoint
  relayout(doc: BoardDoc, rootId: string): void                              // inside the caller's transaction when root.autoLayout; writes only changed positions
  // keys.ts: with exactly one MindNodeObj selected and not editing: Tab -> addChild + edit; Enter -> addSibling + edit; Shift+Tab -> select parent; arrows -> parent / first child / previous / next sibling; Space -> toggleCollapse; Delete -> removeSubtree + toast "Deleted N nodes · Undo"
  // commands: mindmap.create (root "Central idea", autoLayout true), mindmap.relayout, mindmap.toggleAutoLayout
  ```
  Behaviour: with `autoLayout` on, every structure or size change relayouts the whole map in the **same** transaction (one undo step); dragging a node in an auto-layout map re-parents it when dropped on another node, otherwise it springs back; collapsed nodes show a "+N" badge; edges are drawn from the derived tree (no `ArrowObj` is created); hidden (collapsed) nodes stay in the document but are not rendered or hit-tested; remote updates trigger a debounced (300 ms) `repairMindTree`.
- [ ] **Step 1: Failing tests (Review Focus #2).** Model: `addChild`/`addSibling` order by index; `reparent` into own descendant returns false and changes nothing; `removeSubtree` of a 5,000-deep chain completes without stack overflow and removes all; `rootOf` and `isHiddenByCollapse` terminate on a 2-node cycle. **Sync:** two docs start from one map; A reparents X under Y, B reparents Y under X; exchange updates; both docs now contain a cycle; `repairMindTree` on each yields identical trees (compare `objectsFromState`) with the smaller id as root; running it again changes nothing; a parent deleted on one device while the other adds a child → the child becomes a root. Layout: random trees (100 seeded, up to 60 nodes) never overlap (AABB check with gutter), every child is to the correct side of its parent, `auto` root with 6 equal children splits 3/3; collapsed subtree omitted; 5,000 nodes lay out in < 400 ms; `relayout` writes nothing when positions are already correct. Keys: Tab on a selected node adds a child and enters edit; Enter adds a sibling; Enter on the root adds a child; Space toggles collapse and hides descendants from `ObjectLayer`; Delete shows an undo toast and one undo restores the subtree; arrows navigate. Undo of "Tab" removes the node and restores positions in one step.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: mind maps`.

### Task 7: Columns / kanban container with auto-stacking

**Files:**
- Create: `lib/engine/columns/columns.ts`, `controller.ts`, `components/canvas/objects/ColumnView.tsx`
- Modify: `lib/engine/input/tools/select.ts` (use `containerAt`/`acceptsDrop`), `lib/engine/model/templates.ts` (kanban template uses columns), `components/chrome/Toolbar.tsx` (More: Column), `components/chrome/ContextBar.tsx` ("Move to column…" menu, Add column), `lib/engine/commands/commands.ts`
- Test: `tests/unit/columns.test.ts`, `tests/unit/column-controller.test.ts`, `tests/unit/select-columns.test.ts`, `tests/unit/templates.test.ts` (extend)

**Interfaces:**
- Consumes: Task 2 `ColumnObj`; Phase 1 select tool reparenting, `keyBetween`, `BoardDoc.transact`/`transactAs`, `templates`.
- Produces (exact):
  ```ts
  export const CONTAINER_TYPES = ["frame", "column"] as const;
  acceptsDrop(container: CanvasObject, obj: CanvasObject): boolean   // frame accepts everything except frames; column accepts sticky, text, image, video, shape, link, embed, swatch, typeSpecimen, table, icon, timer, boardCard and mindmap roots — never column, frame, arrow, stroke
  containerAt(doc: BoardDoc, index: SpatialIndex, p: Point, exclude: Set<string>): CanvasObject | null     // top-most frame/column containing p (a column inside a frame wins)
  layoutColumn(col: ColumnObj, children: { id: string; h: number }[]): { placements: { id: string; x: number; y: number; w: number }[]; height: number }
  //   children in the given order from y = col.y + col.padding + 40 (title band), x = col.x + col.padding, width = col.w - 2*col.padding, spacing col.gap; height = max(col.minH, content + padding)
  insertIndexAt(children: { id: string; y: number; h: number }[], pointerY: number): number   // by child centre
  restack(doc: BoardDoc, columnId: string): boolean            // writes only changed child x/y/w and the column h; returns whether anything changed
  class ColumnController { constructor(doc: BoardDoc); start(): void; stop(): void }
  //   on changes to a column's children (size, order, membership) restacks within transactAs(DERIVED_ORIGIN); ignores its own origin; deterministic
  // select tool: dropping an object on a column reparents it with an `index` from insertIndexAt (keyBetween) and restacks in the SAME user transaction (one undo step); dragging a card out un-parents it and restacks; dragging within a column shows an insertion marker line and reorders
  // commands: column.add (adds a column to the right of the selection or last column), object.moveToColumn (menu listing columns by title — the non-drag alternative)
  ```
  Deleting a column removes its cards (same rule as frames, undoable). The Phase 1 `kanban` template becomes three columns "To do / Doing / Done" with example stickies placed by `restack`.
- [ ] **Step 1: Failing tests.** `layoutColumn`: three 100-high cards, gap 12, padding 12 → y offsets `52, 164, 276` relative to the column top, width = col.w − 24, height ≥ minH; `insertIndexAt` between card 1 and 2 returns 1, above all 0, below all n. `acceptsDrop` table (column rejects column/arrow/stroke/frame). Select tool: drop a sticky at y between two cards inserts at index 1 with an `index` key between theirs, parentId = column, positions restacked, **one** undo step restores; dragging a card out of the column un-parents it and leaves no gap; dragging a column moves its cards; column inside a frame resolves to the column; `object.moveToColumn` moves via menu without pointer. Controller: a sticky growing taller (text edit) restacks the cards below within `DERIVED_ORIGIN` (undo of the text edit alone does not leave stale positions); `restack` idempotent (second call returns false and produces no Yjs update); two devices dropping different cards into the same column concurrently converge to identical positions after exchanging updates; 200 cards restack in < 50 ms; template test: kanban builds valid objects with 3 columns and cards whose `parentId` are the columns.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: kanban columns`.

### Task 8: Tables — simple grid of text cells, row/column editing, spreadsheet paste

**Files:**
- Create: `lib/engine/tables/tsv.ts`, `ops.ts`, `cursor.ts`, `components/canvas/objects/TableView.tsx`, `components/canvas/TableEditor.tsx`
- Modify: `lib/engine/clipboard/parse.ts` (`PasteItem` gains `table`), `lib/engine/clipboard/serialize.ts` (`insertPaste` table branch), `components/canvas/useClipboard.ts` (toast on truncation), `components/chrome/Toolbar.tsx` (More: Table), `components/chrome/ContextMenu.tsx` (row/column items), `lib/engine/commands/commands.ts`
- Test: `tests/unit/tsv.test.ts`, `tests/unit/table-ops.test.ts`, `tests/unit/table-cursor.test.ts`, `tests/unit/table-paste.test.ts`, `tests/unit/table-view.test.tsx`

**Interfaces:**
- Consumes: Task 2 `TableObj`, `BoardDoc.cells/ensureCells`; Phase 1 `parseClipboard`, `PasteItem`, `insertPaste`, `measureTextHeight`, `toast`, `newId`.
- Produces (exact):
  ```ts
  export const TABLE_LIMITS = { rows: 200, cols: 50, cellChars: 2000 } as const;
  parseTsv(text: string, o?: { maxRows?: number; maxCols?: number }): { rows: string[][]; truncated: boolean }
  //   delimiter tab; RFC-4180-style quoting (a quoted field may contain tabs and newlines, "" escapes a quote); \r\n and \r normalised; one trailing empty line dropped; ragged rows padded to the widest row; control characters except \n removed; cells over 2,000 chars truncated; rows/cols beyond the limits dropped with truncated = true
  looksLikeSpreadsheet(input: { html?: string; text?: string }): boolean   // html with a <table> of >= 2 cells, or text of >= 2 lines where every line has >= 2 tab-separated fields (ragged by at most 1)
  parseHtmlTable(html: string): string[][] | null        // first <table> via DOMParser; cell text only (innerText), no markup retained
  // PasteItem += { kind: "table"; rows: string[][]; truncated: boolean }   order in parseClipboard: atelier payload > files > table > url > text; single-column multi-line text is NOT a table
  createTable(doc: BoardDoc, rows: string[][], at: Point): string          // new TableObj with fresh row/col ids, colWidths 160, headerRow true, cells set
  getCell(doc: BoardDoc, id: string, rowId: string, colId: string): string; setCell(doc: BoardDoc, id: string, rowId: string, colId: string, text: string): void
  addRow(doc: BoardDoc, id: string, index: number): string; removeRow(doc: BoardDoc, id: string, rowId: string): boolean   // refuses to remove the last row
  addCol(doc: BoardDoc, id: string, index: number): string; removeCol(doc: BoardDoc, id: string, colId: string): boolean   // refuses the last column; removing drops that column's cells
  resizeCol(doc: BoardDoc, id: string, colId: string, width: number): void                                                 // clamped 60..800
  tableSize(t: TableObj, rowHeights: number[]): { w: number; h: number }
  rowHeights(doc: BoardDoc, t: TableObj, measure?: (text: string, widthPx: number, fontSize: number) => number): number[]  // max over cells of measure(...)+12, min 32
  pasteIntoTable(doc: BoardDoc, id: string, at: { row: number; col: number }, rows: string[][]): { applied: number; truncated: boolean }   // overwrites from the cursor, growing rows/cols up to the limits
  tableToTsv(doc: BoardDoc, id: string, range?: { r0: number; c0: number; r1: number; c1: number }): string
  export interface TableCursor { row: number; col: number }
  moveCursor(t: TableObj, c: TableCursor, key: "Tab" | "Shift+Tab" | "Enter" | "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight", opts: { appendRowAtEnd: boolean }): { cursor: TableCursor; appendRow: boolean }
  ```
  Editing: double-click a cell or Enter on a selected table opens a plain-text `<textarea>` (no rich text); Tab/Shift+Tab/Enter/arrows move the cursor; Tab at the last cell appends a row; Escape leaves; the header row is bold with a token tint; column borders can be dragged and the Inspector has numeric widths (keyboard alternative); context menu: insert row above/below, insert column left/right, delete row/column (disabled when last). Copy of a cell range serialises TSV through `tableToTsv`. Pasting a spreadsheet creates a table at the cursor, or — when a table cell is being edited — fills from that cell; truncation shows the toast "Pasted {n} of {m} rows — tables hold up to 200 × 50".
- [ ] **Step 1: Failing tests (Review Focus #3).** `parseTsv`: `"a\tb\nc\td"` → 2×2; quoted `"x\ty"\tz` keeps the tab inside the first cell; quoted multi-line cell stays one cell; `""` unescapes; `\r\n` and trailing newline handled; ragged `"a\tb\nc"` pads to 2 columns; a 50,000-cell input (500 rows × 100 cols) returns 200 × 50 with `truncated true` in < 200 ms; a 100 KB single cell truncated to 2,000 chars; `=cmd|' /C calc'!A0` and `<script>alert(1)</script>` kept verbatim as text; control characters removed. `looksLikeSpreadsheet`: true for Excel-style html table and for 3 lines of 3 tab fields, false for single-column lines, for one line, and for prose containing a stray tab. `parseClipboard` returns `table` for that text and `text` for a 500-line single-column list (Phase 1 behaviour preserved). Ops: `addRow`/`addCol` indexes and ids unique; `removeRow` of the last row is refused (`false`); removing a column drops its cells; two docs editing different cells concurrently both survive after merge; `resizeCol` clamps; `rowHeights` grows with long text and never below 32; `pasteIntoTable` growing past 200 rows returns `truncated true` and exactly 200 rows; `tableToTsv` quotes cells containing tab/newline/quote and round-trips through `parseTsv`. Cursor: Tab wraps to the next row's first cell, Tab at the last cell requests `appendRow`, Shift+Tab at the first cell stays, Enter moves down, arrows clamp. View: cell text `<img src=x onerror=…>` renders as text, `role="grid"` with `role="gridcell"` cells, selected cell has `aria-selected`; pasting while editing a cell fills from that cell and creating from paste yields one undo step.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: tables`.

### Task 9: Timer object — visible on share links

**Files:**
- Create: `lib/engine/timer/timer.ts`, `components/canvas/objects/TimerView.tsx`
- Modify: `components/chrome/Toolbar.tsx` (More: Timer), `components/present/PresentView.tsx` (timer controls while presenting), `lib/settings.ts` (`timerSound`, default false), `lib/engine/commands/commands.ts`
- Test: `tests/unit/timer.test.ts`, `tests/unit/timer-view.test.tsx`

**Interfaces:**
- Consumes: Task 2 `TimerObj`; Phase 1 `BoardDoc`, `StatusLive`; Phase 3 presentation UI.
- Produces (exact):
  ```ts
  timerAt(t: TimerObj, now: number): { elapsedMs: number; displayMs: number; running: boolean; done: boolean }
  //   running: elapsed = t.elapsedMs + max(0, now - t.startedAt) (a clock that moved backwards contributes 0, never negative); countdown: displayMs = max(0, durationMs - elapsed), done when elapsed >= durationMs; stopwatch: displayMs = elapsed, never done; state "done" or a derived done are both reported done; idle/paused use t.elapsedMs
  formatTimer(ms: number, mode: "countdown" | "stopwatch"): string       // "m:ss" below an hour, "h:mm:ss" above; countdown rounds UP (00:00 only when done), stopwatch floors; clamped 0..359,999,000 ms (99:59:59)
  parseDuration(input: string): number | null      // "90" = 90 s, "5:00" = 5 min, "1:30:00" = 1.5 h; result clamped to 1 s..24 h; invalid -> null
  startTimer(doc: BoardDoc, id: string, now: number): void     // idle/done -> elapsed 0 (countdown) and running; paused -> resume; running -> no-op
  pauseTimer(doc: BoardDoc, id: string, now: number): void     // elapsed = timerAt().elapsedMs, startedAt null, state "paused"
  resetTimer(doc: BoardDoc, id: string): void                  // idle, elapsed 0, startedAt null
  setDuration(doc: BoardDoc, id: string, ms: number): void
  // viewer rule (used by Task 12): round-mode links display timerAt(t, round.publishedAtMs) frozen with the caption "as published"; live-mode links tick using now + serverSkew where serverSkew = ViewerBoard.serverNow − Date.now() at load
  ```
  Rendering: `TimerView` (`role="timer"`, `aria-label` "Timer, 05:00 remaining", `aria-live="off"`) ticks every 250 ms **only while mounted and the page is visible**, recomputing from the epoch on `visibilitychange` (no drift, no per-tick document writes); Start/Pause/Reset buttons (hidden for viewers); the Inspector edits mode, duration (`parseDuration`), label and sound; when a countdown reaches 0 the view flashes three times (no movement under `prefers-reduced-motion`), `StatusLive` announces "Timer finished" once per transition on the device where it is mounted, and a short WebAudio beep plays only if `settings.timerSound && obj.sound` and audio was unlocked by a prior user gesture.
- [ ] **Step 1: Failing tests (Review Focus #5).** `timerAt`: running countdown 5:00 started 60 s ago → `displayMs 240000`; `now` earlier than `startedAt` → elapsed unchanged (not negative); elapsed beyond duration → `done true`, `displayMs 0`; paused uses stored elapsed; stopwatch never done; 100-hour `durationMs` loaded from a corrupt doc is already clamped by validation to 24 h. `formatTimer(1,"countdown")` = `"0:01"`, `(0,…)` = `"0:00"`, `(3_600_000,…)` = `"1:00:00"`, stopwatch `999` → `"0:00"`; `parseDuration("5:00")` = 300000, `"0"` and `"abc"` and `"99:99:99"` → handled (null or clamped), `"1:30:00"` = 5,400,000. Actions: `startTimer` twice leaves one `startedAt`; two docs both pressing Start then merging end up `running` with one of the two `startedAt` values and identical state on both (deterministic LWW) and `timerAt` within 1 s of either; `pauseTimer` then `startTimer` continues from the elapsed value; `resetTimer` idle. View: fake timers advance 1 h with `visibilityState = "hidden"` then visible → display correct immediately, no doc writes during ticks (spy on `doc.ydoc.on("update")` = 0), completion announced once, reduced-motion removes flash class, no beep unless both flags and unlocked audio, viewer variant has no buttons and shows "as published" in round mode.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: timer object`.

### Task 10: Nested boards — board card, breadcrumb, move selection into a child board

**Files:**
- Create: `lib/engine/boards/nested.ts`, `app/api/boards/[id]/ancestors/route.ts`, `components/canvas/objects/BoardCardView.tsx`, `components/chrome/Breadcrumb.tsx`
- Modify: `app/api/boards/route.ts` (`parentBoardId`), `app/api/boards/[id]/route.ts` (PATCH `parentBoardId`), `lib/server/boards.ts`, `lib/sync/board-list-cache.ts` (ancestors store, `parentBoardId` in `BoardSummary`), `components/chrome/TopBar.tsx` (breadcrumb), `app/page.tsx` + `components/home/*` (children hidden from top-level lists, shown on search), `components/chrome/Toolbar.tsx` (More: Board card), `lib/engine/commands/commands.ts`
- Test: `tests/unit/nested-boards.test.ts`, `tests/unit/boards-api-nested.test.ts`, `tests/unit/board-card.test.tsx`, `tests/unit/breadcrumb.test.tsx`

**Interfaces:**
- Consumes: Task 1 trigger and `board_ancestors`; Task 2 `BoardCardObj`; Phase 1 `BoardSummary`, `/api/boards`, `serializeSelection`, `insertPaste`, `BoardDoc.remove`, `toast`, router.
- Produces (exact):
  ```ts
  // BoardSummary += parentBoardId: string | null
  // POST /api/boards { title, parentBoardId?, folderId?, templateId? } ; PATCH /api/boards/[id] { parentBoardId?: string | null }
  //   database exceptions map to 409 { error: "board_parent_cycle" | "board_parent_depth" | "board_parent_owner" | "board_parent_self" | "board_parent_missing" }
  // GET /api/boards/[id]/ancestors -> { ancestors: { id: string; title: string }[] }   root first, excludes the board itself, owner-only
  useBreadcrumb(boardId: string): { crumbs: { id: string; title: string }[]; offline: boolean }   // fetches, caches in IndexedDB; offline returns the cached chain
  placeBoardCard(doc: BoardDoc, summary: Pick<BoardSummary, "id" | "title" | "preview">, at: Point): string
  createChildBoard(deps: { api: BoardsApi; openDoc(id: string): Promise<BoardDoc>; online(): boolean; toast: typeof toast }, parentDoc: BoardDoc, parentBoardId: string, o: { title: string; moveObjectIds?: string[]; at: Point }): Promise<string | null>
  //   requires online (otherwise toast "Connect to the internet to create a sub-board" and null); creates the child board with parentBoardId; when moveObjectIds is given: serialise the selection, insert into the child doc offset to its origin, remove from the parent and put a BoardCardObj at the selection's centre — one parent undo step, whose toast action also soft-deletes the new child board
  type BoardCardState = "ready" | "trashed" | "missing" | "offline-unavailable"
  boardCardState(summary: BoardSummary | undefined, deletedAt: string | null, online: boolean): BoardCardState
  // commands: board.newChild (empty child + card), board.moveSelectionToChild (Mod+Alt+B), board.linkExisting (pick an existing board; cycle attempts rejected by the API and toasted), card.open (double-click / Enter)
  ```
  `BoardCardView` shows the child's title and a mosaic of up to 4 preview assets from the home cache (via `AssetResolver`), states: ready (opens `/b/{id}` on double-click or Enter), trashed ("In trash · Restore" restores via PATCH), missing ("Board unavailable"), offline-unavailable ("Not available offline"); never throws when the summary is absent. Breadcrumb in the TopBar: Home / ancestors / current board, each a link with `aria-label`, current page `aria-current`. Home lists only boards with `parentBoardId = null` unless a search is active. Duplicating a board keeps its board cards pointing at the same children (no deep copy; documented in the UI help text). Share links never expose child boards: `ViewerBoard` renders cards as inert (Task 12).
- [ ] **Step 1: Failing tests (Review Focus #4).** API (fake db raising the trigger errors): create with parent → ok; PATCH making A the child of its own descendant → 409 `board_parent_cycle`; 11th level → 409 `board_parent_depth`; parent owned by another identity → 409/404 and nothing written; non-owner → 403; `ancestors` returns root-first, owner-only, empty for a root board. `createChildBoard`: offline → toast + null and no API call; with `moveObjectIds` of 5 objects incl. a bound arrow pair → child doc contains 5 valid objects, parent has a `BoardCardObj` and none of the 5, one parent undo restores them and the toast action calls PATCH `deletedAt` on the child; `boardCardState` table (summary missing → `missing`, `deletedAt` set → `trashed`, offline and no cache → `offline-unavailable`); card view renders each state, never throws without a summary, double-click calls `router.push("/b/{id}")`, Enter also, Restore calls PATCH. Breadcrumb renders the chain with `aria-current="page"` on the last item and, with fetch failing, renders the cached chain with an "offline" hint. Home: a board with a parent is absent from Recent but present in search results.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: nested boards`.

### Task 11: Sticky power — bulk create, tags, colour sets

**Files:**
- Create: `lib/engine/stickies/bulk.ts`, `tags.ts`, `color-sets.ts`, `components/dialogs/StickyBulkDialog.tsx`
- Modify: `components/canvas/useClipboard.ts` (paste offer), `components/canvas/objects/StickyView.tsx` (tag chips), `components/panels/InspectorPanel.tsx` (Tags, colour set), `components/panels/LayersPanel.tsx` (tag filter), `components/chrome/ContextBar.tsx` (sticky colour set menu), `lib/engine/commands/commands.ts`
- Test: `tests/unit/sticky-bulk.test.ts`, `tests/unit/sticky-tags.test.ts`, `tests/unit/sticky-dialog.test.tsx`

**Interfaces:**
- Consumes: Phase 1 `StickyObj`, `StickyColor`, `StickySize`, `STICKY_COLORS`, paste split prompt (Task 16), `toast`; Phase 2 `layoutGrid`, `BoardDoc.meta.gutter`; Task 2 `StickyObj.tags`.
- Produces (exact):
  ```ts
  export type ListSplitMode = "lines" | "paragraphs" | "bullets";
  parseList(text: string, mode: ListSplitMode, o?: { max?: number /* 1000 */ }): { items: string[]; truncated: boolean }
  //   lines: split on newlines, trim, drop empties, strip a leading marker (-, *, •, –, "1.", "1)", "[ ]", "[x]"); paragraphs: split on blank lines, inner newlines kept; bullets: only marker lines start an item, other lines continue the previous one joined by a space; a single very long line is kept whole (the sticky grows)
  detectListMode(text: string): ListSplitMode | null     // < 2 non-empty lines -> null; >= 60 % of lines have a marker -> "bullets"; else "lines"
  normaliseTag(raw: string): string | null               // trim, strip leading "#", lowercase, must match /^[\p{L}\p{N}_-]{1,24}$/u
  setTags(doc: BoardDoc, ids: string[], tags: string[], op: "add" | "remove" | "set"): void   // unique, max 8 per sticky, one undo step
  tagsInUse(doc: BoardDoc): { tag: string; count: number }[]    // by count desc then name
  class TagFilter { get tag(): string | null; set(tag: string | null): void; subscribe(cb: () => void): () => void }   // view only: ObjectLayer dims stickies without the tag to 25 %
  export interface StickyColorSet { id: string; name: string; colors: StickyColor[] }
  export const STICKY_COLOR_SETS: StickyColorSet[]       // pastel: yellow, peach, pink, lilac, blue, mint · status: mint, yellow, peach · warm: yellow, peach, pink, sand · cool: blue, mint, lilac, grey · mono: sand, grey
  createStickies(doc: BoardDoc, items: string[], o: { at: Point; colorSet: StickyColorSet; assign: "cycle" | "single"; size: StickySize; tags: string[]; columns?: number }): string[]
  //   one transaction; grid via layoutGrid with gutter = doc.meta.gutter and columns default ceil(sqrt(n)) (max 8); colours cycle through the set by index or all use colors[0]; content fragment = one plain paragraph per sticky; tags normalised
  recolourWithSet(doc: BoardDoc, ids: string[], set: StickyColorSet, assign: "cycle" | "single"): void
  ```
  Paste behaviour (extends Phase 1 Task 16): pasting ≥ 2 list lines (≤ 200) still creates one text object but shows the toast action "Make N stickies" which opens the bulk dialog prefilled; > 200 lines keeps the Phase 1 prompt ("Split into N stickies?") and now opens the dialog; the dialog has a textarea, split mode radios, colour-set select with swatches, size, tags input, live count "Create 12 stickies", hard cap 1,000 with the notice "Only the first 1,000 lines were used". Tags show as text chips ("#risk") on the sticky and in the Inspector; `⌘K` "Filter by tag…" and the Layers header set the `TagFilter`.
- [ ] **Step 1: Failing tests.** `parseList("- a\n* b\n• c\n1. d\n2) e\n[ ] f\n[x] g","lines")` → 7 items stripped; paragraphs mode keeps inner newlines; bullets mode joins continuation lines; 5,000 lines → 1,000 items and `truncated true`; Unicode and emoji kept; 3,000-char line kept whole; `detectListMode` for one line → null, for bullets → "bullets", for plain lines → "lines". `normaliseTag("#Design ")` = `"design"`, `"a b"` = null, 25 chars = null; `setTags` `add` caps at 8 and dedupes, `remove`, `set`, one undo step; `tagsInUse` counts. `createStickies` 12 items with the pastel set → 12 valid stickies, grid positions with 16 px gutter, colours cycle yellow→peach→…, `assign:"single"` all yellow, tags applied, one undo step, 1,000 items < 500 ms; `recolourWithSet` cycles by order. Dialog: preview count updates when the mode changes, Create inserts stickies and closes, Escape cancels with focus returned, 1,001-line input shows the cap notice; paste of 12 list lines shows the "Make 12 stickies" toast action, paste of 3 words on one line does not; TagFilter dims non-matching stickies (`data-dimmed`) and clears on `null`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: sticky bulk create, tags and colour sets`.

### Task 12: New object types in export, JSON Canvas, backup and the share viewer

**Files:**
- Modify: `lib/engine/export/scene.ts`, `lib/engine/export/json-canvas.ts`, `lib/engine/export/backup.ts`, `lib/viewer/viewer-types.ts`, `lib/server/viewer-board.ts`, `components/viewer/ViewerCanvas.tsx`, `components/viewer/SlideDeck.tsx`, `lib/engine/icons/icons.ts`
- Test: `tests/unit/scene-phase4.test.ts`, `tests/unit/json-canvas-phase4.test.ts`, `tests/unit/viewer-board-phase4.test.ts`, `tests/unit/viewer-phase4.test.tsx`, `tests/unit/backup-phase4.test.ts`

**Interfaces:**
- Consumes: Tasks 2–11; Phase 3 `Scene`, `SceneNode`, `buildScene`, `toJsonCanvas`, `ViewerBoard`, `buildViewerBoard`, `timerAt`.
- Produces (exact):
  ```ts
  // scene.ts additions (all expressed with existing SceneNode kinds)
  //   shape kinds -> path nodes via shapePath (Task 3); icon -> stroke-only path nodes via iconNodeToPaths; column -> rect + title text; table -> one rect per cell, border lines, text lines per cell (header bold); mindmapNode -> rounded rect + text; mind-map edges -> path nodes from mindEdgePath for visible children; timer -> rect + "m:ss" text (frozen at export time; label added); boardCard -> rect + title text + "Sub-board" caption; arrow labels (Task 5) -> rect chip + text
  // json-canvas.ts additions: mindmapNode -> text node plus an edge per derived parent/child link; table -> text node with a Markdown table; column -> group node (label = title) containing its cards by position; timer -> text node "Timer: label m:ss"; boardCard -> text node "Sub-board: title"; icon -> skipped with a warning; shapes of new kinds with a label -> text node
  // viewer-types.ts
  export interface ViewerBoard { /* Phase 3 fields */ icons: Record<string, IconNode>; serverNow: number /* epoch ms */; snapshotAtMs: number | null /* round.publishedAt, null in live mode */ }
  export type ViewerObject = /* Phase 3 */ CanvasObject & { blocks?: RichBlock[]; cells?: Record<string, string> };
  ```
  Viewer builder rules: `boardCard` is sent as `{ …, boardId: "" }` (cards are inert on share links; title only); table `cells` flattened into `cells`; mind-map and column text as `blocks`/`title`; `icons` contains only the icons used (from the server's copy of the icon data); timers carry their stored fields and the viewer computes the display per Task 9's viewer rule; everything validated again by `validateObject`; embed/link rules unchanged. Viewer renderers (light, no Yjs): `IconSvg`, `TableGrid`, `MindEdges`, `ColumnBox`, `TimerDisplay` (read-only, `role="timer"`), `BoardCardInert`; the share page stays < 200 KB gz (re-run `npm run size`; icon data is **not** bundled, only inlined per board).
- [ ] **Step 1: Failing tests.** Scene: each new type yields the documented nodes with finite numbers; a table of 3×2 produces 6 cell rects; collapsed mind-map descendants produce no nodes or edges; a timer exports its value as of the export time; `boardCard` export contains the title text and no `boardId`; JSON Canvas: mind map with 4 nodes → 4 text nodes + 3 edges whose ids exist; table → Markdown table text with `|` escaped; column → group node; timer/boardCard → text nodes; icons counted in warnings; all coordinates integers. Viewer builder: `JSON.stringify(board)` has no card `boardId` UUID and no notes, `icons` has exactly the used icon names, a table's cells appear in `cells`, a round-mode timer carries `snapshotAtMs`, live mode `null`; viewer render: table cell `<script>` renders as text, timer shows frozen value with "as published" in round mode and ticks in live mode (fake timers + `serverNow` skew), board card is not a link; `npm run size` (script test with the real manifest in CI) stays < 200 KB gz. Backup: a Phase 4 board (table cells, mind map, column, timer, icon, board card) round-trips through `buildBackup` → `importBackup` with identical objects and cells; the imported board card keeps its `boardId` and renders "Board unavailable" when that board is not accessible; no crash.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; `npm run build && npm run size`. Step 5: Commit** `Atelier: phase 4 objects in exports, backup and share viewer`.

### Task 13: Search, clipboard, Layers and Inspector coverage for the new types

**Files:**
- Modify: `lib/engine/model/search.ts`, `lib/engine/clipboard/serialize.ts`, `lib/engine/clipboard/parse.ts`, `components/panels/LayersPanel.tsx`, `components/panels/InspectorPanel.tsx`, `lib/engine/commands/commands.ts`
- Test: `tests/unit/search-phase4.test.ts`, `tests/unit/clipboard-phase4.test.ts`, `tests/unit/inspector-phase4.test.tsx`, `tests/unit/layers-phase4.test.tsx`

**Interfaces:**
- Consumes: Phase 1 `searchBoard`, `replaceAll`, `serializeSelection`, `insertPaste`, `LayersPanel`, `InspectorPanel`; Tasks 2–11.
- Produces (exact):
  ```ts
  // search.ts: field union becomes "text" | "frameName" | "label" | "cell" | "title" | "tag"
  //   searchBoard also scans table cells (field "cell"), mind-map node text, column titles and timer labels (field "title"/"label"), sticky tags (field "tag", find only — replace never edits tags); replaceAll edits cells through BoardDoc.cells in one undo step and skips tags
  // clipboard: serializeSelection also carries table cells (JSON map per table), mindParent, column/frame parentId and timer state; insertPaste remaps every id reference that points inside the copied set (parentId, mindParent, arrow bindings) to the new ids and nulls references that point outside it; pasted timers are reset to idle; pasted board cards keep their boardId; pasted icons keep their name
  // Layers: one lucide icon per type (shape kinds share "shapes"), column and mind-map roots render as expandable groups; Inspector sections: Column (title, gap, padding, minH), Table (headerRow, fontSize, column widths), Timer (mode, duration, label, sound), Mind node (colour, side, collapsed, autoLayout on root), Icon (name picker, colour, stroke width), Board card (open, relink, title refresh), Shape (kind, callout tail X/Y)
  ```
- [ ] **Step 1: Failing tests.** Search finds "budget" in a table cell, a mind-map node, a column title, a timer label and a sticky tag (`field` correct) and `replaceAll("budget","cost")` changes cells, node text, titles in one undo step but leaves tags unchanged; copy a column with 3 cards and a bound arrow among them → paste creates new ids where the cards' `parentId` points at the new column and the arrow binds to the copied cards; copying only two cards of a mind map keeps their parent link and nulls the link to the uncopied parent; copying a table pastes the same cells in a new table with new row/col ids; a pasted running timer is idle; Layers shows each type with its icon and nests column children; Inspector shows the right section per type, mixed selection shows only common controls, numeric fields commit on Enter/blur.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: search, clipboard and panels for phase 4 objects`.

### Task 14: Phase 4 end-to-end and accessibility specs

**Files:**
- Create: `e2e/shapes.spec.ts`, `e2e/connectors.spec.ts`, `e2e/mindmap.spec.ts`, `e2e/kanban.spec.ts`, `e2e/tables.spec.ts`, `e2e/timer.spec.ts`, `e2e/nested.spec.ts`, `e2e/stickies.spec.ts`, `e2e/a11y-phase4.spec.ts`
- Test: the specs above (run with `ATELIER_LOCAL_ONLY=1`; nested boards use `page.route` stubs for the boards API because local-only mode has no database)

**Interfaces:** consumes everything above; no new production code except fixes the specs expose.
- [ ] **Step 1: Write specs.** (shapes) open the picker with the Shapes button, type "hex", arrow to Hexagon, Enter, draw one; a callout's tail handle moves the tail; keyboard-only: picker reachable and operable. (connectors) two shapes and a blocker between them: elbow arrow routes around the blocker; drag the blocker away → the arrow straightens within one frame; label via Enter, text visible and exported in an SVG download; "Avoid objects" off gives the simple elbow; arrow bound to a hexagon follows it. (mind map) create, Tab ×3, Enter, collapse with Space, auto-layout keeps nodes un-overlapped (compare rects), undo restores; two browser contexts offline reparent X under Y and Y under X, reconnect → both converge to the same tree with no error. (kanban) from the Kanban template drag a card between columns on desktop and with touch pointer events on `phone`, order and auto-stacking correct; "Move to column…" menu works with the keyboard only. (tables) paste a 12×4 TSV from a `ClipboardEvent` → table; Tab through cells and at the end adds a row; paste a 600-row TSV → toast "Pasted 200 of 600 rows"; add/remove row and column from the context menu. (timer) start/pause/reset; reduced-motion emulation removes the flash; a published round shows the frozen "as published" timer in the share viewer and a live-mode link ticks. (nested) create child from selection, breadcrumb "Home / Parent / Child", back, card states (trashed, missing) with stubbed API. (stickies) paste 12 list lines → toast → dialog → 12 stickies in 3 colours, tag filter dims the others. (a11y) axe zero serious/critical on Shapes popover, Icon picker, Sticky bulk dialog, Table editing, Timer inspector, Breadcrumb, Mind-map selected state; every new control reachable by keyboard.
- [ ] **Step 2: Run `npm run e2e` → fix until green on `desktop` and `phone`. Step 3: Commit** `Atelier: phase 4 end-to-end and accessibility tests`.

### Task 15: Hardening and release

**Files:**
- Create: `e2e/journey.spec.ts`, `e2e/a11y-all.spec.ts`, `scripts/check-licences.mjs`, `bench/budgets.json`, `tests/unit/check-licences.test.ts`, `tests/unit/budgets.test.ts`
- Modify: `package.json` (`"licences"`, `"size"`, version `1.0.0`), `.github/workflows/atelier-ci.yml` (licence check, `npm audit --omit=dev --audit-level=high` reported not blocking, size, bench on `main`), `README.md`, `docs/PROGRESS.md`, `docs/DEPLOY.md`, `docs/DEPENDENCIES.md`, `docs/SECURITY.md` (cross-check)

**Interfaces:**
- Consumes: the whole product.
- Produces:
  ```ts
  // scripts/check-licences.mjs: reads every production dependency's package.json licence; allow-list MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0, CC0-1.0, OFL-1.1 (fonts) plus an explicit exceptions map { "web-push": "MPL-2.0" }; exits 1 with a table on any other licence or a missing licence field
  // bench/budgets.json: { "sharePageGzKb": 200, "editorFirstLoadGzKb": <measured at release + 10 %>, "bench": { "p95FrameMs": 20 }, "board500OpenMs": 500, "shareLcpMs": 2500, "shareInteractiveMs": 4000 }; scripts/check-bundle-size.mjs (Phase 3) reads it
  ```
- [ ] **Step 1: Whole-product journey (desktop + phone).** `e2e/journey.spec.ts` follows the SPEC §1 success criteria end to end with `ATELIER_LOCAL_ONLY=1` and the memory share store: create a board from the Moodboard template → drop 6 fixture images → arrange as justified rows → insert palette → add a frame per direction → Present (keyboard and swipe) → publish a round (previews rendered client-side, uploads stubbed) → create a password-protected link with comment permission → in a fresh 375 × 812 context unlock, name, pick/reject/comment/approve → owner sees badges, totals and the comment, replies, resolves → export PNG 2×, PDF deck, ZIP and `.atelier` and import the backup as a new board with equal object count → two contexts edit offline and sync with no lost edit → revoke the link and confirm the visitor is cut off. Every step asserts no console errors and no failed requests other than the intentionally blocked ones.
- [ ] **Step 2: Accessibility sweep.** `e2e/a11y-all.spec.ts` iterates a route/state table — `/login`, `/`, `/settings`, `/inbox`, `/library`, `/b/{id}` with each right panel open (Layers, Inspector, Palette, Inbox, Rounds, History, Feedback), the Share/Export/Publish/Quick-capture/Sticky-bulk dialogs, `/b/{id}/compare`, presentation view, `/s/{token}` in gate, slides, canvas, comment-sheet and approve-dialog states — and asserts zero serious/critical axe violations on `desktop` and `phone`, visible focus on every interactive element sampled by Tab traversal, and that Escape closes every dialog and returns focus to its trigger.
- [ ] **Step 3: Performance and budgets.** Run `npm run bench` (1,000 images, p95 < 20 ms per scenario), the Phase 1 open-500-object test (< 500 ms), `e2e/perf-share.spec.ts` (LCP < 2.5 s, interactive < 4 s on throttled 4G and 4× CPU) and `npm run size` (share page < 200 KB gz; editor first-load recorded and written to `bench/budgets.json`); unit-test that `budgets.json` parses and that the size script fails when a fixture exceeds a budget. Record all numbers in `docs/PROGRESS.md`.
- [ ] **Step 4: Dependencies, errors and health.** `scripts/check-licences.mjs` passes (with the unit test covering a GPL fixture failing and `web-push` passing through the exception); `npm audit --omit=dev --audit-level=high` output is recorded; verify `GET /api/health` returns `{ ok: true, version: "1.0.0" }`, that a thrown client error is written to `error_log` with context and **without** tokens, cookies, passwords or comment text (test with a fixture containing each), and that the local-only flag is still refused with `VERCEL_ENV=production`.
- [ ] **Step 5: Documents.** `README.md`: what Atelier is, feature list per phase, local development, all npm scripts, test types, folder layout, keyboard shortcut table pointing at the command palette. `docs/PROGRESS.md`: a final acceptance matrix of **every** SPEC §2 bullet for Phases 1–4 and every SPEC §8 row with measured value and pass/fail, plus the manual device checks gathered from earlier phases (iPad Safari 1,000 images ≥ 30 fps, Procreate and desktop `.ase` import, Android share-target, iOS push on the installed app, PDF text selectable in a viewer, Pencil drawing and laser). `docs/DEPLOY.md`: complete ordered owner-run runbook — apply migrations `0001`–`0004` with the Supabase MCP `apply_migration` (only after the owner's go-ahead), expose schema `atelier`, owner user + `ATELIER_OWNER_ID`, R2 bucket + CORS (`GET, PUT`, prefixes `a/` and `p/`), the full environment variable table (Phase 1–3 plus `ATELIER_VISITOR_SECRET`, `VAPID_*`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_R2_PUBLIC_HOST`, `ATELIER_STUDIO_NAME`), Vercel project `atelier`, post-deploy smoke checklist, rollback (Vercel promote previous deployment; migrations are forward-only so restore from the Supabase backup), and the known limitations (public R2 URLs, Web Share Target not on iOS, `web-push` MPL-2.0, Google Fonts contacted only for specimen cards, HEIC rejected when the browser cannot decode it). `docs/DEPENDENCIES.md` lists every production dependency with licence and why.
- [ ] **Step 6: Final gate:** `npm run typecheck && npm run lint && npm test && npm run test:security && npm run build && npm run size && npm run licences && npm run e2e && npm run bench` and `scripts/test-rls.sh` all pass; every acceptance item in `PROGRESS.md` is reported passed or failed (a failed item blocks the release and is listed at the top).
- [ ] **Step 7: Commit** `Atelier: whole-product tests, budgets and release documents`. (Tagging `atelier-v1.0.0` and deploying are owner decisions, not part of this task.)

---

## Phase 4 acceptance (from SPEC §2, §8, §10)

Full shape library (flowchart set, callouts, block arrows) and Lucide icon objects · connector routing: straight, elbow with obstacle avoidance, curved, labels, re-route on move · mind map with Tab/Enter, auto-layout and collapse · kanban columns that auto-stack · tables with paste from spreadsheets · timer visible on share links · nested boards with breadcrumb and migration `0004` · sticky bulk create, tags and colour sets · every new type covered by export, backup, JSON Canvas, share viewer, clipboard, search and panels · whole-product end-to-end on desktop and phone, axe sweep, performance and bundle budgets (share page < 200 KB gz) re-run, release documents complete · all tests and CI green.

Deferred by design (SPEC "Later"): live co-editing, opt-in private AI, browser extension, desktop reference overlay, Miro import, end-to-end encrypted private boards.
