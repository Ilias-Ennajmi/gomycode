# Atelier Phase 1 — Foundation & Canvas Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private, installable, offline-first infinite-canvas app where the owner logs in, manages boards, and creates/edits images, text, stickies, shapes, arrows, frames and pen drawings with full editing, clipboard, undo and multi-device sync.

**Architecture:** Next.js app in `atelier/` (same stack as `stash/`). A framework-light canvas engine in `lib/engine/` operates on a Yjs document per board; React renders only on-screen objects inside one camera-transformed layer. Each board persists to IndexedDB first, then syncs Yjs updates to Supabase (schema `atelier`); images go to Cloudflare R2 via presigned PUT URLs.

**Tech Stack:** Next.js 16.3.8, React 19.2.8, TypeScript, Tailwind 4, Supabase (`@supabase/ssr`, `@supabase/supabase-js`), Yjs + y-indexeddb, Tiptap (+ Collaboration extension) for rich text, rbush, perfect-freehand, fractional-indexing, nanoid, zod, lucide-react, Vitest, Playwright + @axe-core/playwright.

**Spec:** `atelier/docs/SPEC.md` (read §1–§6, §8–§11 before starting). Brand assets: `atelier/public/brand/`.

## Global Constraints

- All commands run from `atelier/`. Node 22. Next.js **16.3.8** with `proxy.ts` (not `middleware.ts`); read `node_modules/next/dist/docs/` before using a Next API.
- Colours, fonts, radii, spacing, elevation, z-index and motion come only from `styles/tokens.css`. No raw hex in components.
- Selection/focus accent = brand ink-blue `#2F4A6D` (dark theme `#8FA8CC`); ink `#141414`; paper `#F5F2EC`; never pure white/black canvas.
- UI font Inter; Playfair Display only for the wordmark (already outlined in SVGs).
- One icon family: `lucide-react`. No emoji as UI icons.
- Supabase: existing project `rvbllpkhwakjuahxyfff`, new schema **`atelier`**, RLS enabled on every table; owner check = `auth.uid() = owner_id` **and** server-side `ATELIER_OWNER_ID` env match.
- Every new dependency must be MIT/Apache-2.0/ISC/BSD/OFL; check licence before adding.
- Optimistic, local-first: every edit is written to the Yjs doc (and IndexedDB) before any network call.
- Keyboard-triggered actions never animate. UI motion uses transform/opacity only, ease-out `cubic-bezier(0.23, 1, 0.32, 1)`, popovers 150–200 ms, sheets/modals 200–300 ms, exits faster than enters, buttons scale 0.97 on press, never from scale(0); hover only under `(hover: hover) and (pointer: fine)`; `prefers-reduced-motion` removes movement.
- Accessibility: WCAG 2.2 AA chrome; targets ≥ 24 px (≥ 44 px under `pointer: coarse`); icon buttons have `aria-label`; toolbars use `role="toolbar"` with roving focus; status messages in a polite live region.
- Zoom range 2 %–3200 % (`MIN_ZOOM = 0.02`, `MAX_ZOOM = 32`).
- Secrets only in Vercel env / `.env.local`; never commit or print. No AI model names in code, commits or files.
- Local-only mode (`ATELIER_LOCAL_ONLY=1`: no auth, no sync, for dev/e2e) must be refused when `VERCEL_ENV === "production"`.
- A task is done only when `npm run typecheck`, `npm run lint`, `npm test` (and `npm run build` for tasks touching `app/`) pass. Update `docs/PROGRESS.md` at the end of every task.
- Small commits, one feature each, messages ending with the session's attribution lines.

## Review Focus

1. **Two devices edit the same board offline, then reconnect** → both sets of edits survive, nothing duplicated. Test owned by Task 18.
2. **Odd clipboard/drop input** (500-line text, 60 MB image, unsupported HEIC, malformed Atelier payload, empty clipboard) → no crash; oversize/unsupported shows a toast naming the file; text over 200 lines asks before splitting. Tests owned by Tasks 16 and 17.
3. **Another Supabase identity** (e.g. a Stash anonymous user) calls Atelier API routes or tables → 403 / zero rows; local-only mode refused in production. Tests owned by Tasks 2 and 3.
4. **A board containing invalid or unknown objects** (older/newer schema, missing fields, NaN coordinates) → board opens, bad objects are skipped and logged, never crash. Test owned by Task 5.
5. **Extreme camera input** (zoom-to-fit on an empty board, 10^7 coordinates, wheel deltas of 10^4, pinch to zero distance) → zoom clamps to range, no NaN/Infinity in transforms. Tests owned by Task 7.

---

## File map

```
atelier/
  package.json  tsconfig.json  next.config.ts  postcss.config.mjs  eslint.config.mjs
  vitest.config.ts  playwright.config.ts  proxy.ts  .env.example  CLAUDE.md  AGENTS.md
  app/
    layout.tsx  globals.css  manifest.ts  page.tsx (home)  login/page.tsx  settings/page.tsx
    b/[boardId]/page.tsx
    api/health/route.ts  api/boards/route.ts  api/boards/[id]/route.ts
    api/boards/[id]/updates/route.ts  api/assets/route.ts  api/assets/[id]/complete/route.ts
  components/
    chrome/ TopBar.tsx Toolbar.tsx ContextBar.tsx ContextMenu.tsx ZoomControls.tsx Minimap.tsx StatusLive.tsx Toast.tsx
    panels/ LayersPanel.tsx InspectorPanel.tsx CommandPalette.tsx FindReplace.tsx
    home/ BoardGrid.tsx BoardCard.tsx FolderTree.tsx NewBoardDialog.tsx
    canvas/ CanvasView.tsx ObjectLayer.tsx SelectionOverlay.tsx GuidesOverlay.tsx objects/*.tsx RichTextEditor.tsx
  lib/
    engine/model/   types.ts defaults.ts validate.ts index-order.ts templates.ts
    engine/doc/     board-doc.ts
    engine/geometry/ rect.ts camera.ts transform.ts hit.ts snap.ts arrow-path.ts
    engine/spatial/ spatial-index.ts
    engine/input/   gestures.ts tool-machine.ts tools/*.ts
    engine/commands/ registry.ts commands.ts shortcuts.ts
    engine/clipboard/ serialize.ts parse.ts
    engine/layout/  align.ts
    assets/         pipeline.worker.ts pipeline.ts upload-queue.ts resolver.ts
    sync/           local-store.ts sync-client.ts realtime.ts status.ts
    server/         owner.ts r2.ts boards.ts updates.ts compaction.ts
    supabase/       env.ts client.ts server.ts types.ts
    settings.ts  ids.ts
  public/ brand/* (exists)  sw.js  offline.html
  styles/tokens.css
  supabase/migrations/0001_atelier_init.sql
  supabase/tests/rls.sql  supabase/tests/auth_stub.sql
  tests/unit/**  e2e/**  docs/PROGRESS.md
.github/workflows/atelier-ci.yml
```

---

### Task 1: App scaffold, tokens, tooling and CI

**Files:**
- Create: `atelier/package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `playwright.config.ts`, `.env.example`, `CLAUDE.md`, `AGENTS.md`, `docs/PROGRESS.md`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx` (placeholder), `app/api/health/route.ts`, `styles/tokens.css`, `.github/workflows/atelier-ci.yml`
- Test: `tests/unit/health.test.ts`, `tests/unit/tokens.test.ts`

**Interfaces:**
- Produces: scripts `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `e2e` (`playwright test --trace off`); `GET /api/health` → `{ ok: true, version: string }`; CSS custom properties listed below; path alias `@/*`.

- [ ] **Step 1: Write failing tests.** `health.test.ts`: importing `GET` from `app/api/health/route.ts` and calling it returns status 200 and JSON `{ ok: true }` with a string `version`. `tokens.test.ts`: reads `styles/tokens.css` and asserts it defines `--color-bg`, `--color-surface`, `--color-ink`, `--color-muted`, `--color-border`, `--color-accent`, `--color-danger`, `--color-selection`, `--radius-sm|md|lg`, `--space-1..8` (4 px grid), `--elev-1..3`, `--z-canvas|overlay|toolbar|panel|menu|modal|toast`, `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--dur-fast: 150ms`, `--dur-base: 200ms`, and a `[data-theme="dark"]` block redefining every `--color-*`; and that `--color-accent` is `#2F4A6D` in light and `#8FA8CC` in dark.
- [ ] **Step 2: Run `npm test` → both fail (files missing).**
- [ ] **Step 3: Scaffold.** Copy versions from `stash/package.json` (next 16.3.8, react 19.2.8, tailwind 4, eslint-config-next 16.3.8, vitest). Add `@playwright/test` and `@axe-core/playwright` as dev deps; in `playwright.config.ts` set projects `desktop` (1440×900) and `phone` (iPhone 13), `webServer` = `npm run build && npm start` with env `ATELIER_LOCAL_ONLY=1`; if the pinned Playwright version differs from the pre-installed one, launch with `executablePath: '/opt/pw-browsers/chromium'`. Light paper bg `#F5F2EC` canvas / `#FFFFFF` surfaces; dark bg `#121212`. Inter via `next/font/google` (`display: "swap"`). `CLAUDE.md` mirrors `stash/CLAUDE.md` rules adapted to Atelier (spec path, tokens rule, local-first rule, done-definition, commands). `favicon.svg` + `apple-touch-icon.png` linked from `app/layout.tsx` metadata using `public/brand/`.
- [ ] **Step 4: CI.** `.github/workflows/atelier-ci.yml` modelled on `.github/workflows/reader-ci.yml`: triggers on `atelier/**` and the workflow file; `ubuntu-24.04`; `postgres:16` service (user/pass `atelier`, db `atelier_test`); steps `npm ci`, `typecheck`, `lint`, `test`, `build`, `psql` RLS tests (Task 2), `npx playwright install --with-deps chromium`, `npm run e2e`. No secrets required.
- [ ] **Step 5: Run `npm run typecheck && npm run lint && npm test && npm run build` → all pass.**
- [ ] **Step 6: Commit** `Atelier: app scaffold, tokens and CI`.

### Task 2: Database schema, RLS and SQL tests

**Files:**
- Create: `supabase/migrations/0001_atelier_init.sql`, `supabase/tests/auth_stub.sql`, `supabase/tests/rls.sql`, `scripts/test-rls.sh`
- Test: `supabase/tests/rls.sql` (run by `scripts/test-rls.sh` against `DATABASE_URL`)

**Interfaces:**
- Produces tables in schema `atelier` (columns per SPEC §4): `folders`, `boards` (+ `preview jsonb` = up to 4 asset ids, `deleted_at`), `board_updates (board_id uuid, seq bigserial, update bytea, device_id text, created_at)`, `board_snapshots (board_id, state bytea, upto_seq bigint, kind text check in ('compaction','round'), label text, created_at)`, `assets`, `asset_usages`, `error_log`. (Share/review tables come in Phase 3; do not create them now.)
- Function `atelier.is_owner(owner uuid) returns boolean` = `owner = auth.uid()`.
- Grants: `authenticated` gets select/insert/update/delete on all tables via RLS; `anon` gets nothing.

- [ ] **Step 1: Write `auth_stub.sql`** (creates roles `anon`, `authenticated` if missing, schema `auth`, and `auth.uid()` returning `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid`) — used only in CI/local tests, never applied to Supabase.
- [ ] **Step 2: Write `rls.sql` assertions** as `DO` blocks that `raise exception` on failure: (a) as `authenticated` with sub = owner A, insert a folder, board, update, asset → succeed and select returns them; (b) as `authenticated` with sub = user B → `select count(*)` from each table = 0, update/delete of A's rows affect 0 rows, insert with `owner_id = A` fails; (c) as `anon` → select on `atelier.boards` raises permission denied; (d) `board_updates` insert for a board owned by B by A fails.
- [ ] **Step 3: Run `scripts/test-rls.sh`** (applies stub, migration, tests via `psql -v ON_ERROR_STOP=1`) → FAIL (no migration).
- [ ] **Step 4: Write `0001_atelier_init.sql`**: `create schema atelier`; tables; indexes (`boards(owner_id, deleted_at)`, `board_updates(board_id, seq)`, `assets(owner_id, phash)`); `enable row level security` on all; policies `owner_all` using `atelier.is_owner(owner_id)`; for `board_updates`/`board_snapshots`/`asset_usages` policy via `exists (select 1 from atelier.boards b where b.id = board_id and atelier.is_owner(b.owner_id))`; `revoke all on schema atelier from anon`; `grant usage on schema atelier to authenticated, service_role`.
- [ ] **Step 5: Run `scripts/test-rls.sh` → PASS.**
- [ ] **Step 6: Commit** `Atelier: database schema with row-level security and tests`.

(Applying to Supabase and exposing schema `atelier` in the Data API happens in Task 23.)

### Task 3: Supabase clients, owner guard, login and local-only mode

**Files:**
- Create: `lib/supabase/env.ts`, `client.ts`, `server.ts`, `types.ts`, `lib/server/owner.ts`, `proxy.ts`, `app/login/page.tsx`, `app/login/actions.ts`
- Test: `tests/unit/owner.test.ts`, `tests/unit/proxy.test.ts`

**Interfaces:**
- Produces: `isLocalOnly(env = process.env): boolean` (true only if `ATELIER_LOCAL_ONLY === "1"` and `VERCEL_ENV !== "production"`; throws `Error("Local-only mode is not allowed in production")` if requested in production); `requireOwner(): Promise<{ userId: string; supabase: SupabaseClient }>` for route handlers (throws a 401/403 `Response`); `isOwnerId(id: string | undefined, env = process.env): boolean` comparing to `ATELIER_OWNER_ID`; `createBrowserClient()` / `createServerClient()` bound to schema `atelier` (null when env missing).

- [ ] **Step 1: Failing tests.** `owner.test.ts`: `isOwnerId` true only for the env id, false for undefined/empty/other; `isLocalOnly` false without flag, true with flag in dev, throws with flag + `VERCEL_ENV=production`. `proxy.test.ts`: calling `proxy()` for `/` without a session redirects to `/login?next=%2F`; with a session whose `sub` ≠ owner redirects to `/login?error=not-owner` and signs out; static paths (`/brand/…`, `/sw.js`, `/manifest.webmanifest`, `/offline.html`, `/api/health`) pass through; in local-only mode everything passes.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** modelled on `stash/proxy.ts` and `stash/lib/supabase/*`, but with **no anonymous sign-in**. Login page: email + password fields with visible labels, `autocomplete="username"` / `"current-password"`, show/hide toggle, paste allowed, error text under the field linked by `aria-describedby`; server action `signIn` → Supabase `signInWithPassword`, rejects non-owner (signs out, generic error "This account can't open Atelier"); rate-limit message passthrough. If the user has a verified TOTP factor and session AAL is `aal1`, redirect to `/login/verify` (Task 4).
- [ ] **Step 4: Run tests → PASS; build passes.**
- [ ] **Step 5: Commit** `Atelier: owner-only login and request guard`.

### Task 4: Two-step verification (TOTP)

**Files:**
- Create: `app/login/verify/page.tsx`, `app/settings/page.tsx`, `app/settings/security.tsx`
- Test: `tests/unit/mfa.test.ts`, e2e covered in Task 23 only for page render

**Interfaces:**
- Consumes: `createServerClient`, `requireOwner` (Task 3).
- Produces: `needsSecondFactor(aal: { currentLevel: string|null; nextLevel: string|null }): boolean` (true when `nextLevel === "aal2"` and `currentLevel !== "aal2"`), used by `proxy.ts` to redirect to `/login/verify`.

- [ ] **Step 1: Failing test** for `needsSecondFactor` truth table (aal1→aal2 true; aal2→aal2 false; aal1→aal1 false; nulls false).
- [ ] **Step 2: Run → FAIL. Step 3: Implement** settings "Security" section: Enrol (Supabase `mfa.enroll({ factorType: "totp" })` → show QR SVG + secret, 6-digit code input with `inputmode="numeric" autocomplete="one-time-code"`), verify, remove factor (confirm dialog). Verify page: one 6-digit field, submit → `mfa.challengeAndVerify`. Wire `needsSecondFactor` into `proxy.ts`.
- [ ] **Step 4: Tests pass, build passes. Step 5: Commit** `Atelier: optional two-step verification`.

### Task 5: Object model, defaults, validation and z-order keys

**Files:**
- Create: `lib/engine/model/types.ts`, `defaults.ts`, `validate.ts`, `index-order.ts`, `lib/ids.ts`
- Test: `tests/unit/model.test.ts`

**Interfaces:**
- Produces (exact):
  ```ts
  export type Point = { x: number; y: number };
  export type Rect = { x: number; y: number; w: number; h: number };
  export type ObjectType = "image" | "text" | "sticky" | "shape" | "arrow" | "frame" | "stroke" | "group";
  export interface Base { id: string; type: ObjectType; x: number; y: number; w: number; h: number;
    rotation: number /* radians */; parentId: string | null; index: string; locked: boolean;
    opacity: number /* 0..1 */; createdAt: number; updatedAt: number }
  export interface ImageObj extends Base { type: "image"; assetId: string; crop: Rect | null; flipX: boolean; flipY: boolean }
  export interface TextObj extends Base { type: "text"; fontSize: number; align: "left"|"center"|"right"; lineHeight: number; color: string; autoWidth: boolean }
  export type StickySize = "S" | "M" | "L" | "XL"; // font px 16 / 22 / 30 / 42
  export interface StickyObj extends Base { type: "sticky"; fill: StickyColor; size: StickySize }
  export type ShapeKind = "rect" | "roundRect" | "ellipse" | "triangle" | "diamond" | "star";
  export interface ShapeObj extends Base { type: "shape"; kind: ShapeKind; fill: string|null; stroke: string|null; strokeWidth: number; strokeStyle: "solid"|"dashed"|"dotted"; cornerRadius: number }
  export type Terminal = { kind: "point"; x: number; y: number } | { kind: "bound"; id: string; anchor: Point /* 0..1 within target */ };
  export type Head = "none" | "arrow" | "triangle" | "dot" | "bar";
  export interface ArrowObj extends Base { type: "arrow"; start: Terminal; end: Terminal; route: "straight"|"elbow"|"curved"; startHead: Head; endHead: Head; stroke: string; strokeWidth: number; strokeStyle: "solid"|"dashed"|"dotted"; label: string }
  export interface FrameObj extends Base { type: "frame"; name: string; preset: FramePresetId; background: string|null; clip: boolean; order: string; notes: string }
  export interface StrokeObj extends Base { type: "stroke"; tool: "pen"|"highlighter"; color: string; size: number; points: number[] /* x,y,pressure triples relative to x,y */ }
  export interface GroupObj extends Base { type: "group" } // invisible; bounds = union of children, recomputed by BoardDoc when children change
  export type CanvasObject = ImageObj | TextObj | StickyObj | ShapeObj | ArrowObj | FrameObj | StrokeObj | GroupObj;
  export type NewObject<T extends CanvasObject = CanvasObject> = Omit<T, "id"|"index"|"createdAt"|"updatedAt"> & Partial<Pick<T, "id"|"index">>;
  ```
  `STICKY_COLORS` (8 named: yellow, peach, pink, lilac, blue, mint, sand, grey → token names), `FRAME_PRESETS` (exact): `slide-16-9` 1920×1080, `slide-4-3` 1600×1200, `ig-post-4-5` 1080×1350, `square` 1080×1080, `story-9-16` 1080×1920, `a4` 210×297 mm, `a3` 297×420 mm, `letter` 8.5×11 in, `custom`; `mmToPx(mm, dpi)`; `defaultsFor(type): Omit<…>`; `validateObject(raw: unknown): CanvasObject | null`; `keyBetween(a: string|null, b: string|null): string` (wraps `fractional-indexing`); `newId(): string` (nanoid 12).
  Text/sticky/shape rich content is not in these props: it lives in the object's Yjs map under key `content` (Y.XmlFragment) — see Task 6.

- [ ] **Step 1: Failing tests:** `validateObject` returns a typed object for each type's defaults (all 8 types, including `group`); returns `null` (no throw) for: unknown `type`, missing `x`, `x = NaN`, `w <= 0`, `opacity = 2` (clamped to 1 instead — assert 1), arrow with bound terminal missing `id`; unknown extra fields are stripped; `keyBetween(null, null) < keyBetween(keyBetween(null,null), null)`; 1,000 successive `keyBetween(last, null)` stay sorted; `mmToPx(210, 300) === 2480`.
- [ ] **Step 2: Run → FAIL. Step 3: Implement** with zod schemas (one per type, `.strip()`), clamping opacity to [0,1] and rotation normalised to (−π, π]. **Step 4: PASS. Step 5: Commit** `Atelier engine: object model and validation`.

### Task 6: BoardDoc — Yjs wrapper, transactions, undo, change events

**Files:**
- Create: `lib/engine/doc/board-doc.ts`
- Test: `tests/unit/board-doc.test.ts`

**Interfaces:**
- Consumes: Task 5 types, `validateObject`, `keyBetween`, `newId`.
- Produces:
  ```ts
  export const LOCAL_ORIGIN: unique symbol;
  export class BoardDoc {
    constructor(ydoc?: Y.Doc);
    readonly ydoc: Y.Doc;
    get(id: string): CanvasObject | undefined;          // validated, cached
    all(): CanvasObject[];                               // sorted by index
    childrenOf(parentId: string | null): CanvasObject[];
    content(id: string): Y.XmlFragment | undefined;      // text/sticky/shape label
    create(obj: NewObject): string;                      // assigns id, index (top), timestamps
    createMany(objs: NewObject[]): string[];
    update(id: string, patch: Partial<CanvasObject>): void;
    remove(ids: string[]): void;                         // also removes children; unbinds arrows bound to removed ids (convert to point at current position)
    transact(fn: () => void): void;                      // origin LOCAL_ORIGIN, one undo step
    undo(): void; redo(): void; canUndo(): boolean; canRedo(): boolean;
    stopCapturing(): void;                               // ends current undo group (call on pointerup)
    onChange(cb: (ids: Set<string>, origin: unknown) => void): () => void;
    meta: { get title(): string; set title(v: string); schemaVersion: number };
  }
  ```
  Layout in Yjs: `ydoc.getMap("meta")`, `ydoc.getMap("objects")` → `Y.Map<id, Y.Map>`; each object map holds props as plain values and `content` as `Y.XmlFragment`. `Y.UndoManager` tracks `objects` with `trackedOrigins: new Set([LOCAL_ORIGIN])`, `captureTimeout: 400`.

- [ ] **Step 1: Failing tests:** create→get round trip; `all()` order follows index; `update` changes `updatedAt`; remove frame removes its children; removing an arrow's bound target converts the terminal to a point at the target's anchor position; undo/redo restores a multi-object transaction in one step; remote update (applied with a different origin via `Y.applyUpdate` from a second doc) is **not** undone by `undo()`; `onChange` reports exactly the touched ids; an invalid object written directly into the Y.Map is skipped by `all()` and logged once via `console.warn`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier engine: board document with undo`.

### Task 7: Geometry and camera maths

**Files:**
- Create: `lib/engine/geometry/rect.ts`, `camera.ts`, `transform.ts`, `hit.ts`
- Test: `tests/unit/geometry.test.ts`, `tests/unit/camera.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // rect.ts
  boundsOf(o: Base): Rect                 // AABB of the rotated rect
  unionRects(rs: Rect[]): Rect | null
  intersects(a: Rect, b: Rect): boolean; contains(outer: Rect, inner: Rect): boolean
  // camera.ts
  export type Camera = { x: number; y: number; z: number } // screen = (canvas - {x,y}) * z
  MIN_ZOOM = 0.02; MAX_ZOOM = 32
  screenToCanvas(c: Camera, p: Point): Point; canvasToScreen(c: Camera, p: Point): Point
  zoomAt(c: Camera, screenPoint: Point, factor: number): Camera   // keeps screenPoint fixed, clamps z
  panBy(c: Camera, dxScreen: number, dyScreen: number): Camera
  fitRect(r: Rect | null, viewport: { w: number; h: number }, padding = 64, maxZoom = 1): Camera // null → {0,0,1}
  wheelToZoomFactor(deltaY: number, deltaMode: number, sensitivity: number): number // clamped to [0.5, 2] per event
  // transform.ts
  export type Handle = "nw"|"n"|"ne"|"e"|"se"|"s"|"sw"|"w";
  resizeRect(start: Rect, handle: Handle, delta: Point, opts: { keepAspect: boolean; fromCenter: boolean; minSize: number }): Rect
  rotateAround(p: Point, center: Point, angle: number): Point
  snapAngle(angle: number, stepDeg = 15): number
  // hit.ts
  hitTest(o: CanvasObject, p: Point, tolerance: number): boolean   // rotated rect; ellipse/diamond/triangle exact; arrow/stroke by distance to path ≤ tolerance
  ```
- [ ] **Step 1: Failing tests** incl. Review Focus #5: `zoomAt` keeps the anchor point fixed (±1e-9) and clamps to [0.02, 32]; `fitRect(null, …)` returns `{x:0,y:0,z:1}`; `fitRect` of a 10^7-wide rect gives finite `z ≥ MIN_ZOOM`; `wheelToZoomFactor(10000, 0, 1)` is 0.5 and of −10000 is 2; no function returns NaN for zero-size rects; `resizeRect` with `keepAspect` preserves ratio, never produces w/h < `minSize`, and dragging past the opposite edge flips correctly; `boundsOf` a 100×50 rect rotated 90° is 50×100 around the same centre; hit tests for each shape kind (inside/outside points).
- [ ] **Step 2: FAIL. Step 3: Implement** (pure functions, no DOM). **Step 4: PASS. Step 5: Commit** `Atelier engine: geometry and camera`.

### Task 8: Spatial index and culling

**Files:**
- Create: `lib/engine/spatial/spatial-index.ts`
- Test: `tests/unit/spatial-index.test.ts`

**Interfaces:**
- Consumes: `BoardDoc.onChange`, `boundsOf`.
- Produces: `class SpatialIndex { constructor(doc: BoardDoc); search(r: Rect): string[]; pointCandidates(p: Point, tolerance: number): string[] /* top-most first by index */; visible(c: Camera, viewport: {w:number;h:number}, marginPx = 256): string[]; destroy(): void }` — backed by rbush, kept in sync incrementally via `onChange`.
- [ ] **Step 1: Failing tests:** 10,000 random objects → `search` equals brute-force filter for 50 random rects; moving an object updates results; deleted ids disappear; `pointCandidates` returns top-most first; `visible` includes objects within the margin.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier engine: spatial index`.

### Task 9: Canvas view and object rendering

**Files:**
- Create: `components/canvas/CanvasView.tsx`, `ObjectLayer.tsx`, `objects/ImageView.tsx`, `TextView.tsx`, `StickyView.tsx`, `ShapeView.tsx`, `FrameView.tsx`, `StrokeView.tsx`, `ArrowView.tsx`, `lib/engine/geometry/arrow-path.ts`, `lib/engine/model/rich-text-html.ts`, `app/b/[boardId]/page.tsx` (local-only board for now)
- Test: `tests/unit/arrow-path.test.ts`, `tests/unit/rich-text-html.test.ts`, `tests/unit/object-layer.test.tsx` (jsdom + Testing Library)

**Interfaces:**
- Consumes: `BoardDoc`, `SpatialIndex.visible`, `Camera`, `AssetResolver` (Task 17; until then a stub returning `null`).
- Produces: `<CanvasView doc={BoardDoc} assets={AssetResolver} />` exposing via `ref` a `CanvasHandle { getCamera(): Camera; setCamera(c: Camera, opts?: { animate?: boolean }): void; viewport(): {w:number;h:number}; container(): HTMLElement }`. Camera transform is written directly to the layer element's `style.transform = translate(...) scale(...)` (not React state); culling/LOD recompute is debounced 100 ms after camera changes. `arrowPath(a: ArrowObj, resolve: (id) => CanvasObject|undefined): { d: string; start: Point; end: Point; labelAt: Point }` (straight, curved = quadratic with 20 % bend, elbow = one or two orthogonal segments; bound terminals resolve to the target's rotated anchor, clipped to its outline). `richTextToHtml(frag: Y.XmlFragment): string` (sanitised; supported marks bold, italic, underline, strike, link; nodes paragraph, heading 1–3, bullet/ordered list).
- Rendering rules: each object is an absolutely positioned element with `transform: translate(x,y) rotate(r)`; images use `decoding="async"` and pick the `w1024` variant when on-screen width × devicePixelRatio ≤ 1024, otherwise the original; at `z < 0.15`, text renders as grey bars (`TextView` lod prop); stickies render at fixed font size per `StickySize` and grow vertically; frames show their name label above the top-left corner at constant screen size; frame `clip` uses `overflow: hidden` on a frame container that hosts its children; dark theme maps canvas colours through tokens.

- [ ] **Step 1: Failing tests:** arrow-path for straight/curved/elbow between two bound rects (end points lie on outlines ±0.5); rich-text HTML escapes `<script>` and strips `javascript:` links; `ObjectLayer` renders only ids returned by `visible()` (mock index) and re-renders a single object on change without re-rendering others (render counter).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; `npm run build` passes. Step 5: Commit** `Atelier: canvas view and object rendering`.

### Task 10: Input pipeline, gestures and camera control

**Files:**
- Create: `lib/engine/input/gestures.ts`, `lib/settings.ts`
- Modify: `components/canvas/CanvasView.tsx`
- Test: `tests/unit/gestures.test.ts`

**Interfaces:**
- Produces: `type NavSettings = { wheel: "zoom" | "pan"; sensitivity: number /* 0.5..2, default 1 */; locked: boolean; snap: boolean; penOnlyDraws: boolean }` with `loadSettings()/saveSettings()` (localStorage, try/catch, defaults on failure); `classifyWheel(e: { deltaX; deltaY; deltaMode; ctrlKey; metaKey }, s: NavSettings): { kind: "zoom"; factor: number } | { kind: "pan"; dx: number; dy: number }` — `ctrlKey` (trackpad pinch) or `metaKey` → zoom; otherwise `s.wheel` decides, Figma-style default `pan` for trackpads (non-integer or `deltaMode 0` small deltas) and `zoom` for line-mode mouse wheels unless `locked`; `class PointerTracker { down(e); move(e); up(e); readonly pinch: { center: Point; scale: number } | null }` handling two-pointer pinch/pan, ignoring additional pointers once a single-pointer drag started, drag threshold 3 px (mouse/pen) / 6 px (touch).
- Keyboard: Space-drag = pan; `Shift+1` zoom to fit, `Shift+2` zoom to selection, `Ctrl/Cmd +/-/0`.
- [ ] **Step 1: Failing tests:** `classifyWheel` matrix (pinch → zoom; mouse line wheel → zoom by default; pixel deltas → pan; `locked` + `wheel:"pan"` → always pan); `PointerTracker` pinch scale from two moving touches; third touch ignored; threshold respected; zero-distance pinch yields no NaN.
- [ ] **Step 2: FAIL. Step 3: Implement and wire into CanvasView** (pointer capture on down, `touch-action: none` on canvas root, `preventDefault` on wheel with `{ passive: false }`). **Step 4: PASS. Step 5: Commit** `Atelier: pan, zoom and gestures`.

### Task 11: Select tool — hit, marquee, move, resize, rotate, snap

**Files:**
- Create: `lib/engine/input/tool-machine.ts`, `lib/engine/input/tools/select.ts`, `lib/engine/geometry/snap.ts`, `components/canvas/SelectionOverlay.tsx`, `GuidesOverlay.tsx`
- Test: `tests/unit/snap.test.ts`, `tests/unit/select-tool.test.ts`

**Interfaces:**
- Consumes: `BoardDoc`, `SpatialIndex`, `hitTest`, `resizeRect`, `snapAngle`, `NavSettings.snap`.
- Produces: `type ToolId = "select"|"hand"|"sticky"|"text"|"shape"|"arrow"|"pen"|"highlighter"|"eraser"|"frame"|"image"`; `interface Tool { id: ToolId; onDown(ctx: ToolCtx, e: CanvasPointer): void; onMove(...); onUp(...); onKey?(ctx, e: KeyboardEvent): boolean; cursor?(ctx): string }`; `ToolCtx { doc; index; camera(): Camera; selection: SelectionStore; settings: NavSettings; setTool(id: ToolId): void; overlays: OverlayStore }`; `class SelectionStore { ids: ReadonlySet<string>; set(ids: Iterable<string>): void; toggle(id): void; subscribe(cb): () => void }`; `computeSnap(moving: Rect, others: Rect[], thresholdCanvas: number): { dx: number; dy: number; guides: Guide[] }` snapping edges, centres and equal spacing; `type Guide = { axis: "x"|"y"; pos: number; from: number; to: number; gap?: number }`.
- Behaviour: click selects top-most (locked objects selectable only via Layers); Shift-click toggles; drag on empty = marquee (objects fully inside; Alt = touching); drag selection = move with snapping (threshold 6 screen px; ⌘/Ctrl held disables for that drag; soft-snap: no snapping while pointer speed > 1.5 px/ms); handles resize (Shift = keep aspect, Alt = from centre; images and stickies keep aspect by default); rotate handle above top edge (Shift = 15° steps); Alt-drag duplicates; arrow keys nudge 1 px, Shift+arrow 10 px; moving a frame moves its children; dropping objects onto a frame reparents them (and out of it un-parents); Escape clears selection; one undo step per gesture (`stopCapturing` on up).
- [ ] **Step 1: Failing tests:** `computeSnap` aligns left edges within threshold, centres, equal gaps between three boxes, returns no snap outside threshold; select-tool simulations with a fake ctx: click selects, Shift toggles, marquee selects contained only, drag moves by delta (+ snap), Alt-drag creates duplicates with new ids, resize respects aspect for images, rotation steps with Shift, frame move carries children, drop into frame sets `parentId`, gesture = single undo step, locked object not moved.
- [ ] **Step 2: FAIL. Step 3: Implement.** Selection overlay: 1 px accent outline, 8 px square handles (16 px hit area; 44 px under `pointer: coarse`), rotate handle with small circle (mirrors the logo). Guides in accent colour with distance labels. **Step 4: PASS. Step 5: Commit** `Atelier: selection, transform and snapping`.

### Task 12: Creation tools — sticky, text, shape, frame, arrow, pen, highlighter, eraser

**Files:**
- Create: `lib/engine/input/tools/{hand,sticky,text,shape,frame,arrow,pen,eraser}.ts`
- Test: `tests/unit/creation-tools.test.ts`

**Interfaces:**
- Consumes: `Tool`, `ToolCtx`, `BoardDoc.create`, `defaultsFor`, `FRAME_PRESETS`, perfect-freehand `getStroke`.
- Produces tool singletons registered in `tool-machine.ts`; `ShapeTool.kind: ShapeKind` (last used remembered); `FrameTool.preset: FramePresetId`; `PenTool.color/size`; `ArrowTool.route`.
- The spec's "line" shape = `ArrowTool` with both heads `"none"` (toolbar Arrow popover offers Arrow / Line).
- Behaviour: click creates default-size object at pointer (sticky 200×200, text auto-width, shape 160×120, frame = preset size scaled to fit viewport when larger); drag defines size (Shift = square/keep ratio); after creating sticky/text, enter text editing (Task 13) and return to Select (sticky tool stays active if toolbar double-clicked = locked tool); arrow: drag from a point/object; **binds only when released over a target that is highlighted** (hover highlight while dragging), holding ⌘/Ctrl creates unbound; anchor = normalised position on target; dragging from a selected object's edge "+" handle starts an arrow bound at start; pen/highlighter: pressure from `PointerEvent.pressure` (mouse = 0.5), points simplified (min distance 1.5 px screen), stored relative to bounding box; highlighter = 40 % opacity, multiply blend, fixed width; when `penOnlyDraws` is on, touch pointers pan instead of drawing; eraser removes strokes (and only strokes) it crosses, one undo step per drag; new frames adopt objects fully inside them as children.
- [ ] **Step 1: Failing tests** for each behaviour above (fake ctx + synthetic pointers), including: arrow released on empty space stays unbound; released over an object binds with anchor in [0,1]; ⌘ held never binds; eraser does not delete stickies; touch with `penOnlyDraws` creates no stroke.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: creation tools`.

### Task 13: Rich text editing

**Files:**
- Create: `components/canvas/RichTextEditor.tsx`, `lib/engine/model/text-measure.ts`
- Modify: `TextView.tsx`, `StickyView.tsx`, `ShapeView.tsx`
- Test: `tests/unit/text-measure.test.ts`, `tests/unit/rich-text-editor.test.tsx`

**Interfaces:**
- Consumes: `BoardDoc.content(id)` (Y.XmlFragment), `richTextToHtml`.
- Produces: `<RichTextEditor doc objectId onDone />` — Tiptap editor (StarterKit minus history, Underline, Link with `rel="noopener noreferrer"` and http(s)/mailto only, TextAlign, a `lineHeight` paragraph attribute, a `fontSize` text-style mark with sizes 12–96) bound to the fragment through the Collaboration extension; mounted only while editing (double-click, Enter on selection, or typing on a selected sticky); Escape or click outside ends editing; empty text objects are deleted on exit; `measureTextHeight(html: string, widthPx: number, fontSizePx: number, lineHeight: number): number` used to grow stickies/text boxes vertically (never shrinking font).
- Formatting UI is in ContextBar (Task 19); shortcuts ⌘B/⌘I/⌘U/⌘K inside the editor.
- Undo inside the editor goes through BoardDoc's UndoManager (Collaboration extension uses the same Y.Doc; disable Tiptap history).
- [ ] **Step 1: Failing tests:** editing text through the editor updates the fragment; ⌘B toggles bold in the fragment; leaving an empty text object deletes it; sticky with long text grows `h` while `size` (font) stays the same; `javascript:` link is rejected.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: rich text editing`.

### Task 14: Commands, shortcuts and arrangement

**Files:**
- Create: `lib/engine/commands/registry.ts`, `commands.ts`, `shortcuts.ts`, `lib/engine/layout/align.ts`, `components/chrome/Toast.tsx`
- Test: `tests/unit/commands.test.ts`, `tests/unit/align.test.ts`

**Interfaces:**
- Produces: `type Command = { id: string; label: string; group: "edit"|"arrange"|"view"|"insert"|"board"; shortcut?: string /* e.g. "Mod+D" */; when?(ctx: CommandCtx): boolean; run(ctx: CommandCtx): void }`; `registry: { all(): Command[]; get(id): Command; run(id, ctx): void }`; `bindShortcuts(target: HTMLElement, ctx: () => CommandCtx): () => void` (ignores events from inputs/contenteditable); `alignRects(rs: Rect[], mode: "left"|"hcenter"|"right"|"top"|"vcenter"|"bottom"): Rect[]`; `distribute(rs: Rect[], axis: "x"|"y"): Rect[]` (equal gaps); `toast({ message, action?: { label, run } , durationMs = 5000 })`.
- Command ids (all must exist): `edit.undo` (Mod+Z), `edit.redo` (Mod+Shift+Z, Mod+Y), `edit.selectAll` (Mod+A), `edit.duplicate` (Mod+D), `edit.delete` (Delete/Backspace → toast "Deleted N objects · Undo"), `edit.copyStyle` (Mod+Alt+C), `edit.pasteStyle` (Mod+Alt+V), `arrange.group` (Mod+G), `arrange.ungroup` (Mod+Shift+G), `arrange.lock` (Mod+Shift+L), `arrange.forward` (Mod+]), `arrange.backward` (Mod+[), `arrange.front` (Mod+Alt+]), `arrange.back` (Mod+Alt+[), `arrange.align.*` (6), `arrange.distribute.x|y`, `arrange.flipH` (Shift+H), `arrange.flipV` (Shift+V), `view.zoomFit` (Shift+1), `view.zoomSelection` (Shift+2), `view.zoomIn` (Mod+=), `view.zoomOut` (Mod+-), `view.zoom100` (Mod+0), `view.toggleSnap`, `view.toggleTheme`, `view.find` (Mod+F), `view.palette` (Mod+K), tool shortcuts V H N T S L P E F (Task 12 tool ids; `I` = image upload).
- `type CommandCtx = { doc: BoardDoc; selection: SelectionStore; canvas: CanvasHandle; setTool(id: ToolId): void; toast: typeof toast; clipboardStyle: { current: Partial<CanvasObject> | null } }`.
- Groups use `GroupObj` (Task 5): `arrange.group` creates a group whose children keep world positions; selecting a child selects its top-level group; double-click enters the group (selects the child).
- [ ] **Step 1: Failing tests:** each command's effect on a small doc (duplicate offsets by 16 px and selects copies; delete + toast action restores; z-order commands reorder indices; group/ungroup preserves world positions; paste style copies stroke/fill/opacity/cornerRadius between shapes and crop ratio/opacity between images); `alignRects`/`distribute` maths; `bindShortcuts` ignores keys typed in an `<input>`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: commands, shortcuts and arrangement`.

### Task 15: Clipboard serialisation and parsing (pure)

**Files:**
- Create: `lib/engine/clipboard/serialize.ts`, `parse.ts`
- Test: `tests/unit/clipboard.test.ts`

**Interfaces:**
- Produces: `serializeSelection(doc: BoardDoc, ids: string[]): { html: string; text: string }` — HTML contains `<!-- atelier:v1 BASE64 -->` with JSON `{ v: 1, objects: SerializedObject[], assets: { id, url, w, h }[] }` (objects include their rich-text content as Tiptap JSON) plus a readable fallback (images as `<img>`, text as paragraphs); `parseClipboard(input: { html?: string; text?: string; files?: File[] }): PasteItem[]` where `type PasteItem = { kind: "atelier"; payload } | { kind: "image"; file: File } | { kind: "url"; url: string } | { kind: "text"; text: string; lines: number }`; `insertPaste(doc, items: PasteItem[], at: Point, opts): string[]` (atelier → new ids, arrows rebound to copied targets when both ends copied, otherwise unbound; offset 16 px when pasting at the same place repeatedly; url → text object with a link mark (link cards/embeds arrive in Phase 2); text → text object; multiple images → grid with 16 px gutter, max 6 per row).
- [ ] **Step 1: Failing tests:** round trip of a selection with a bound arrow keeps the binding to the copied target; partial copy unbinds; malformed base64/JSON → falls back to text item (no throw); 500-line text returns `lines: 500`; image files produce image items in order; URL detection only for http(s).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: clipboard format`.

### Task 16: Clipboard and drag-drop wiring

**Files:**
- Create: `components/canvas/useClipboard.ts`, `components/canvas/useDropFiles.ts`
- Test: `tests/unit/use-clipboard.test.tsx`, e2e in Task 23

**Interfaces:**
- Consumes: Task 15, `registry`, `AssetUploader.add` (Task 17), `toast`.
- Produces: `edit.copy` (Mod+C), `edit.cut` (Mod+X), `edit.paste` (Mod+V) commands using `copy`/`cut`/`paste` DOM events (`clipboardData.setData('text/html' | 'text/plain')`), falling back to `navigator.clipboard.read()` for the context-menu Paste; drop of files/URLs/text at drop point.
- Limits (Review Focus #2): images > 50 MB or unsupported types (anything not decodable by `createImageBitmap`, e.g. HEIC on Chrome) → toast "Couldn't add {name}: {reason}"; text with > 200 lines asks via toast action "Split into N stickies?" (default: one text object); empty clipboard → no-op.
- [ ] **Step 1: Failing tests** for cut (copy + delete in one undo step), paste of oversize file shows toast and inserts nothing, paste of 500-line text shows the split prompt, split action creates 500 stickies in a grid.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: copy, cut, paste and drop`.

### Task 17: Image assets — worker pipeline, upload queue, resolver

**Files:**
- Create: `lib/assets/pipeline.worker.ts`, `pipeline.ts`, `upload-queue.ts`, `resolver.ts`, `lib/server/r2.ts`, `app/api/assets/route.ts`, `app/api/assets/[id]/complete/route.ts`
- Test: `tests/unit/r2.test.ts`, `tests/unit/upload-queue.test.ts`, `tests/unit/assets-api.test.ts`

**Interfaces:**
- Produces: `processImage(file: Blob): Promise<{ width; height; mime; variants: { w1024: Blob }; original: Blob }>` (worker: `createImageBitmap` with `imageOrientation: "from-image"` → OffscreenCanvas → WebP q 0.82, longest side 1024; full multi-size pipeline is Phase 2); `class AssetUploader { add(file: File, at: Point): Promise<string /* objectId */>; pending(): number; subscribe(cb): () => void }` — creates the image object immediately with a local `blob:` URL, stores blobs in IndexedDB (`atelier-uploads`), retries with exponential backoff (1 s → 60 s), survives reloads; `AssetResolver.url(assetId: string, variant: "w1024" | "original"): string | null` (local blob first, then `https://{R2_PUBLIC_HOST}/a/{assetId}/{variant}`); `presignPut({ key, contentType, expiresSeconds = 600 }): string` in `lib/server/r2.ts` (S3 SigV4 like `stash/lib/r2.ts`); `POST /api/assets` body `{ mime, bytes, width, height }` → `{ assetId, uploads: { original: url, w1024: url } }` (owner-only; rejects bytes > 50 MB with 413); `POST /api/assets/:id/complete` stores the `assets` row.
- Keys: `a/{assetId}/original.{ext}` and `a/{assetId}/w1024.webp`, assetId = 22-char nanoid (≥ 128 bits).
- [ ] **Step 1: Failing tests:** `presignPut` matches a known SigV4 vector (fixed date/keys); assets API returns 401 without session, 403 for non-owner, 413 for 60 MB, 200 shape otherwise (Supabase + R2 mocked); upload queue retries after a failed PUT and resolves after success; pending count survives a re-instantiation from IndexedDB (fake-indexeddb).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: image upload pipeline`.

### Task 18: Local persistence and server sync

**Files:**
- Create: `lib/sync/local-store.ts`, `sync-client.ts`, `realtime.ts`, `status.ts`, `lib/server/updates.ts`, `lib/server/compaction.ts`, `app/api/boards/[id]/updates/route.ts`
- Test: `tests/unit/sync.test.ts`, `tests/unit/compaction.test.ts`, `tests/unit/updates-api.test.ts`

**Interfaces:**
- Produces: `openLocalBoard(boardId): Promise<{ doc: BoardDoc; persistence: IndexeddbPersistence }>` (y-indexeddb, db name `atelier-board-{id}`; calls `navigator.storage.persist()` once per device, ignoring failure); `class SyncClient { constructor(boardId, doc, api: SyncApi, opts?: { batchMs = 1000 }); start(): void; stop(): void; flush(): Promise<void>; status: SyncStatus }`, `type SyncStatus = "saved" | "syncing" | "offline" | "error"`; `SyncApi = { push(boardId, update: Uint8Array, deviceId): Promise<{ seq: number }>; pull(boardId, afterSeq: number): Promise<{ updates: { seq: number; update: Uint8Array }[]; snapshot?: { state: Uint8Array; uptoSeq: number } }> }`; `GET /api/boards/:id/updates?after=N` (returns snapshot when `after < snapshot.upto_seq`) and `POST` (body `application/octet-stream`, max 1 MB → 413); `compact(boardId)` merges updates into a `board_snapshots` row (`kind:"compaction"`) when > 200 rows or the newest snapshot is > 24 h old, deleting merged rows; realtime: after a successful push, broadcast `{ boardId }` on channel `atelier:board:{id}`; other devices pull on receipt, on window focus and on `online`.
- SyncClient pushes only local-origin updates (merged with `Y.mergeUpdates` per batch), stores `lastSeq` + unsent updates in IndexedDB so a reload re-sends; status `offline` while `navigator.onLine === false` or a push fails with a network error (exponential backoff 1 s → 60 s); if the local doc is missing or fails to load, rebuild from snapshot + updates.
- [ ] **Step 1: Failing tests** (fake API in memory, fake-indexeddb) incl. Review Focus #1: device A and B (two docs) both edit while "offline", then come online → both converge to identical state containing both edits, no duplicates; reload of A with unsent updates re-sends them once; `pull` after compaction applies snapshot then later updates; corrupt local store → rebuild from server; compaction keeps state identical (`Y.encodeStateAsUpdate` equality after applying to fresh docs); API: 401/403 non-owner, 413 > 1 MB, board owned by someone else → 404.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: offline storage and sync`.

### Task 19: Editor chrome — top bar, toolbar, context bar, menus, zoom, minimap

**Files:**
- Create: `components/chrome/TopBar.tsx`, `Toolbar.tsx`, `ContextBar.tsx`, `ContextMenu.tsx`, `ZoomControls.tsx`, `Minimap.tsx`, `StatusLive.tsx`
- Modify: `app/b/[boardId]/page.tsx`
- Test: `tests/unit/toolbar.test.tsx`, `tests/unit/context-bar.test.tsx`

**Interfaces:**
- Consumes: `registry`, `SelectionStore`, `SyncStatus`, tool machine, `CanvasHandle`.
- Layout per SPEC §6: TopBar (wordmark `atelier-lockup-*.svg` at 24 px linking home, editable board title, breadcrumb, sync status text "Saved" / "Offline · saved on this device" / "Syncing…", buttons Present (disabled, "Phase 3"), Share (primary, disabled with tooltip "Coming in Phase 3"), Export (disabled)). Toolbar bottom-centre `role="toolbar" aria-label="Tools"`, roving tabindex (arrow keys, Home/End; `focusgroup` attribute with JS fallback), `aria-pressed` on the active tool, tooltip with name + shortcut; shape and pen buttons open popovers (kind/preset/colour/size). ContextBar above the selection (flips below when near the top), only relevant controls: fill/stroke/colour swatches (token palette + custom picker), stroke width/style, font size, B/I/U, alignment, line spacing, sticky colour & size, shape kind, arrow route/heads, frame preset/clip, lock, ⋯ menu (same items as context menu). ContextMenu on right-click / long-press (500 ms) with commands from the registry. ZoomControls bottom-right: % (click → presets 25/50/100/200/fit), undo/redo, minimap toggle; Minimap renders object rects (no images) and the viewport rect, click/drag to move. `StatusLive` = visually hidden `role="status"` announcing copy/delete/sync changes.
- [ ] **Step 1: Failing tests:** toolbar arrow-key navigation moves focus and `Enter` activates; active tool has `aria-pressed="true"`; ContextBar shows sticky controls for a sticky selection and shape controls for a shape; mixed selection shows only common controls (opacity, lock, arrange).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: editor chrome`.

### Task 20: Layers, Inspector, command palette, find & replace

**Files:**
- Create: `components/panels/LayersPanel.tsx`, `InspectorPanel.tsx`, `CommandPalette.tsx`, `FindReplace.tsx`, `lib/engine/model/search.ts`
- Test: `tests/unit/search.test.ts`, `tests/unit/layers-panel.test.tsx`, `tests/unit/command-palette.test.tsx`

**Interfaces:**
- Produces: right panel host (one panel open at a time, resizable 260–420 px, collapsible; bottom sheet under 768 px). Layers: tree by `parentId` in z-order (top first), virtualised beyond 100 rows, select/rename frames/lock/hide-in-editor toggle, drag to reorder **plus** "Move up/down" buttons and keyboard (Alt+↑/↓) as the non-drag alternative; locked objects selectable here. Inspector: X, Y, W, H, rotation (degrees), opacity numeric inputs (commit on Enter/blur, arrow keys ±1, Shift ±10), aspect lock. `searchBoard(doc, query, opts: { caseSensitive: boolean; wholeWord: boolean }): { id: string; field: "text"|"frameName"|"label"; matches: number }[]`; `replaceAll(doc, query, replacement, opts): number` (one undo step). Command palette: Mod+K, fuzzy search over commands (label + group), boards (titles from home cache), and objects (text/frame names) → run / open / zoom to object; no open/close animation.
- [ ] **Step 1: Failing tests:** search finds text in stickies, shapes' labels and frame names, respects case/whole-word; replaceAll counts and is undoable in one step; palette filters "dup" → "Duplicate"; Layers renders nested frame children and Alt+↑ moves an item up.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: layers, inspector, palette and find`.

### Task 21: Home — boards, folders, templates

**Files:**
- Create: `app/page.tsx` (replace placeholder), `components/home/*`, `app/api/boards/route.ts`, `app/api/boards/[id]/route.ts`, `lib/server/boards.ts`, `lib/engine/model/templates.ts`, `lib/sync/board-list-cache.ts`
- Test: `tests/unit/templates.test.ts`, `tests/unit/boards-api.test.ts`

**Interfaces:**
- Produces: `GET /api/boards` → `{ boards: BoardSummary[]; folders: Folder[] }`; `POST /api/boards` `{ title, folderId?, templateId? }` → `{ id }`; `PATCH /api/boards/:id` `{ title?, folderId?, starred?, deletedAt? }`; `DELETE` = soft delete (`deleted_at = now()`), restore via PATCH within 30 days; `type BoardSummary = { id; title; folderId: string|null; starred: boolean; updatedAt: string; lastOpenedAt: string|null; preview: string[] /* ≤ 4 asset ids */ }`; `TEMPLATES: { id: "blank"|"moodboard"|"deck"|"brainstorm"|"flowchart"|"kanban"; name: string; build(doc: BoardDoc): void }[]` (moodboard: two 1920×1080 frames "Direction A/B" with titled text + 6 empty image placeholders as dashed shapes; deck: five 16:9 frames ordered; brainstorm: central text + 8 stickies around; flowchart: start/process/decision/end shapes with bound arrows; kanban: three frames "To do / Doing / Done" with stickies); board preview = up to 4 image asset ids picked on leaving a board (largest images first) and PATCHed.
- UI: Recent / Starred / Folders (nested) / Trash, search box filtering titles, grid of cards (preview mosaic or blank paper card with the board's first frame name), New board dialog choosing a template, card menu (Rename, Duplicate, Move to…, Star, Delete → toast with Undo). Board list cached in IndexedDB so home works offline (read-only badge "Offline").
- [ ] **Step 1: Failing tests:** each template builds valid objects (all pass `validateObject`, arrows bound to existing ids); boards API owner checks (401/403), create with template returns id, soft delete hides from list and appears in trash, PATCH by non-owner affects nothing.
- [ ] **Step 2: FAIL. Step 3: Implement** (creating a board from a template builds the doc client-side and the first sync pushes it). **Step 4: PASS; build. Step 5: Commit** `Atelier: home, folders and templates`.

### Task 22: PWA, offline shell, theme and settings

**Files:**
- Create: `app/manifest.ts`, `public/sw.js`, `public/offline.html`, `components/RegisterSW.tsx`, `lib/theme.ts`
- Modify: `app/layout.tsx`, `app/settings/page.tsx`
- Test: `tests/unit/manifest.test.ts`, `tests/unit/theme.test.ts`

**Interfaces:**
- Produces: manifest `{ name: "Atelier", short_name: "Atelier", start_url: "/", display: "standalone", background_color: "#F5F2EC", theme_color: "#141414", icons: [icon-192, icon-512 (purpose any), icon-maskable-512 (purpose maskable)] }` from `public/brand/`; service worker (modelled on `stash/public/sw.js`): precache app shell + `offline.html` + brand icons, network-first for navigations with offline fallback, stale-while-revalidate for `/_next/static/*`, never caches `/api/*`; R2 image variants cache-first in a separate `atelier-images` cache capped at 500 entries; `lib/theme.ts` `getTheme(): "light"|"dark"|"system"`, `applyTheme()` sets `data-theme` on `<html>` before paint (inline script) and follows `prefers-color-scheme` for "system". Settings page sections: Appearance (theme), Navigation (wheel = zoom/pan, sensitivity slider 0.5–2, lock, snap default, "Pen draws, finger pans"), Security (Task 4), Storage (estimate from `navigator.storage.estimate()`, persisted yes/no), Account (sign out).
- [ ] **Step 1: Failing tests:** manifest shape and icon paths exist on disk; theme resolution with/without stored preference; settings defaults survive a throwing localStorage.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: installable app, offline shell and settings`.

### Task 23: End-to-end tests, performance smoke, accessibility, deployment

**Files:**
- Create: `e2e/editor.spec.ts`, `e2e/clipboard.spec.ts`, `e2e/offline.spec.ts`, `e2e/home.spec.ts`, `e2e/a11y.spec.ts`, `e2e/perf.spec.ts`, `e2e/fixtures/*` (images, 500-object board JSON), `docs/DEPLOY.md`
- Modify: `.github/workflows/atelier-ci.yml`, `docs/PROGRESS.md`, `README.md` (create)

**Interfaces:**
- Consumes: everything; runs with `ATELIER_LOCAL_ONLY=1` (no auth/sync; local boards in IndexedDB).
- [ ] **Step 1: Write e2e specs:** (editor) create sticky by `N` + click, type text, undo/redo; draw rectangle, resize with Shift keeps ratio; arrow bound between two shapes follows when a shape moves; frame moves its children; pen stroke on `phone` project via touch; (clipboard) copy/paste objects including a bound arrow, paste 500-line text prompt, drop two images → grid; (offline) `context.setOffline(true)`, edit, reload, edits still there, status reads "Offline · saved on this device"; (home) create from each template, rename, star, delete + undo; (a11y) axe on home, editor chrome and login: zero serious/critical violations; toolbar fully keyboard-operable; (perf) open the 500-object fixture board → first objects visible and interactive < 500 ms after navigation start (Performance mark `atelier:board-ready`), panning 2 s at 60 fps target logs p95 frame time (assert < 33 ms in CI, report actual).
- [ ] **Step 2: Run `npm run e2e` → fix failures until all pass on `desktop` and `phone`.**
- [ ] **Step 3: Write `docs/DEPLOY.md`** — owner-run steps, not executed by agents without the owner's go-ahead: apply `0001_atelier_init.sql` with the Supabase MCP `apply_migration` to project `rvbllpkhwakjuahxyfff`; add `atelier` to Exposed schemas (Dashboard → API settings); create the owner user (email+password) and set `ATELIER_OWNER_ID`; create R2 bucket `atelier-assets` with public access via r2.dev or custom domain and CORS (`GET, PUT` from the app origin, `Content-Type` header); create Vercel project `atelier` (root `atelier/`) with env `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `ATELIER_OWNER_ID`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_HOST`; smoke checklist (login, create board, add image, open on phone, offline edit then sync).
- [ ] **Step 4: Final gate:** `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e` all pass; `scripts/test-rls.sh` passes; update `docs/PROGRESS.md` with every acceptance item marked passed/failed (spec §2 Phase 1 list, §8 rows for Phase 1).
- [ ] **Step 5: Commit** `Atelier: end-to-end tests, accessibility checks and deploy guide`.

---

## Phase 1 acceptance (from SPEC §2, §8)

Owner login + optional TOTP · home with folders/starred/search/templates/trash · infinite canvas with pan/zoom/minimap/zoom presets · image, rich text, sticky, 6 shapes, arrows with deliberate binding, frames with real-size presets, pen/highlighter/eraser · select/marquee/move/resize/rotate/flip/group/lock/align/distribute/z-order/duplicate/nudge/copy-paste style · unlimited undo/redo · find & replace · copy/cut/paste/drop inside and from other apps · layers, inspector, ⌘K palette, context menu · offline-first IndexedDB + multi-device sync with status · light/dark theme · installable PWA · 500-object board interactive < 500 ms · WCAG 2.2 AA chrome · all tests and CI green.

Deferred to later phases by design: link cards/embeds (paste URL → text link now), multi-size image pipeline and 1,000-image benchmark gate (Phase 2), share/present/export (Phase 3), connector obstacle-avoidance and mind maps (Phase 4).
