# Atelier Phase 2 — Moodboard Power Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Atelier the fastest, sharpest place to collect and compose references: a multi-size image pipeline that holds a 1,000-image board at 60 fps, non-destructive image tools, layout tools, colour as a first-class object, type specimens, video/GIF, link cards and safe embeds, provenance and credits, an Inbox fed by the phone share sheet, and a deduplicating asset library.

**Architecture:** Builds on Phase 1 without changing its data flow. New object types extend the `CanvasObject` union and are rendered by new views registered in `ObjectLayer`. Images get 256/1024/2048 px WebP variants plus the original; a pure `pickVariant` chooses per zoom and an LRU `ImageResidency` budget demotes off-screen hi-res bitmaps. Image rendering moves behind an `ImageLayer` interface so a WebGL layer can replace the DOM one if the `bench/` gate fails. Colour analysis (k-means in OKLab, dHash) runs in the existing asset worker. Link previews are fetched server-side through an SSRF-safe fetcher; embeds render from a strict allow-list inside sandboxed iframes behind a click-to-load facade.

**Tech Stack:** Phase 1 stack plus `fflate` (MIT, Procreate/ZIP export) and, only if the benchmark gate fails, `pixi.js` 8 (MIT). No other new runtime dependencies (Open Graph parsing is hand-written).

**Spec:** `atelier/docs/SPEC.md` §2 Phase 2, §3.2 (renderer, LOD, memory budget), §3.5, §4, §6 (paste rules), §8. Phase 1 plan: `atelier/docs/plans/2026-11-12-phase-1-foundation-canvas.md` (all type and function names below are Phase 1's unless a task here defines them).

> **Reconciliation with Phase 1 as built (overrides anything below that disagrees; read the code first):**
> - `assets.id` is a **uuid** (128 random bits in 8-4-4-4-12 hex, `newAssetId()` in `lib/assets/asset-id.ts`), generated on the client; not a 22-char nanoid.
> - R2 keys: `a/{assetId}/w1024.webp` and `a/{assetId}/original` (**no extension**; the Content-Type is signed into the PUT URL). New variants follow `a/{assetId}/w{N}.webp`.
> - The browser reads the public host from `NEXT_PUBLIC_R2_PUBLIC_HOST` (fallback `R2_PUBLIC_HOST`); `lib/assets/resolver.ts` (`AssetResolverImpl`, `getAssetResolver()`), `lib/assets/upload-queue.ts` (`AssetUploader`), `lib/assets/pipeline.ts` (`processImage`) are the real Phase 1 names.
> - All object coordinates are absolute canvas coordinates (children of frames/groups too). Objects returned by `BoardDoc` are immutable: always `update()`.
> - Server routes use `requireOwner()` / `responseFromError(e)` from `lib/server/owner.ts`; `requireOwner` returns 503 in local-only mode.
> - `proxy.ts` open paths and anonymous-identity rejection are as built (see the file); new public paths (`/s/*`, `/api/s/*`, `/share-target`) must be added there deliberately with tests.

## Global Constraints

- Everything in Phase 1's Global Constraints still applies (tokens only, `lucide-react` only, local-first, WCAG 2.2 AA, motion rules, licence check for dependencies, `ATELIER_LOCAL_ONLY` refused in production, commands run from `atelier/`, attribution on commits, update `docs/PROGRESS.md` at the end of every task).
- Migrations are append-only: Phase 2 adds `supabase/migrations/0002_atelier_phase2.sql`; never edit `0001`. `scripts/test-rls.sh` must apply every migration in filename order.
- **No SVG uploads.** Accepted upload MIME types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`, `video/mp4`, `video/webm`. SVG from an R2 public host could execute script if opened directly. HEIC is attempted through `createImageBitmap`; if the browser cannot decode it the file is rejected with a toast naming it (Phase 1 behaviour).
- Variants are **never upscaled**: a 800 px-wide source has no `w1024`/`w2048`; selection falls back to the next larger existing variant or the original.
- Every server route that fetches a third-party URL goes through `safeFetch` (Task 14). No route, component or worker may call `fetch` on a user-supplied URL any other way.
- Every iframe is rendered by `EmbedView` only, from `toEmbed()` output, with `sandbox` set (Task 15). No other component creates iframes.
- Derived data (palette, thumbnails, usage counts) never creates an undo step and never writes to the doc when the computed value is unchanged.
- Performance gate (SPEC §8): 1,000-image board, p95 frame < 20 ms on `npm run bench`. Phase 2 is not done until the gate passes or the fallback in Task 6 has been built and passes.
- Dependencies added in this phase: `fflate` (Task 11) and `pixi.js` (Task 6, conditional); both MIT.

## Review Focus

1. **Corrupt or extreme image files** (0-byte file, 1×1 px, 20000×200 panorama, EXIF-rotated phone photo, animated GIF, CMYK JPEG, 60 MB file) → pipeline never produces NaN/zero sizes, never upscales, never throws to the UI; failures show a toast naming the file. Test owned by Task 3.
2. **Link-preview SSRF** (`http://169.254.169.254/`, `localhost`, `[::1]`, a hostname resolving to `10.0.0.1`, a redirect to a private IP, `file:`/`javascript:` schemes, a 100 MB or never-ending response) → rejected or aborted, never contacts a private address, non-owner gets 403. Test owned by Task 14.
3. **Hostile page and embed metadata** (title containing `<script>`, 1 MB description, `og:image` = `javascript:`, embed lookalikes such as `youtube.com.evil.com` or `https://evil.com/?u=youtu.be/x`) → rendered as inert escaped text, lookalikes become plain link cards, only allow-listed origins reach an iframe. Tests owned by Tasks 14 (parser) and 15 (embeds, rendering).
4. **Bulk drop of 300 images at once, then rapid zoom** → at most 3 images decode and 4 uploads run concurrently, the browser stays responsive, hi-res bitmaps stay under the memory budget, queue survives a reload. Tests owned by Tasks 3 and 4.
5. **Degenerate selections and boards** (layout on 1 item, on zero-size items, on 2,000 items; palette of an all-white or fully transparent image; live palette on a board with no images; two images alternating palette edits) → no NaN, no infinite loop, no repeated Yjs writes from the live palette. Tests owned by Tasks 8 and 10.

---

## File map (new unless marked Modify)

```
atelier/
  supabase/migrations/0002_atelier_phase2.sql
  supabase/tests/rls.sql (Modify)  scripts/test-rls.sh (Modify)
  app/inbox/page.tsx  app/library/page.tsx  app/share-target/route.ts (GET only, redirects to /inbox)
  app/api/inbox/route.ts  app/api/inbox/[id]/route.ts
  app/api/link-preview/route.ts  app/api/link-preview/image/route.ts
  app/api/assets/route.ts (Modify)  app/api/assets/[id]/route.ts  app/api/boards/[id]/assets/route.ts
  app/manifest.ts (Modify)  public/sw.js (Modify)
  components/
    canvas/objects/ VideoView.tsx LinkView.tsx EmbedView.tsx SwatchView.tsx PaletteView.tsx TypeSpecimenView.tsx  (ImageView.tsx Modify)
    canvas/CropOverlay.tsx
    panels/ PalettePanel.tsx InboxPanel.tsx  (InspectorPanel.tsx, ContextBar.tsx Modify)
    library/ AssetGrid.tsx DuplicateGroups.tsx
    chrome/ QuickCapture.tsx
  lib/
    engine/model/ types.ts defaults.ts validate.ts migrate.ts (Modify/new) color.ts
    engine/doc/board-doc.ts (Modify: meta accessors, transactAs)
    engine/render/ image-layer.ts dom-image-layer.ts residency.ts variant.ts webgl-image-layer.ts (conditional)
    engine/images/ ops.ts crop.ts
    engine/layout/ arrange.ts
    engine/color/ extract.ts aggregate.ts phash.ts palette-controller.ts highlight.ts
    engine/export/ palette-formats.ts
    engine/links/ classify.ts embed.ts
    engine/fonts/ font-loader.ts
    engine/media/ playback-budget.ts
    assets/ pipeline.worker.ts pipeline.ts upload-queue.ts resolver.ts backfill.ts provenance.ts usage-tracker.ts (Modify/new)
    inbox/ inbox-client.ts share-queue.ts
    server/ safe-fetch.ts open-graph.ts inbox.ts library.ts
  bench/ run.ts stats.ts fixtures/make-board.ts README.md
  docs/decisions/0001-image-layer.md
  tests/unit/** e2e/**
```

---

### Task 1: Migration `0002_atelier_phase2.sql` and RLS tests

**Files:**
- Create: `supabase/migrations/0002_atelier_phase2.sql`
- Modify: `supabase/tests/rls.sql`, `scripts/test-rls.sh`
- Test: `supabase/tests/rls.sql` (run by `scripts/test-rls.sh`)

**Interfaces:**
- Consumes: tables `assets`, `asset_usages`, `boards`, function `atelier.is_owner(uuid)` from `0001`.
- Produces (schema `atelier`):
  - `inbox_items (id uuid pk default gen_random_uuid(), owner_id uuid not null, kind text not null check (kind in ('image','video','url','text')), asset_id <same type as assets.id> null references assets(id) on delete set null, url text null check (length(url) <= 2048), text_body text null check (length(text_body) <= 10000), title text null check (length(title) <= 300), source_url text null, credit text null, created_at timestamptz not null default now(), placed_at timestamptz null)` with a CHECK that `image`/`video` rows have `asset_id`, `url` rows have `url`, `text` rows have `text_body`; index `inbox_items(owner_id, placed_at, created_at desc)`; policy `owner_all` using `atelier.is_owner(owner_id)` **and** (`asset_id is null or exists (select 1 from atelier.assets a where a.id = asset_id and a.owner_id = inbox_items.owner_id)`) in `with check`.
  - `assets`: add `title text`, `analysis_version smallint not null default 0` (0 = no palette/phash yet, 1 = Phase 2 analysis done), `hidden boolean not null default false`.
  - `asset_usages`: ensure unique `(asset_id, board_id)` (create `unique index if not exists`) and index on `board_id`.
  - `atelier.hamming(a text, b text) returns int` (immutable; bit count of XOR of two 16-hex-char hashes; returns 64 if either is null/not 16 hex chars) and `atelier.similar_assets(h text, max_dist int default 6) returns table(id, phash, dist)` — `security invoker`, so RLS limits it to the caller's own assets, excludes `hidden`.
  - `grant select, insert, update, delete on atelier.inbox_items to authenticated`; `anon` gets nothing.

- [ ] **Step 1: Extend `rls.sql` (failing first).** Add `DO` blocks that `raise exception` on failure: (a) owner A inserts an `inbox_items` url row and an image row referencing A's asset → ok, select returns both; (b) user B selects 0 inbox rows, cannot update/delete A's rows (0 affected), cannot insert with `owner_id = A`; (c) A cannot insert an inbox row whose `asset_id` belongs to B's asset (policy violation); (d) `anon` select on `atelier.inbox_items` → permission denied; (e) CHECK rejects an `image` row without `asset_id`, a `text` row with 20,000 chars; (f) `atelier.hamming('0000000000000000','000000000000000f') = 4`, `hamming('ffffffffffffffff','0000000000000000') = 64`, `hamming(null,'0000000000000000') = 64`; (g) `similar_assets('0000000000000000', 6)` as A returns A's asset with phash `000000000000000f` (dist 4) but not an asset at dist 10, and as B returns zero rows; (h) duplicate `(asset_id, board_id)` insert into `asset_usages` fails.
- [ ] **Step 2: Modify `scripts/test-rls.sh`** to apply every `supabase/migrations/*.sql` in sorted order. Run it → FAIL (no `0002`).
- [ ] **Step 3: Write `0002_atelier_phase2.sql`** per the Interfaces above (idempotent `if not exists` where Postgres allows; RLS enabled on `inbox_items`).
- [ ] **Step 4: Run `scripts/test-rls.sh` → PASS.**
- [ ] **Step 5: Commit** `Atelier: phase 2 migration (inbox, asset analysis, similarity)`.

(Applying `0002` to Supabase is part of Task 19's deploy notes, after owner approval.)

### Task 2: Model v2 — new object types, image extensions, schema migration, meta accessors

**Files:**
- Modify: `lib/engine/model/types.ts`, `defaults.ts`, `validate.ts`, `lib/engine/doc/board-doc.ts`, `lib/engine/input/tool-machine.ts` (ToolId), `components/canvas/ObjectLayer.tsx`
- Create: `lib/engine/model/migrate.ts`, `lib/engine/model/color.ts`
- Test: `tests/unit/model-v2.test.ts`, `tests/unit/migrate.test.ts`, `tests/unit/color.test.ts`

**Interfaces:**
- Consumes: Phase 1 `Base`, `ImageObj`, `validateObject`, `defaultsFor`, `BoardDoc`.
- Produces (exact):
  ```ts
  export type ObjectType = /* Phase 1 */ | "video" | "link" | "embed" | "swatch" | "palette" | "typeSpecimen";
  export type MaskKind = "rect" | "rounded" | "circle";
  export interface Provenance { sourceUrl: string | null; credit: string; licence: string; capturedAt: string | null /* ISO date */ }
  // ImageObj gains (all defaulted so v1 objects still validate):
  //   crop: Rect | null   // NOW normalised 0..1 of the source image (Phase 1 left units open)
  //   mask: { kind: MaskKind; radius: number /* canvas px, rounded only */ }
  //   grayscale: boolean; title: string; provenance: Provenance | null
  export interface VideoObj extends Base { type: "video"; assetId: string; kind: "video" | "gif"; posterTime: number /* s */; loop: boolean; muted: boolean; posterAssetId: string | null /* user-chosen poster frame; null = asset's own poster variant */; provenance: Provenance | null }
  export type LinkStatus = "loading" | "ready" | "failed";
  export interface LinkObj extends Base { type: "link"; url: string; title: string; description: string; siteName: string; imageAssetId: string | null; status: LinkStatus }
  export type EmbedProvider = "youtube" | "vimeo" | "figma";
  export interface EmbedObj extends Base { type: "embed"; provider: EmbedProvider; url: string /* original */; embedUrl: string /* from toEmbed */; title: string }
  export type ColorFormat = "hex" | "rgb" | "oklch";
  export interface SwatchObj extends Base { type: "swatch"; hex: string; name: string; format: ColorFormat }
  export interface PaletteSwatch { hex: string; weight: number /* 0..1 */; name: string; locked: boolean }
  export interface PaletteObj extends Base { type: "palette"; swatches: PaletteSwatch[]; maxColors: number /* 3..12, default 8 */; layout: "strip" | "grid"; showWeights: boolean; live: boolean }
  export interface TypeSpecimenObj extends Base { type: "typeSpecimen"; family: string; weight: number; italic: boolean; sample: string; size: number; licenceNote: string; sourceUrl: string }
  export type PaletteColor = { hex: string; weight: number /* 0..1, sums to 1 per image */ };
  // color.ts
  hexToRgb(hex: string): [number, number, number] | null      // accepts #rgb, #rrggbb, case-insensitive
  rgbToHex(r: number, g: number, b: number): string           // clamps, lower-case #rrggbb
  hexToOklab(hex: string): [number, number, number]
  oklabToHex(l: number, a: number, b: number): string
  deltaE(a: [number,number,number], b: [number,number,number]): number // Euclidean in OKLab
  formatColor(hex: string, fmt: ColorFormat): string          // "#2f4a6d" | "rgb(47 74 109)" | "oklch(0.40 0.06 255)"
  // migrate.ts
  export const SCHEMA_VERSION = 2;
  migrateBoard(doc: BoardDoc): void   // idempotent; v1 -> v2: fills mask {kind:"rect",radius:0}, grayscale false, title "", provenance null; converts any pixel crop (any value > 1) to normalised using the asset size unknown -> sets crop null and logs once
  // board-doc.ts additions
  BoardDoc.meta.showCredits: boolean; BoardDoc.meta.valueCheck: boolean; BoardDoc.meta.gutter: number /* default 16, clamp 0..200 */;
  BoardDoc.transactAs(origin: unknown, fn: () => void): void   // like transact but with a caller-chosen origin; not tracked by undo unless origin === LOCAL_ORIGIN
  export const DERIVED_ORIGIN: unique symbol;
  // tool-machine.ts: ToolId += "crop"
  // ObjectLayer: export const OBJECT_VIEWS: Record<ObjectType, ComponentType<{ obj: any; lod: number }>>  // one entry per type; Phase 1 views registered here
  ```
- [ ] **Step 1: Failing tests.** `validateObject` returns typed objects for the 6 new types' defaults and an image with a Phase 1 shape (no `mask`) gains `mask {rect,0}`, `grayscale false`; `null` for: palette with `maxColors = 50` (clamped to 12 instead — assert 12), swatch with `hex = "red"` (null), embed with `embedUrl` not `https:` (null), link with `url = "javascript:alert(1)"` (null), video with `loop` non-boolean (defaulted); `migrateBoard` idempotent (second run produces no Yjs update — compare `Y.encodeStateVector` before/after) and bumps `schemaVersion` to 2; a board with `schemaVersion = 3` (newer) opens read-through without migration and without throwing; `color.ts`: `hexToRgb("#fff")` = `[255,255,255]`, `rgbToHex(300,-4,0)` = `#ff0000`, round trip `oklabToHex(...hexToOklab(h)) === h` for 50 random colours, `deltaE` of identical colours 0 and black/white ≈ 1, `formatColor("#2F4A6D","rgb")` = `rgb(47 74 109)`; `BoardDoc.meta.gutter = 9999` clamps to 200; `transactAs(DERIVED_ORIGIN, …)` is not undone by `undo()`; `OBJECT_VIEWS` has a key for every `ObjectType`.
- [ ] **Step 2: Run → FAIL. Step 3: Implement** (zod schemas with `.default()`, sanitising URLs to http(s) only; `ObjectLayer` falls back to a grey placeholder for an unknown type so newer boards never crash). **Step 4: PASS; `npm run typecheck`. Step 5: Commit** `Atelier engine: phase 2 object model`.

### Task 3: Multi-size image pipeline (worker, upload, resolver, backfill)

**Files:**
- Modify: `lib/assets/pipeline.worker.ts`, `pipeline.ts`, `upload-queue.ts`, `resolver.ts`, `app/api/assets/route.ts`, `app/api/assets/[id]/complete/route.ts`, `lib/server/r2.ts`
- Create: `lib/assets/backfill.ts`
- Test: `tests/unit/pipeline.test.ts`, `tests/unit/upload-queue.test.ts` (extend), `tests/unit/assets-api.test.ts` (extend), `tests/unit/resolver.test.ts`, `tests/unit/backfill.test.ts`

**Interfaces:**
- Consumes: Phase 1 `processImage`, `AssetUploader`, `AssetResolver`, `presignPut`.
- Produces (exact):
  ```ts
  export type VariantName = "w256" | "w1024" | "w2048";
  export const VARIANT_SIZES: Record<VariantName, number> = { w256: 256, w1024: 1024, w2048: 2048 };
  // pipeline.ts (replaces Phase 1 signature; Phase 1 callers keep working because w1024 is still present when the source is >= 1024)
  export interface ProcessedImage { width: number; height: number; mime: string; original: Blob;
    variants: Partial<Record<VariantName, Blob>>;       // only sizes strictly smaller than the longest source side, never upscaled
    animated: boolean; palette?: PaletteColor[]; phash?: string }  // palette/phash filled by Task 9
  processImage(file: Blob): Promise<ProcessedImage>
  variantPlan(width: number, height: number): VariantName[]   // pure: longest side L -> sizes s with s < L, ascending; L<=256 -> []
  // resolver.ts
  AssetResolver.url(assetId: string, variant: VariantName | "original"): string | null
  AssetResolver.available(assetId: string): { variants: VariantName[]; width: number; height: number } | null   // from asset metadata cache (IndexedDB), local pending uploads included
  // lib/assets/meta-store.ts (new in this task; Phase 1 only said asset metadata is cached in IndexedDB)
  export interface AssetMeta { id: string; kind: "image" | "video" | "gif"; width: number; height: number; bytes: number; variants: VariantName[]; palette: PaletteColor[] | null; phash: string | null; title: string; provenance: Provenance | null; analysisVersion: number }
  export class AssetMetaStore { get(id: string): AssetMeta | undefined; getMany(ids: string[]): Map<string, AssetMeta>; put(m: AssetMeta): void; subscribe(cb: (ids: string[]) => void): () => void; hydrate(): Promise<void> /* IndexedDB `atelier-assets` */ }
  // POST /api/assets body: { mime; bytes; width; height; kind?: "image"|"video"|"gif"; variants?: VariantName[]; phash?: string }
  //   -> { assetId; uploads: Partial<Record<VariantName | "original", string>>; duplicateOf: string | null }
  // upload-queue.ts: Phase 1 `AssetUploader.add(file, at)` keeps its signature; new:
  AssetUploader.addAssetOnly(file: Blob, opts?: { name?: string; provenance?: Provenance }): Promise<string /* assetId */>   // same pipeline/queue/limits, creates no canvas object (used by replace-image, link-card images, Inbox)
  // backfill.ts
  ensureVariants(assetId: string, deps: { resolver: AssetResolver; uploader: AssetUploader }): Promise<void> // old Phase 1 assets with only w1024: fetch original, generate the missing w256/w2048 (when plan says so), upload, PATCH variants; one at a time, runs on idle
  ```
  Keys: `a/{assetId}/{variant}.webp`, `a/{assetId}/original` (no extension). `assets.variants` jsonb = `{ "w256": true, … }` plus `original: { bytes }`.
- Behaviour: EXIF orientation applied before resizing; WebP q 0.82; downscale in two steps (halve until within 2× target, then final resize with `imageSmoothingQuality = "high"`) to avoid aliasing; GIF/animated WebP keep the original and get variants from the first frame only (`animated: true`); processing concurrency cap **3** in `pipeline.ts`, upload concurrency cap **4** in `AssetUploader`; the first 3 + queue state persist in IndexedDB; file limits unchanged from Phase 1 (50 MB image) plus MIME allow-list from Global Constraints; the API refuses SVG and unknown MIME with 415.
- [ ] **Step 1: Failing tests** incl. Review Focus #1 and #4: `variantPlan(4000,3000)` = `["w256","w1024","w2048"]`, `variantPlan(1024,500)` = `["w256"]` (1024 is not strictly smaller), `variantPlan(200,200)` = `[]`, `variantPlan(20000,200)` = all three (longest side rule); `processImage` (with a mocked `createImageBitmap`/OffscreenCanvas) on a 1×1 image returns `width 1, height 1`, no variants, no NaN; on a 0-byte blob rejects with `Error("Couldn't read image")` (not thrown past `AssetUploader.add`, which converts it to a toast); EXIF-rotated mock reports swapped dimensions; animated GIF sets `animated: true`; 300 `add()` calls never exceed 3 concurrent `processImage` and 4 concurrent PUTs (instrumented fakes) and the queue length persists across re-instantiation (fake-indexeddb); `POST /api/assets` returns presigned URLs only for `variants` requested, 415 for `image/svg+xml`, 413 above 50 MB (200 MB for `video/*`), `duplicateOf` set when an existing asset of the same owner has equal `phash` and `bytes` (and then returns no upload URLs); `resolver.url("x","w2048")` falls back to `"w1024"` then `"original"` when the variant is absent from `available()`; `ensureVariants` on an asset with only `w1024` uploads `w256` and `w2048` once and is a no-op the second time.
- [ ] **Step 2: Run → FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: multi-size image pipeline`.

### Task 4: Variant selection, LRU residency budget and the `ImageLayer` interface

**Files:**
- Create: `lib/engine/render/variant.ts`, `residency.ts`, `image-layer.ts`, `dom-image-layer.ts`
- Modify: `components/canvas/ObjectLayer.tsx`, `CanvasView.tsx` (mount the layer; image objects are no longer rendered by React), delete `components/canvas/objects/ImageView.tsx` (replaced)
- Test: `tests/unit/variant.test.ts`, `tests/unit/residency.test.ts`, `tests/unit/dom-image-layer.test.ts`

**Interfaces:**
- Consumes: Task 3 `VariantName`, `VARIANT_SIZES`, `AssetResolver.url/available`; Phase 1 `Camera`, `SpatialIndex.visible`, `Rect`, `ImageObj`.
- Produces (exact):
  ```ts
  // variant.ts
  export type ChosenVariant = VariantName | "original";
  pickVariant(i: { onScreenPx: number /* longest on-screen side, CSS px */; dpr: number; cropFraction: number /* 0..1 of the source's longest side shown, default 1 */;
    available: VariantName[]; originalLongest: number; loaded: ChosenVariant | null; gesture: boolean }): ChosenVariant
  // residency.ts
  export function decodedBytes(w: number, h: number): number            // w*h*4
  export function defaultBudgetBytes(env: { deviceMemory?: number; coarsePointer: boolean }): number // 256 MiB; deviceMemory <= 4 -> 128 MiB; coarse -> 96 MiB
  export interface ResidencyEntry { id: string; wanted: ChosenVariant; w: number; h: number /* decoded size of `wanted` */; visible: boolean; lastSeen: number }
  export class ImageResidency { constructor(opts: { budgetBytes: number });
    plan(entries: ResidencyEntry[]): Map<string, ChosenVariant>;   // may demote entries to a smaller tier so total decodedBytes <= budget
    usedBytes(): number }
  // image-layer.ts  (the Renderer-style seam for images; DomImageLayer now, WebGLImageLayer if Task 5's gate fails)
  export interface ImageLayerItem { id: string; assetId: string; rect: Rect; rotation: number; crop: Rect | null; mask: ImageObj["mask"]; flipX: boolean; flipY: boolean; grayscale: boolean; opacity: number; zIndexKey: string /* ImageObj.index */; caption: string | null /* credits overlay text, Task 16; null = none */ }
  export interface ImageLayerStats { mounted: number; residentBytes: number; variantCounts: Record<ChosenVariant, number> }
  export interface ImageLayer {
    mount(container: HTMLElement): void;
    setCamera(c: Camera): void;                       // transform only; no per-object work
    setGesture(active: boolean): void;                // true while panning/zooming/pinching: no src changes, no mounts
    update(items: ImageLayerItem[], view: { camera: Camera; viewport: { w: number; h: number }; dpr: number }): void; // visible items only
    setDimmed(ids: ReadonlySet<string> | null): void; // palette highlight (Task 10): non-listed ids drawn at 25 % opacity
    stats(): ImageLayerStats;
    destroy(): void;
  }
  export class DomImageLayer implements ImageLayer { constructor(deps: { resolver: AssetResolver; residency?: ImageResidency; now?: () => number }) }
  ```
- Rules: `needed = onScreenPx * dpr / cropFraction`; pick the smallest `available` variant with size ≥ needed; if none and `needed > 2048` and the original exists, `"original"`; otherwise the largest available (and `"original"` if `available` is empty); while `gesture` is true never pick a tier below `loaded`; when settled, downgrade only if `needed < 0.5 ×` the loaded tier's size (hysteresis). `DomImageLayer` is imperative: a keyed pool of `<img>` elements (`decoding="async"`, `draggable=false`, `loading` unset), created for items passed to `update`, returned to the pool (with `src` removed) when absent; `setCamera` writes one `transform` on the container; `update` skips `src` assignment when unchanged; each `<img>` carries `data-variant="w256|w1024|w2048|original"` and `data-dimmed="true|false"` (used by e2e); a caption, when set, is a text-only `<span>` at the bottom edge, hidden when the image is narrower than 120 on-screen px, font-size `11 / camera.z` set at settle; blob/local URLs for pending uploads work through `resolver.url`; masks via `border-radius` from `maskRadii` (Task 7 supplies it; until then rect); grayscale via `filter: grayscale(1)`; flips via `scale(-1,1)`. Mount is debounced 100 ms after the camera settles by `CanvasView` (Phase 1 behaviour) and also on doc change.
- [ ] **Step 1: Failing tests.** `pickVariant`: needed 200 → `w256`; 300 → `w1024`; 1500 → `w2048`; 2300 → `original`; no variants + original → `original`; `dpr 2` doubles the need; `cropFraction 0.25` quadruples it (a 25 % crop of a photo at 300 px needs `w2048`); `gesture: true` with `loaded: "w1024"` and a smaller need keeps `w1024`; settled with need at 60 % of loaded size keeps it, at 40 % downgrades. `ImageResidency.plan`: under budget returns wanted unchanged; over budget demotes non-visible, least-recently-seen entries first, then visible ones largest-first, one tier at a time, never below `w256`, final `usedBytes <= budget` (or all at floor); 1,000 entries wanting `w1024` with a 256 MiB budget plan in < 50 ms; `defaultBudgetBytes` table. `DomImageLayer` (jsdom): `update` mounts exactly the passed ids; removing an id returns its element to the pool and clears `src` (releases the bitmap); a second `update` with unchanged inputs performs zero DOM writes (spy on setAttribute); `setGesture(true)` then `update` with a lower need does not change `src`; `setCamera` changes only the container's transform; `setDimmed` sets 25 % opacity on non-listed ids and restores on `null`; 300 items update in < 30 ms (jsdom, generous bound).
- [ ] **Step 2: FAIL. Step 3: Implement; wire `CanvasView` to create one `DomImageLayer`, feed it `SpatialIndex.visible` image items with `ImageResidency.plan`. Step 4: PASS; `npm run build`. Step 5: Commit** `Atelier: image variant selection, memory budget and image layer`.

### Task 5: 1,000-image benchmark and the performance gate

**Files:**
- Create: `bench/run.ts`, `bench/stats.ts`, `bench/fixtures/make-board.ts`, `bench/README.md`, `app/bench/page.tsx` (404 unless `ATELIER_BENCH=1` and not production), `docs/decisions/0001-image-layer.md`
- Modify: `package.json` (`"bench": "node --experimental-strip-types bench/run.ts"`), `.github/workflows/atelier-ci.yml` (optional `bench` job, `workflow_dispatch` + push to `main`, not required)
- Test: `tests/unit/bench-stats.test.ts`, `tests/unit/bench-board.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // bench/stats.ts (pure)
  export type TraceEvent = { name: string; ph: string; ts: number /* µs */; dur?: number; args?: Record<string, unknown>; pid: number; tid: number };
  percentile(xs: number[], p: number): number                     // nearest-rank, p in 0..100, [] -> NaN
  frameIntervalsMs(events: TraceEvent[]): number[]                // gaps between consecutive "DrawFrame" events of the same layerTreeId; gaps > 250 ms (idle) dropped
  longTasks(events: TraceEvent[], thresholdMs = 50): number        // RunTask events with dur >= threshold
  summarise(intervals: number[]): { fps: number; p50: number; p95: number; p99: number; frames: number }
  // bench/fixtures/make-board.ts
  makeImageBoard(n = 1000, seed = 1): { objects: NewObject<ImageObj>[]; baseImages: { id: string; w: number; h: number }[] }
  // deterministic: seeded PRNG, 48 base images (varied aspect 9:16..16:9, 1600-4000 px longest side), n objects in a jittered grid ~ 40 columns, sizes 180-420 px, indexes via keyBetween
  ```
  `GET /bench` page: builds the 1,000-object board in a `BoardDoc`, generates the 48 base images in the browser through the real `processImage` (so the multi-size pipeline is exercised), gives each of the 1,000 objects its own `URL.createObjectURL` of a base variant (unique URLs, so the browser cannot share one decoded bitmap), mounts `CanvasView` with a fake `AssetResolver`, exposes `window.__bench = { setCamera, fitAll(), ready: Promise<void>, residentBytes() }`.
- `bench/run.ts` flow: launch Chromium (`executablePath` from `PLAYWRIGHT_CHROMIUM_PATH` if set, else the default), 1440×900 viewport, `deviceScaleFactor 2`, open `/bench`, await `__bench.ready`, then for each scenario start CDP `Tracing.start` (`categories: "devtools.timeline,disabled-by-default-devtools.timeline.frame,toplevel"`), drive input for 6 s, `Tracing.end`, parse with `stats.ts`:
  1. `pan-fit`: fit all, scripted two-finger wheel pan (60 Hz, ±40 px sweeps);
  2. `zoom-sweep`: ctrl+wheel zoom fit → 400 % → fit, three cycles;
  3. `pan-100`: 100 % zoom, diagonal pan across the board;
  4. `drag-50`: marquee 50 images, drag them 2 s (drag work must stay under 16 ms per frame: also record `p95` of the page's own pointer-to-frame time via `performance.now()` marks).
  Writes `bench/results/latest.json` (+ timestamped copy, gitignored) with per-scenario `{fps, p50, p95, p99, longTasks, jsHeapMB, residentBytes}` and the Chromium version and CPU count. **Gate:** exit code 1 if any scenario `p95 >= 20 ms` (`--ci` multiplies the threshold by `BENCH_CI_FACTOR`, default 2, because CI has software rendering; the official number is the local run recorded in `PROGRESS.md`) or if `residentBytes` ever exceeds `defaultBudgetBytes` by more than 10 %.
- [ ] **Step 1: Failing tests.** `percentile([1..100],95) = 95`, `percentile([],50)` is NaN; `frameIntervalsMs` on synthetic events spaced 16.7 ms returns ~16.7 and drops a 400 ms gap; `longTasks` counts only RunTask ≥ 50 ms; `summarise` fps = 1000 / mean interval; `makeImageBoard(1000, 1)` is deterministic (same output twice), all objects pass `validateObject`, object ids unique, indexes sorted, no two objects share an exact rect, aspect ratios within 9:16–16:9.
- [ ] **Step 2: FAIL. Step 3: Implement stats + fixture + page + runner. Step 4: PASS unit tests.**
- [ ] **Step 5: Run `npm run build && npm start & npm run bench` and record the baseline in `docs/decisions/0001-image-layer.md`** (machine, Chromium version, per-scenario p95, fps). If all four scenarios pass the gate, write "Decision: keep `DomImageLayer`; `WebGLImageLayer` not built" and mark Task 6 skipped in `PROGRESS.md`. If any fail, apply this ordered optimisation list, re-running the bench after each item and stopping at the first pass: (a) `contain: layout paint style` and `content-visibility: auto` on image elements; (b) during gestures force `w256`/`w1024` max (no `w2048`/original swaps) and defer variant upgrades until 100 ms after settle; (c) apply `will-change: transform` to the container only while `setGesture(true)`; (d) cap mounted images at 600 by raising the culling margin only when fewer than 600 are visible; (e) rasterise the layer with `transform: translate3d`. If still failing → Task 6 is **required**, record the numbers and why in the ADR.
- [ ] **Step 6: Commit** `Atelier: 1,000-image benchmark and image layer decision`.

### Task 6 (conditional): `WebGLImageLayer` fallback — execute only if Task 5's gate failed

**Files:**
- Create: `lib/engine/render/webgl-image-layer.ts`, `texture-cache.ts`
- Modify: `components/canvas/CanvasView.tsx` (layer factory), `docs/decisions/0001-image-layer.md`, `package.json` (`pixi.js` 8.x — verify MIT licence and size; lazy-import so it is not in the initial bundle)
- Test: `tests/unit/texture-cache.test.ts`, `tests/unit/image-layer-factory.test.ts`, bench re-run

**Interfaces:**
- Consumes: `ImageLayer`, `ImageLayerItem`, `ImageResidency`, `pickVariant` (Task 4).
- Produces: `class WebGLImageLayer implements ImageLayer` (one PixiJS `Application` canvas inserted under the DOM overlay; one `Sprite` per mounted item; texture source = `ImageBitmap` from `createImageBitmap(await fetch(url).blob())`; mask via a rounded-rect `Graphics` mask; grayscale via a colour-matrix filter only on items that need it; camera applied once to the stage container); `class TextureCache { constructor(budgetBytes: number); get(key: string): Texture | undefined; set(key: string, t: Texture, bytes: number): void; evict(): string[] /* LRU, never evicts keys marked in-use */ ; markInUse(keys: Set<string>): void }`; `createImageLayer(opts: { preferWebGL: boolean; webglSupported: boolean; deps }): ImageLayer` — falls back to `DomImageLayer` when WebGL context creation fails or on `webglcontextlost` that cannot be restored.
- Z-order rule: the canvas sits at the z of the lowest image; non-image objects with a lower `index` render in an underlay, all others in the overlay (an object sandwiched between two images renders above both — recorded as a known limitation in the ADR).
- [ ] **Step 1: Failing tests:** `TextureCache` evicts least-recently-used first, skips in-use keys, total bytes ≤ budget after `evict()`; `createImageLayer` returns `DomImageLayer` when `webglSupported` is false and when `preferWebGL` is false; context loss triggers the DOM fallback exactly once (fake context).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Re-run `npm run bench`; the gate must now pass; append the numbers to the ADR. Step 6: Commit** `Atelier: WebGL image layer fallback`.

### Task 7: Image tools — crop, masks, radius, opacity, grayscale, flip, replace

**Files:**
- Create: `lib/engine/images/ops.ts`, `crop.ts`, `lib/engine/input/tools/crop.ts`, `components/canvas/CropOverlay.tsx`
- Modify: `lib/engine/commands/commands.ts`, `components/chrome/ContextBar.tsx`, `components/panels/InspectorPanel.tsx`, `lib/engine/render/dom-image-layer.ts` (use `maskRadii`), `lib/engine/commands/commands.ts` (`edit.pasteStyle` style keys)
- Test: `tests/unit/image-ops.test.ts`, `tests/unit/crop-tool.test.ts`, `tests/unit/image-commands.test.ts`

**Interfaces:**
- Consumes: `ImageObj` (Task 2), `BoardDoc`, `Tool`, `ToolCtx`, `registry`, `AssetUploader.add`, `AssetResolver.available`.
- Produces (exact):
  ```ts
  export const CROP_PRESETS: { id: "free" | "1:1" | "4:5" | "3:4" | "16:9" | "9:16"; label: string; ratio: number | null }[];
  clampCrop(r: Rect): Rect                                              // inside [0,1], min size 0.02
  cropForAspect(src: { w: number; h: number }, current: Rect | null, ratio: number | null): Rect // largest normalised rect with that PIXEL ratio, centred on the current crop centre, clamped; null ratio returns current ?? {0,0,1,1}
  cropPixelAspect(src: { w: number; h: number }, crop: Rect | null): number
  applyCrop(doc: BoardDoc, id: string, crop: Rect | null, src: { w: number; h: number }): void // one transaction: sets crop; keeps x,y,w; sets h = w / cropPixelAspect
  maskRadii(img: Pick<ImageObj, "w" | "h" | "mask">): { rx: number; ry: number } // rect 0/0; rounded min(radius, w/2, h/2) both; circle w/2, h/2
  cropForReplacement(old: ImageObj, oldSrc: { w: number; h: number }, newSrc: { w: number; h: number }): Rect // keeps the box aspect and the old crop's centre and area fraction, clamped inside the new image
  setMask(doc, ids: string[], mask: ImageObj["mask"]): void; setGrayscale(doc, ids, on: boolean): void; flipImages(doc, ids, axis: "x" | "y"): void
  ```
  `CropTool` (`ToolId "crop"`): entered with Enter or double-click on a single selected image; overlay shows the whole image dimmed and the crop window with 8 handles; drag inside moves the window, handles resize (locked to the chosen preset ratio when not "free"; Shift locks the current ratio); Enter commits via `applyCrop`, Escape cancels; arrow keys nudge the window 1 % (Shift 10 %) as the keyboard alternative; Inspector "Crop" section has numeric X/Y/W/H (%) fields and the six preset buttons. Commands (all in `registry`, group `edit`): `image.crop` (Enter), `image.cropPreset.free|1:1|4:5|3:4|16:9|9:16`, `image.mask.rect|rounded|circle`, `image.grayscale`, `image.flipH`, `image.flipV`, `image.replace` (file picker → `AssetUploader.addAssetOnly` → swap `assetId`, set crop via `cropForReplacement`, keep w/h/mask/opacity), `view.toggleValueCheck` (board-wide grayscale preview via `meta.valueCheck`, view only, never changes objects). `edit.pasteStyle` for images now copies `opacity`, `mask`, `grayscale` and the crop **pixel aspect** (applied with `cropForAspect` on the destination).
- [ ] **Step 1: Failing tests:** `cropForAspect({w:4000,h:3000}, null, 1)` = `{x:0.125,y:0,w:0.75,h:1}` (a 3000×3000 px square); 16:9 on a portrait 3000×4000 source fills full width; 9:16 on a landscape source fills full height; a current crop off-centre stays inside [0,1]; `applyCrop` keeps `w` and sets `h` so `w/h === cropPixelAspect` (±1e-9), is one undo step, and `applyCrop(..., null, ...)` restores the source aspect; `maskRadii` for a 100×40 `rounded` radius 999 gives `20/20`, circle on 100×40 gives `50/20`; `cropForReplacement` keeps the box aspect when the new image has a different aspect and stays within [0,1]; replacing keeps `mask`, `opacity`, `w`, `h`; `image.replace` while the upload is pending shows the local blob and does not lose the old asset on failure; `setGrayscale` multi-select one undo step; `flipImages` toggles `flipX`/`flipY` only on images in a mixed selection; CropTool: Enter commits, Escape leaves the crop unchanged, preset locks ratio during handle drag, arrow nudge clamps at edges; paste-style copies mask/opacity/grayscale/crop ratio between two images with different sources; `view.toggleValueCheck` flips `meta.valueCheck` and does not change any object.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: image crop, masks and adjustments`.

### Task 8: Layout tools — grid, masonry, justified rows, tight pack, normalise heights, tidy, gutter

**Files:**
- Create: `lib/engine/layout/arrange.ts`
- Modify: `lib/engine/commands/commands.ts`, `components/chrome/ContextBar.tsx` (Arrange popover), `components/panels/InspectorPanel.tsx` (board Gutter field bound to `meta.gutter`)
- Test: `tests/unit/arrange.test.ts`, `tests/unit/arrange-commands.test.ts`

**Interfaces:**
- Consumes: `Rect`, `unionRects`, `BoardDoc`, `meta.gutter` (Task 2), `registry`.
- Produces (exact; all pure, no DOM, aspect ratios are never distorted):
  ```ts
  export type LayoutItem = { id: string; w: number; h: number; x: number; y: number };   // current rect
  export type Placement = { id: string; x: number; y: number; w: number; h: number };
  layoutGrid(items: LayoutItem[], o: { columns: number; gutter: number; origin?: Point; width?: number }): Placement[]
  //   cell width = (width - gutter*(columns-1)) / columns, width defaults to the selection's union width (min 200 * columns); each item scaled to fit its cell width, row height = tallest item in the row, items top-aligned; reading order = top-to-bottom then left-to-right of current centres
  layoutMasonry(items: LayoutItem[], o: { columns: number; gutter: number; origin?: Point; width?: number }): Placement[] // same column width, each item to the currently shortest column (ties: leftmost)
  layoutJustified(items: LayoutItem[], o: { targetRowHeight: number; gutter: number; width: number; origin?: Point }): Placement[] // greedy rows: add items at targetRowHeight until the row exceeds width, then scale the row so it fills width exactly; the last row stays at targetRowHeight unless filling would scale it by <= 1.25
  layoutPack(items: LayoutItem[], o: { gutter: number; aspect?: number; origin?: Point }): Placement[] // no resizing; MaxRects best-short-side into the narrowest bin that satisfies aspect (default: the selection's union aspect); binary-search the bin width
  normaliseSize(items: LayoutItem[], o: { by: "height" | "width"; target: "median" | "min" | "max" | number }): Placement[] // keeps each item's centre
  tidy(items: LayoutItem[], o: { gutter: number }): Placement[] // keeps order and sizes; rows = items whose vertical overlap > 50 % of the smaller height; row top = previous row bottom + gutter; each row left-aligned at its original min x with equal gutters
  orderByReading(items: LayoutItem[]): LayoutItem[]
  ```
  Commands (group `arrange`, enabled for ≥ 2 selected objects, one undo step each, instant — no animation): `layout.grid` (prompts columns, default `ceil(sqrt(n))`), `layout.masonry`, `layout.justified` (target row height default = median height), `layout.pack`, `layout.normaliseHeights`, `layout.normaliseWidths`, `layout.tidy`. Gutter = `doc.meta.gutter`. Children of frames keep `parentId`; moving into a different frame is not done. Locked objects are skipped. 
- [ ] **Step 1: Failing tests (Review Focus #5).** Grid: 6 equal items, 3 columns → x positions step by `colW + gutter`, no overlap; items keep aspect (`w/h` within 1e-9); masonry: column heights differ by at most the tallest item; justified: every full row's right edge equals `origin.x + width` (±1e-6) and row gaps equal gutter; last row unstretched when scale would exceed 1.25; pack: no two placements overlap or are closer than gutter (−1e-6), utilisation (sum of areas / bin area) ≥ 0.6 for 30 seeded random rects; normalise `by:"height"` `target:"median"` makes all heights equal and widths proportional; tidy: all neighbour gaps equal gutter, reading order unchanged, sizes unchanged; degenerate input: 1 item returns it unchanged, items with `w = 0` or `h = 0` are skipped (returned unchanged, no NaN), `columns = 0` is treated as 1, 2,000 items complete in < 300 ms (grid, masonry, justified, tidy) and < 1,500 ms (pack), every output finite. Commands: `layout.grid` on 6 stickies+images moves them in one undo step, skips a locked image, and is disabled with 1 selected object.
- [ ] **Step 2: FAIL. Step 3: Implement** (pure functions first, then commands and UI). **Step 4: PASS. Step 5: Commit** `Atelier: image layout tools`.

### Task 9: Colour analysis in the worker — palette extraction, dHash, asset analysis backfill

**Files:**
- Create: `lib/engine/color/extract.ts`, `lib/engine/color/phash.ts`, `app/api/assets/[id]/route.ts` (PATCH)
- Modify: `lib/assets/pipeline.worker.ts`, `pipeline.ts`, `backfill.ts`, `app/api/assets/[id]/complete/route.ts`, `lib/assets/meta-store.ts`
- Test: `tests/unit/extract.test.ts`, `tests/unit/phash.test.ts`, `tests/unit/analysis-backfill.test.ts`, `tests/unit/assets-patch-api.test.ts`

**Interfaces:**
- Consumes: Task 2 `PaletteColor`, `hexToOklab`, `oklabToHex`, `deltaE`; Task 3 `ProcessedImage`, `ensureVariants`, `AssetMetaStore`.
- Produces (exact; pure, operate on raw RGBA so they run in jsdom and in the worker):
  ```ts
  export type RawImage = { data: Uint8ClampedArray; width: number; height: number };
  extractPalette(img: RawImage, k = 8): PaletteColor[]
  //   stride-samples to <= 64 px on the longest side; ignores pixels with alpha < 128; converts to OKLab; k-means++ seeding with a PRNG seeded from width*height (deterministic), <= 16 Lloyd iterations, stop when no assignment changes; then merge clusters closer than deltaE 0.04 (weighted mean) and drop clusters under 1 % weight; return <= k colours sorted by weight desc, weights sum to 1 (±1e-6); no opaque pixels -> []
  dhash(img: RawImage): string          // 16 lower-case hex chars: 9x8 box-averaged luma (Rec.709 on sRGB bytes), bit = left > right, row-major, MSB first
  hamming(a: string, b: string): number // popcount of XOR; 64 if either is not 16 hex chars
  // pipeline: ProcessedImage.palette / .phash filled from a 64 px OffscreenCanvas readback in the worker; POST /api/assets/:id/complete stores palette, phash, analysis_version = 1
  // PATCH /api/assets/:id (owner-only, zod whitelist): { palette?: PaletteColor[] (<= 12), phash?: string, analysisVersion?: 1, title?: string (<= 200), variants?: Partial<Record<VariantName, true>>, provenance?: Provenance (stored in source_url, credit, licence, captured_at) }
  // backfill.ts
  ensureAnalysis(assetId: string, deps: { resolver: AssetResolver; meta: AssetMetaStore }): Promise<void> // assets with analysisVersion 0: fetch w256 (else w1024/original), analyse, PATCH, update meta store; serial, on idle (requestIdleCallback with 2 s timeout fallback), skipped when offline
  ```
- [ ] **Step 1: Failing tests.** `extractPalette`: image of three solid blocks (50/30/20 %) returns exactly 3 colours with those hex values and weights 0.5/0.3/0.2 (±0.02); an image with 8 distinct vivid blocks returns 8, 5 distinct blocks returns 5; all-white returns `[{hex:"#ffffff",weight:1}]`; fully transparent or 0×0 returns `[]`; near-identical shades merge (two blocks at ΔE 0.02 become one); output identical on two runs; sorted by weight desc and weights sum to 1; a 4000×3000 raw image completes in < 150 ms. `dhash`: identical images → `hamming 0`; same gradient brightened by +10 → ≤ 4; nearest-neighbour 2× upscale → ≤ 2; horizontally mirrored gradient → ≥ 20; flat image gives a valid 16-char string; `hamming("zz","0000000000000000") = 64`. PATCH API: 401/403 non-owner, rejects 13 palette entries (400), rejects unknown keys, only touches the caller's asset (other owner's id → 404). `ensureAnalysis` skips assets with `analysisVersion 1`, runs serially (max 1 in flight), is skipped while `navigator.onLine === false`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: palette extraction and perceptual hash`.

### Task 10: Live board palette, swatch card and swatch highlight

**Files:**
- Create: `lib/engine/color/aggregate.ts`, `palette-controller.ts`, `highlight.ts`, `components/canvas/objects/PaletteView.tsx`, `SwatchView.tsx`, `components/panels/PalettePanel.tsx`
- Modify: `components/canvas/ObjectLayer.tsx` (register views), `CanvasView.tsx` (apply `setDimmed`), `lib/engine/commands/commands.ts`, `components/chrome/Toolbar.tsx` (More menu: Palette, Swatch)
- Test: `tests/unit/aggregate.test.ts`, `tests/unit/palette-controller.test.ts`, `tests/unit/highlight.test.ts`, `tests/unit/palette-views.test.tsx`

**Interfaces:**
- Consumes: Task 2 `PaletteObj`, `PaletteSwatch`, `SwatchObj`, `DERIVED_ORIGIN`, `transactAs`, `formatColor`; Task 9 `AssetMetaStore`; Task 4 `ImageLayer.setDimmed`.
- Produces (exact):
  ```ts
  aggregatePalette(inputs: { palette: PaletteColor[]; area: number }[], o: { maxColors: number; locked: PaletteSwatch[]; mergeDeltaE?: number /* 0.05 */ }): PaletteSwatch[]
  //   weight = area * colour.weight, normalised to sum 1; greedy nearest-pair merge in OKLab until count <= maxColors and no pair is closer than mergeDeltaE; locked swatches seed the clusters (a colour within mergeDeltaE of a locked swatch is absorbed into it, keeping its hex, name, locked:true); locked swatches always remain in the result (weight may be 0); unlocked names "" ; sorted by weight desc; no inputs / zero total area -> locked swatches only
  imageContainsColor(palette: PaletteColor[], hex: string, o?: { tolerance?: number /* ΔE 0.08 */; minWeight?: number /* 0.04 */ }): boolean
  class HighlightStore { get hex(): string | null; set(hex: string | null): void; toggle(hex: string): void; subscribe(cb: () => void): () => void }
  dimmedImageIds(doc: BoardDoc, meta: AssetMetaStore, hex: string): Set<string>   // image objects NOT containing hex (images without a palette yet are treated as containing it, i.e. not dimmed)
  class PaletteController { constructor(deps: { doc: BoardDoc; meta: AssetMetaStore; debounceMs?: number /* 500 */ }); start(): void; stop(): void; recompute(): void }
  ```
  `PaletteController`: listens to `BoardDoc.onChange` (ignoring events whose origin is `DERIVED_ORIGIN`) and `AssetMetaStore.subscribe`; for each `PaletteObj` with `live: true` it gathers all non-`group` `ImageObj` (area = `w*h`), calls `aggregatePalette`, and **writes only if the result differs** (hex lists equal, weights equal at 3 decimals, names/locked equal), in a single `doc.transactAs(DERIVED_ORIGIN, …)`; never more than one write per recompute; `live: false` palettes are never touched. Views: `PaletteView` renders swatch chips with hex text and `%` (never colour-only), `role="list"`, each chip a `<button aria-pressed>` toggling the `HighlightStore`; locked chips show a lock icon and are labelled; `SwatchView` shows the colour block, name and the value in `format`; click copies the value (toast "Copied {value}", polite live region); command `swatch.pick` uses `window.EyeDropper` when present and is hidden otherwise. `PalettePanel` (right panel): swatch list with weights, rename (inline input), lock toggle, edit hex (`<input type="color">` + text), "Pull out as swatch card" (creates a `SwatchObj` near the viewport centre), "Live" toggle, max colours (3–12), "Add palette to board", Export menu (Task 11), highlight clears on Escape and when the panel closes. Commands: `insert.palette`, `insert.swatch`, `palette.toggleLive`, `palette.clearHighlight`.
- [ ] **Step 1: Failing tests (Review Focus #5).** `aggregatePalette`: two equal-area images with palettes `[red 1]` and `[blue 1]` → two swatches at 0.5; a 4× larger image dominates 0.8/0.2; `maxColors: 3` over 6 distinct colours returns exactly 3; a locked `#ff0000` named "Signal" absorbs a near-red colour and keeps its name and hex, and stays in the output when no image contains red (weight 0); no inputs → locked only; all-white image → one swatch weight 1; weights sum to 1. `PaletteController`: a second `recompute()` with unchanged inputs produces **zero** Yjs updates (spy on `doc.ydoc.on("update")`); a change that alters the palette produces exactly one update, with `DERIVED_ORIGIN`, and `doc.undo()` afterwards does not revert it; two images whose assets alternate palette updates 20 times in quick succession cause ≤ 20 recomputes and never trigger a recompute from the controller's own write (no loop); board with no images → palette with no swatches and no writes; `live: false` palette untouched. `imageContainsColor` true for a 40 % colour, false for a 2 % colour and for a colour at ΔE 0.3; `dimmedImageIds` excludes images without palettes. Views: chips show `%` text and toggle `aria-pressed`; clicking a swatch calls `ImageLayer.setDimmed` with the non-matching ids and Escape clears it; locked chip has an accessible name containing "locked"; copying a swatch shows a toast.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: live board palette, swatch cards and highlight`.

### Task 11: Palette exports — ASE, Procreate `.swatches`, CSS variables, Tailwind tokens, JSON

**Files:**
- Create: `lib/engine/export/palette-formats.ts`, `lib/download.ts`
- Modify: `components/panels/PalettePanel.tsx` (Export menu), `package.json` (`fflate` — MIT; check bundle size, import only `zipSync`/`strToU8` so it is tree-shaken), `lib/engine/commands/commands.ts`
- Test: `tests/unit/palette-formats.test.ts`

**Interfaces:**
- Consumes: Task 2 `hexToRgb`, `rgbToHex`; `PaletteSwatch`.
- Produces (exact):
  ```ts
  export type NamedColor = { hex: string; name: string; weight?: number };
  slugifyColorName(name: string, hex: string, used: Set<string>): string   // [a-z0-9-] only; empty/non-latin -> `swatch-{hex6}`; duplicates get -2, -3 …
  toASE(colors: NamedColor[], groupName?: string): Uint8Array
  //   "ASEF", version 1.0 (u16 1, u16 0), u32 block count; optional group start (0xC001) / end (0xC002) blocks; each colour block: type u16 0x0001, u32 length, u16 name length in UTF-16 units incl. terminating NUL, name UTF-16BE + NUL, model "RGB ", three float32 BE (r,g,b / 255), u16 colour type 2 (normal)
  toProcreateSwatches(colors: NamedColor[], paletteName: string): Uint8Array
  //   zip (fflate zipSync) holding `Swatches.json` = [{ name: paletteName, swatches: (Swatch | null)[30] }] with Swatch = { hue, saturation, brightness: 0..1 (HSB), alpha: 1, colorSpace: 0, origin: 0 }, padded with null to 30 entries; > 30 colours are split into multiple palettes named "{name} 2", …
  toCssVariables(colors: NamedColor[], o?: { prefix?: string /* "color" */; selector?: string /* ":root" */ }): string
  toTailwindTokens(colors: NamedColor[]): string      // Tailwind v4: "@theme {\n  --color-sand: #e8dcc8;\n}\n"
  toPaletteJson(colors: NamedColor[], meta: { boardTitle: string; exportedAt: string }): string // { version: 1, board, exportedAt, colors: [{ name, slug, hex, rgb: [r,g,b], oklch, weight }] }
  downloadBlob(name: string, data: Uint8Array | string, mime: string): void   // anchor + object URL, revoked after click
  ```
- [ ] **Step 1: Failing tests:** ASE bytes start `41 53 45 46 00 01 00 00`; block count = colours (+2 with a group); the first colour block for `#ff0000` named "Red" has type `0x0001`, model bytes `52 47 42 20`, floats `1.0, 0.0, 0.0`, name `00 52 00 65 00 64 00 00`, and length field equal to the real block length; unknown/invalid hex entries are skipped; Procreate zip unzips to `Swatches.json`, parses, has 30 entries with `#ff0000` → `hue 0, saturation 1, brightness 1` and `#00ff00` → `hue ≈ 0.3333`; 31 colours produce two palettes; `slugifyColorName("Warm Sand","#e8dcc8",used)` = `warm-sand`, second call `warm-sand-2`, `slugifyColorName("🔥","#ff0000",used)` = `swatch-ff0000`; a name containing `}</style>; * { display:none }` slugifies to safe characters only (no injection into CSS output); Tailwind output equals the exact string above for one colour; JSON round-trips; empty palette produces a valid empty ASE and an empty-but-valid CSS block; `downloadBlob` revokes its object URL (spy).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: palette export formats`.

(Manual check recorded in Task 19: import the generated `.ase` into a desktop design app and the `.swatches` into Procreate on an iPad; these two third-party formats are the only items not verifiable in CI.)

### Task 12: Type specimen card with on-demand Google Fonts

**Files:**
- Create: `lib/engine/fonts/font-loader.ts`, `components/canvas/objects/TypeSpecimenView.tsx`
- Modify: `components/canvas/ObjectLayer.tsx`, `components/panels/InspectorPanel.tsx` (Type section), `public/sw.js` (fonts cache), `next.config.ts` (CSP `style-src https://fonts.googleapis.com`, `font-src https://fonts.gstatic.com`), `lib/engine/commands/commands.ts`, `components/chrome/Toolbar.tsx` (More menu: Type specimen)
- Test: `tests/unit/font-loader.test.ts`, `tests/unit/type-specimen.test.tsx`

**Interfaces:**
- Consumes: Task 2 `TypeSpecimenObj`; `SpatialIndex.visible` (load only for visible specimens).
- Produces (exact):
  ```ts
  isValidFontName(name: string): boolean                  // /^[A-Za-z0-9][A-Za-z0-9 ]{0,59}$/ after trim
  googleFontsCssUrl(family: string, weights: number[], italic: boolean): string   // https://fonts.googleapis.com/css2?family=Name+Sans:ital,wght@0,400;0,700&display=swap  (axes in the required sorted order; weights de-duplicated, 100–900)
  export type FontStatus = "idle" | "loading" | "loaded" | "fallback" | "not-found";
  class FontLoader { constructor(deps?: { fetch?: typeof fetch; doc?: Document });
    status(family: string): FontStatus;
    load(family: string, weights: number[], italic: boolean): Promise<FontStatus>;  // dedupes per family+axes; adds ONE <link rel="stylesheet"> per family; resolves via document.fonts.load(`${weight} 1em "${family}"`); 400/404 from the CSS endpoint -> "not-found"; network failure or 3 s timeout -> "fallback"
    forget(family: string): void }
  FALLBACK_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif'
  ```
  `TypeSpecimenView` renders the `sample` at `size`/`weight`/`italic` in `family, FALLBACK_STACK`, a caption with family name and `licenceNote`/`sourceUrl` (link `rel="noopener noreferrer"`, http(s) only), and a status chip ("Fallback — offline" / "Font not found") using text, not colour alone. The font is requested only when the specimen is visible (culling) and only for its own family; boards with no specimens never contact Google. Inspector: family input with validation message, weight select (100–900), italic toggle, sample text (≤ 500 chars), size, licence note, source URL; changing family while typing is debounced 500 ms. The service worker caches `fonts.googleapis.com` CSS and `fonts.gstatic.com` files stale-while-revalidate in `atelier-fonts` (cap 60 entries) so previously used families work offline.
- [ ] **Step 1: Failing tests:** `isValidFontName("Playfair Display")` true, `"Inter; } body{"`, `""`, `"a".repeat(61)` false; `googleFontsCssUrl("Playfair Display",[700,400,400],false)` = `https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&display=swap` and with `italic true` uses `ital,wght@0,400;0,700;1,400;1,700`; `load` twice for one family adds exactly one `<link>`; mocked 400 → `"not-found"` and no link left in `<head>`; rejected fetch → `"fallback"` (offline) and the view shows the chip; a board with zero specimens never calls `fetch`; a specimen outside the viewport does not load its font until it becomes visible; an invalid family name never produces a network request; `TypeSpecimenView` escapes a sample of `<img src=x onerror=…>` (rendered as text).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: type specimen cards`.

### Task 13: Video and GIF objects

**Files:**
- Create: `lib/assets/video.ts`, `lib/engine/media/playback-budget.ts`, `components/canvas/objects/VideoView.tsx`
- Modify: `lib/assets/upload-queue.ts` (route by MIME), `app/api/assets/route.ts` (video limits already in Task 3), `components/canvas/ObjectLayer.tsx`, `components/chrome/ContextBar.tsx` (loop, mute, poster), `lib/engine/commands/commands.ts`, `lib/engine/clipboard/parse.ts` (video/gif files → `kind:"video"` items), `components/canvas/useDropFiles.ts`
- Test: `tests/unit/playback-budget.test.ts`, `tests/unit/video-assets.test.ts`, `tests/unit/video-view.test.tsx`

**Interfaces:**
- Consumes: Task 2 `VideoObj`, Task 3 `processImage`/`AssetUploader`, `pickVariant`, `AssetResolver`.
- Produces (exact):
  ```ts
  export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
  processVideo(file: Blob, opts?: { posterAt?: number }): Promise<{ width: number; height: number; duration: number; original: Blob; poster: ProcessedImage }>
  //   <video muted playsInline preload="metadata"> seeked to posterAt (default min(1, duration*0.1)), drawn to canvas, run through processImage; rejects with Error("Couldn't read video") when metadata fails to load within 10 s
  class PlaybackBudget { constructor(max = 3, onEvict?: (id: string) => void); request(id: string): boolean; release(id: string): void; active(): string[] }  // requesting when full evicts the least recently requested id (calls onEvict)
  // AssetUploader.add(file, at): video/mp4|webm -> VideoObj kind "video"; image/gif -> VideoObj kind "gif" (poster from the first frame via processImage with animated:true); posters upload as w256/w1024 so grids, palette and the library reuse them
  // commands: video.setPoster (captures the current frame of the active video, runs it through processImage, sets posterAssetId), video.toggleLoop, video.toggleMute, video.play (Enter / click when selected)
  ```
  `VideoView`: shows the poster image (via the same `pickVariant`) until activated; activation (click on the play button, Enter on selection) requests a `PlaybackBudget` slot and mounts `<video controls playsinline preload="metadata" muted={obj.muted} loop={obj.loop}>` (GIF: swaps `<img>` to the animated original); eviction, deselect-and-scroll-out, or Escape returns to the poster; never autoplays on mount; defaults `muted: true`, `loop: true` for GIF, `loop: false` for video; `aria-label` "{title or 'Video'} — play".
- [ ] **Step 1: Failing tests:** `PlaybackBudget(3)` requesting a 4th id evicts the least recently requested and calls `onEvict` with it; re-requesting an active id refreshes recency without eviction; `processVideo` (fake `HTMLVideoElement`) returns the poster at `min(1, duration*0.1)`, rejects after the 10 s metadata timeout (fake timers); `AssetUploader.add` of a 250 MB mp4 is rejected with a toast naming the file and 200 MB limit, creates no object; a 12 MB gif creates a `VideoObj kind:"gif"` with a poster asset; `VideoView` renders only an `<img>` when inactive (no `<video>` element in the DOM), renders `<video>` after activation, has no `autoplay` attribute, and switches back to the poster when the budget evicts it; `video.setPoster` sets `posterAssetId` in one undo step; 20 GIFs on the board never have more than 3 animated at once.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: video and GIF objects`.

### Task 14: SSRF-safe fetcher and `/api/link-preview`

**Files:**
- Create: `lib/server/safe-fetch.ts`, `lib/server/open-graph.ts`, `app/api/link-preview/route.ts`, `app/api/link-preview/image/route.ts`
- Test: `tests/unit/safe-fetch.test.ts`, `tests/unit/open-graph.test.ts`, `tests/unit/link-preview-api.test.ts`

**Interfaces:**
- Consumes: `requireOwner` (Phase 1 Task 3).
- Produces (exact):
  ```ts
  export type SafeFetchCode = "bad-url" | "blocked-address" | "too-many-redirects" | "timeout" | "too-large" | "bad-content-type" | "http-status";
  export class SafeFetchError extends Error { code: SafeFetchCode }
  isBlockedAddress(ip: string): boolean
  //   IPv4 blocked: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.0.0/24, 192.0.2/24, 192.168/16, 198.18/15, 198.51.100/24, 203.0.113/24, 224/4, 240/4, 255.255.255.255.
  //   IPv6 blocked: ::, ::1, fe80::/10, fc00::/7, ff00::/8, 2001:db8::/32, 2002::/16; IPv4-mapped (::ffff:a.b.c.d) and 64:ff9b::/96 judged by the embedded IPv4; unparseable -> blocked
  parseSafeUrl(raw: string): URL   // http/https only, no userinfo, port empty/80/443, <= 2048 chars, host not "localhost" / *.localhost / *.local / *.internal / bare single-label, host parsed by WHATWG URL (so 2130706433, 0x7f.1, 017700000001 normalise to dotted quad before the check); throws SafeFetchError("bad-url")
  export type SafeFetchOptions = { maxBytes: number; onLimit?: "error" | "truncate"; timeoutMs?: number /* 5000, total */; maxRedirects?: number /* 3 */;
    accept: RegExp /* content-type */; headers?: Record<string, string>;
    lookup?: (host: string) => Promise<{ address: string; family: 4 | 6 }[]>; request?: RequestFn /* injectable; default node:http/https */ };
  safeFetch(url: string, o: SafeFetchOptions): Promise<{ finalUrl: string; status: number; contentType: string; body: Uint8Array }>
  ```
  Behaviour: every hop (initial and each redirect, followed manually, max 3, only 301/302/303/307/308) goes through `parseSafeUrl`; DNS is resolved once per hop, **all** returned addresses must be public, and the connection is pinned to the validated address by passing a custom `lookup` to the request (prevents DNS rebinding); sends `User-Agent: AtelierLinkPreview/1.0`, `Accept-Encoding: identity`, no cookies, no `Authorization`/`Referer`; overall timeout aborts the socket; bytes counted while streaming — over `maxBytes` aborts (`too-large`) or, with `onLimit: "truncate"`, returns the first `maxBytes`; non-2xx → `http-status`; content-type not matching `accept` → `bad-content-type` (socket destroyed before reading the body).
  ```ts
  // open-graph.ts
  export interface LinkPreview { title: string; description: string; siteName: string; imageUrl: string | null; faviconUrl: string | null; finalUrl: string }
  parseOpenGraph(html: string, baseUrl: string): LinkPreview
  //   scans only the first 200 KB; title = og:title > twitter:title > <title> > hostname; description = og:description > meta description; siteName = og:site_name > hostname; image = og:image > twitter:image resolved against baseUrl, kept only if http(s) else null; favicon = <link rel~="icon"> resolved, else `${origin}/favicon.ico`; output is plain text: tags stripped, HTML entities decoded, control characters removed, whitespace collapsed; clamps title 200, description 400, siteName 100 chars
  // POST /api/link-preview  { url } -> 200 LinkPreview | 400 { error: "blocked" } | 429 | 504 { error: "timeout" } | 502 { error: "unreachable" }
  //   owner-only; 30 requests/minute per owner (in-memory, best effort across instances); safeFetch(url, { maxBytes: 512 * 1024, onLimit: "truncate", accept: /^(text\/html|application\/xhtml\+xml)/ })
  // GET /api/link-preview/image?url=  -> image bytes; owner-only; safeFetch accept /^image\/(jpeg|png|webp|gif)$/ maxBytes 5 MiB; response headers: Content-Type echoed from the allow-list only, X-Content-Type-Options: nosniff, Content-Security-Policy: default-src 'none', Cache-Control: private, max-age=3600
  ```
  Errors never reveal whether a host is internal ("blocked" covers every bad-url / blocked-address case).
- [ ] **Step 1: Failing tests (Review Focus #2, and the parser half of #3).** `isBlockedAddress` table: blocked `127.0.0.1`, `10.1.2.3`, `172.16.0.1`, `172.31.255.255`, `192.168.1.1`, `169.254.169.254`, `100.64.0.1`, `0.0.0.0`, `224.0.0.1`, `::1`, `fe80::1`, `fd00::1`, `::ffff:127.0.0.1`, `::ffff:a00:1`, `64:ff9b::7f00:1`, `garbage`; allowed `93.184.216.34`, `172.32.0.1`, `2606:4700:4700::1111`. `parseSafeUrl` rejects `file:///etc/passwd`, `javascript:alert(1)`, `ftp://x`, `http://user:pw@example.com`, `http://example.com:8080`, `http://localhost`, `http://foo.localhost`, `http://intranet`, `http://2130706433/` (becomes 127.0.0.1, then blocked at resolution), a 3,000-char URL; accepts `https://例え.jp/path` (punycode). `safeFetch` with injected fakes: hostname resolving to `[public, 10.0.0.1]` → `blocked-address` and `request` never called; 302 to `http://169.254.169.254/` → `blocked-address`, `request` called only for the first hop; 4 redirects → `too-many-redirects`; a body that never ends → `timeout` at `timeoutMs` (fake timers) and socket destroyed; 600 KB body with `onLimit:"error"` and `maxBytes 512 KB` → `too-large`, with `"truncate"` → exactly 512 KB; `text/plain` response with `accept` html → `bad-content-type`; the `lookup` passed to `request` returns the validated address (rebinding pin); no `cookie`/`authorization` headers sent. `parseOpenGraph`: normal page; `<title><script>alert(1)</script>x</title>` → `"x"`-safe plain text with no `<`; title of 5,000 chars clamps to 200; `og:image` `javascript:alert(1)` → `null`; relative `/img.png` resolved; `&amp;`/`&#39;` decoded once (no double decoding); missing everything → hostname title. API: 401 without session, 403 for a non-owner id, 400 `blocked` for `http://127.0.0.1`, 429 on the 31st request in a minute, image route 415-style 400 for `image/svg+xml`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: SSRF-safe link preview route`.

### Task 15: Link cards, embeds and paste routing

**Files:**
- Create: `lib/engine/links/classify.ts`, `embed.ts`, `components/canvas/objects/LinkView.tsx`, `EmbedView.tsx`, `lib/engine/links/link-cards.ts`
- Modify: `lib/engine/model/validate.ts` (embed origin allow-list), `lib/engine/clipboard/parse.ts`, `lib/engine/clipboard/serialize.ts` (insertPaste url branch), `components/canvas/ObjectLayer.tsx`, `lib/engine/commands/commands.ts` (`edit.pasteAsText`, `link.open`, `link.retryPreview`), `next.config.ts` (CSP `frame-src`)
- Test: `tests/unit/embed.test.ts`, `tests/unit/link-cards.test.ts`, `tests/unit/link-views.test.tsx`, `tests/unit/csp.test.ts`

**Interfaces:**
- Consumes: Task 2 `LinkObj`, `EmbedObj`, `EmbedProvider`; Task 14 `LinkPreview` and the two routes; Task 3 `AssetUploader.addAssetOnly`; Phase 1 `PasteItem`, `insertPaste`; Task 13 `PlaybackBudget` (reused with `max = 1` for live embeds).
- Produces (exact):
  ```ts
  export const EMBED_ORIGINS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com", "https://www.figma.com"] as const;
  toEmbed(raw: string): { provider: EmbedProvider; embedUrl: string; aspect: number /* w/h */ } | null
  //   YouTube: hosts exactly youtube.com, www.youtube.com, m.youtube.com, youtu.be; id /^[A-Za-z0-9_-]{11}$/ from /watch?v=, /shorts/ (aspect 9/16), /embed/, youtu.be/ID; optional numeric t/start -> ?start=N; embedUrl https://www.youtube-nocookie.com/embed/{id}
  //   Vimeo: hosts vimeo.com, player.vimeo.com; numeric id (also /channels/x/{id}); optional private hash /^[0-9a-f]{6,}$/ -> ?h=; embedUrl https://player.vimeo.com/video/{id}
  //   Figma: hosts figma.com, www.figma.com; path /(file|design|proto|board|slides)/{key}/…; embedUrl https://www.figma.com/embed?embed_host=atelier&url={encodeURIComponent(original https url)}
  //   everything else (any other host, lookalikes, userinfo, non-http(s)) -> null
  isAllowedEmbedUrl(u: string): boolean            // https and origin in EMBED_ORIGINS; used by validateObject and by EmbedView before rendering
  export type ClassifiedUrl = { kind: "embed"; provider: EmbedProvider; embedUrl: string; aspect: number } | { kind: "link"; url: string } | { kind: "none" };
  classifyUrl(raw: string): ClassifiedUrl           // http(s) only; embed when toEmbed matches, else link, else none
  createLinkCard(doc: BoardDoc, url: string, at: Point, deps: { fetchPreview: (u: string) => Promise<LinkPreview>; fetchImage: (u: string) => Promise<Blob>; uploader: AssetUploader; online: () => boolean }): string
  //   creates LinkObj {status:"loading", title: hostname, 320×240} immediately; then fetches the preview and fills title/description/siteName; fetches the image through /api/link-preview/image and `addAssetOnly` -> imageAssetId; status "ready"; on failure status "failed" (card keeps hostname); offline: stays "loading" until `online`, then retries once; never fetches twice for the same object
  ```
  `insertPaste` url branch (replaces Phase 1 "text object with a link mark"): `classifyUrl` → `EmbedObj` (width 480, height from aspect) or `createLinkCard`; `Mod+Shift+V` (`edit.pasteAsText`) keeps the Phase 1 text-with-link behaviour. `EmbedView` renders a **facade** (provider icon from `lucide-react`, title, "Play" button) and only on activation (click on the button, Enter when selected) mounts `<iframe src={embedUrl} sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture; encrypted-media" loading="lazy" title=…>` after re-checking `isAllowedEmbedUrl`; at most one live iframe on the board (a second activation returns the first to its facade); while not activated a transparent overlay owns pointer events so canvas drag/pan are never swallowed. `LinkView`: card with image, title (2-line clamp), description, site name; whole card is a single `<a href rel="noopener noreferrer nofollow" target="_blank">` only for http(s) URLs, but a plain click selects the object and opening is via double-click, Enter or the selection bar's "Open link" button; status chip text "Loading preview…" / "Preview unavailable" with a "Retry preview" button. CSP (`next.config.ts` headers): `frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.figma.com`.
- [ ] **Step 1: Failing tests (Review Focus #3).** `toEmbed` positives: `https://www.youtube.com/watch?v=dQw4w9WgXcQ`, `https://youtu.be/dQw4w9WgXcQ?t=42` (→ `?start=42`), `https://youtube.com/shorts/dQw4w9WgXcQ` (aspect 9/16), `https://vimeo.com/76979871`, `https://vimeo.com/76979871/abcdef123456` (→ `?h=abcdef123456`), `https://www.figma.com/design/AbC123/Name?node-id=1-2`; negatives (all `null`): `https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ`, `https://evil.com/?u=youtu.be/dQw4w9WgXcQ`, `https://user@youtube.com/watch?v=dQw4w9WgXcQ`, `https://www.youtube.com/watch?v=short`, `https://vimeo.com/abc`, `https://www.figma.com/community/plugin/1`, `javascript:alert(1)`, `data:text/html,x`; `classifyUrl("https://example.com/a")` is `link`, `"ftp://x"` is `none`. `validateObject` rejects an `EmbedObj` whose `embedUrl` is `https://evil.com/embed/x` or `http://www.youtube-nocookie.com/embed/x`. `EmbedView`: no `<iframe>` in the DOM until activated; the iframe has exactly the sandbox string above, `referrerpolicy` and `title`; activating a second embed removes the first iframe; an object with a tampered `embedUrl` (bypassing validation in the test) renders the placeholder, not an iframe. `LinkView`: preview title `<img src=x onerror=alert(1)>` renders as text (no `img` element created); description of 1 MB is already clamped by the parser and the view clamps again; `<a>` has `rel="noopener noreferrer nofollow"`. `createLinkCard`: success path fills fields and `imageAssetId`; failed preview → `status "failed"`; `online() === false` → no fetch until `online` fires, then exactly one; paste of a YouTube URL creates an `EmbedObj`, of `https://example.com` a `LinkObj`, of `Mod+Shift+V` a text object with a link mark; pasting 5 URLs creates 5 cards in a grid without 5 simultaneous image fetches (max 2 concurrent previews). `csp.test.ts`: the configured header contains the three `frame-src` origins and no wildcard.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: link cards and embeds`.

### Task 16: Provenance fields and credits overlay

**Files:**
- Create: `lib/assets/provenance.ts`
- Modify: `components/panels/InspectorPanel.tsx` (Source section), `lib/engine/clipboard/parse.ts` (attach `provenance` to image `PasteItem`s), `lib/assets/upload-queue.ts` (pass provenance to the new object and, on first capture only, to `PATCH /api/assets/:id`), `lib/engine/render/dom-image-layer.ts` + `CanvasView.tsx` (caption items), `components/canvas/objects/VideoView.tsx`, `lib/engine/commands/commands.ts`
- Test: `tests/unit/provenance.test.ts`, `tests/unit/credits-overlay.test.ts`

**Interfaces:**
- Consumes: Task 2 `Provenance`, `meta.showCredits`; Task 9 PATCH route; Task 4 `ImageLayerItem.caption`.
- Produces (exact):
  ```ts
  emptyProvenance(): Provenance                                   // { sourceUrl: null, credit: "", licence: "", capturedAt: null }
  validateProvenance(p: unknown): Provenance | null               // sourceUrl http(s) <= 2048 or null; credit <= 200; licence <= 100; capturedAt "YYYY-MM-DD" or full ISO or null; anything else -> null
  extractProvenance(input: { html?: string; uriList?: string; pageUrl?: string; title?: string; now?: Date }): Provenance | null
  //   sourceUrl = pageUrl ?? first http(s) line of uriList ?? first absolute http(s) <img src> in html (data:/blob: ignored); credit "" (never guessed); capturedAt = now as YYYY-MM-DD; returns null when no sourceUrl found and no title
  creditLine(p: Provenance | null): string                        // "Credit · Licence"; falls back to the sourceUrl hostname; "" when nothing
  saveProvenance(doc: BoardDoc, id: string, p: Provenance, deps: { patchAsset: (assetId: string, p: Provenance) => Promise<void>; assetHasProvenance: (assetId: string) => boolean }): void // writes the object (source of truth, travels with the doc, snapshots and share links); calls patchAsset only if the asset has none yet (first capture wins, never overwrites)
  // commands: view.toggleCredits (flips meta.showCredits; view-only), image.editSource (focuses the Inspector Source section)
  ```
  The Web Share Target / paste flows pass `{ pageUrl: url, title }` into `extractProvenance` (Task 17). Inspector "Source" section for one selected image/video: fields Source URL, Credit, Licence (free text with suggestions "CC BY 4.0", "CC BY-SA 4.0", "CC0", "All rights reserved", "Editorial use only"), Captured (date input); inline validation messages; the source URL is shown as a link with `rel="noopener noreferrer"`. Caption text = `creditLine` and is only emitted into `ImageLayerItem.caption` when `meta.showCredits` is true.
- [ ] **Step 1: Failing tests:** `validateProvenance` rejects `{sourceUrl:"javascript:alert(1)"}`, a 201-char credit, `capturedAt:"yesterday"`; accepts `"2026-11-12"`; `extractProvenance({html:'<img src="https://images.example.com/a.jpg">'})` → that URL; with `pageUrl` it prefers the page URL; `data:` and `blob:` image sources → `null`; `creditLine({credit:"Jane Doe",licence:"CC BY 4.0",…})` = `"Jane Doe · CC BY 4.0"`, only a source URL gives its hostname, empty gives `""`; `saveProvenance` is one undo step, writes the object, and does **not** call `patchAsset` when the asset already has provenance; credits overlay: `view.toggleCredits` changes `meta.showCredits` only (object `updatedAt` unchanged), captions appear for images with a credit line and not for others, caption text is escaped (`<b>` renders literally), captions are hidden under 120 px on-screen width, VideoView shows the same line; a collaborating device sees the toggle (meta syncs).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: image provenance and credits overlay`.

### Task 17: Inbox — API, page, Web Share Target, quick-capture

**Files:**
- Create: `app/api/inbox/route.ts`, `app/api/inbox/[id]/route.ts`, `lib/server/inbox.ts`, `app/inbox/page.tsx`, `app/share-target/route.ts`, `public/sw-share.js`, `lib/inbox/inbox-client.ts`, `lib/inbox/share-queue.ts`, `lib/inbox/place.ts`, `components/panels/InboxPanel.tsx`, `components/chrome/QuickCapture.tsx`
- Modify: `app/manifest.ts` (`share_target`), `public/sw.js` (`importScripts("/sw-share.js")`, route `POST /share-target`), `components/canvas/useDropFiles.ts` (custom drag type), `components/chrome/TopBar.tsx` and `components/home/*` (Inbox link + unplaced-count badge), `lib/engine/commands/commands.ts`
- Test: `tests/unit/inbox-api.test.ts`, `tests/unit/inbox-client.test.ts`, `tests/unit/sw-share.test.ts` (loads `public/sw-share.js` in a Node `vm` with stubbed globals), `tests/unit/inbox-place.test.ts`, `tests/unit/manifest.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1 `inbox_items`; Task 3 `AssetUploader.addAssetOnly`; Task 15 `classifyUrl`, `createLinkCard`; Task 16 `extractProvenance`; Task 13 video upload; Phase 1 `requireOwner`, `registry`, `toast`.
- Produces (exact):
  ```ts
  export type InboxKind = "image" | "video" | "url" | "text";
  export interface InboxItem { id: string; kind: InboxKind; assetId: string | null; url: string | null; text: string | null; title: string | null; sourceUrl: string | null; credit: string | null; createdAt: string; placedAt: string | null }
  export type NewInboxItem = Omit<InboxItem, "id" | "createdAt" | "placedAt">;
  // POST /api/inbox NewInboxItem -> { id }   owner-only; image/video need assetId owned by the caller; url http(s) <= 2048; text <= 10,000; title <= 300
  // GET /api/inbox?placed=0|1&limit=100&before=ISO -> { items: InboxItem[]; unplaced: number }
  // PATCH /api/inbox/[id] { placed: boolean } ; DELETE /api/inbox/[id]
  class InboxClient { constructor(deps: { api: InboxApi; idb?: IDBFactory });
    add(item: NewInboxItem): Promise<void>;           // persisted in IndexedDB `atelier-inbox-queue` first, then POSTed; retries 1 s -> 60 s; survives reload; 401 leaves the queue intact and sets status "needs-login"
    list(): Promise<(InboxItem & { pending?: boolean })[]>; markPlaced(id: string): Promise<void>; remove(id: string): Promise<void>;
    pending(): number; status: "idle" | "syncing" | "offline" | "needs-login"; subscribe(cb: () => void): () => void }
  // public/sw-share.js (plain JS, no imports) defines self.AtelierShare:
  //   parseShareForm(form: FormData): { id; receivedAt; title; text; url; files: { name; type; blob }[] }
  //     caps: <= 10 files; image <= 50 MB, video <= 200 MB; MIME allow-list from Global Constraints (SVG dropped); title <= 300, text <= 10,000, url <= 2048 (longer values truncated); unknown fields ignored; if `url` is empty and `text` is a single http(s) URL (Android puts the link in `text`) -> promoted to `url`
  //   enqueueShare(idb: IDBFactory, payload): Promise<void>   // DB "atelier-share-inbox", store "shares"
  //   handleShareTarget(request: Request, idb: IDBFactory): Promise<Response>   // stores first, then 303 -> "/inbox?shared=1"; any error -> 303 "/inbox?shared=error"; nothing is fetched or sent to the server here
  // lib/inbox/share-queue.ts: drainShares(idb, handler: (p: SharedPayload) => Promise<void>): Promise<number>  // removes a payload only after its handler resolved
  // lib/inbox/place.ts
  placeInboxItem(doc: BoardDoc, item: InboxItem, at: Point, deps: PlaceDeps): string[]   // image/video -> ImageObj/VideoObj with provenance copied from AssetMeta/item; url -> classifyUrl -> EmbedObj | createLinkCard; text -> TextObj; then InboxClient.markPlaced(item.id)
  // manifest: share_target = { action: "/share-target", method: "POST", enctype: "multipart/form-data", params: { title: "title", text: "text", url: "url", files: [{ name: "media", accept: ["image/*", "video/mp4", "video/webm"] }] } }
  ```
  `/inbox` page: on mount `drainShares` → for each file `addAssetOnly` (images/GIF/video through the normal pipeline) then `InboxClient.add`; urls and text added directly with `extractProvenance({ pageUrl: url, title })`; grid of items (image thumbnails via `w256`, url items show hostname + title, text items a snippet; all text rendered escaped), multi-select, delete, and "Open in board…" (board picker → `/b/{id}?inbox=1` opens the Inbox panel). Editor `InboxPanel`: list of unplaced items; each item is a drag source (`application/x-atelier-inbox` = item id) **and** has an "Add to board" button placing it at the viewport centre (non-drag alternative); dropping on the canvas calls `placeInboxItem`. `QuickCapture` dialog (`inbox.capture`, `Mod+Shift+I`, also a button on the home page): one text area (URL or text), file picker/drop, paste; submit → `InboxClient.add`; works offline (queued). Known platform limit (documented in the UI help text and DEPLOY.md): Web Share Target works from the Android share sheet once Atelier is installed; iOS Safari does not support it, so iOS uses Quick capture or paste.
- [ ] **Step 1: Failing tests.** API: 401/403 for non-owner; `text` of 10,001 chars → 400; `image` without `assetId` → 400; `assetId` owned by someone else → 400; `url` `javascript:x` → 400; GET `placed=0` excludes placed items and `unplaced` counts only unplaced; DELETE/PATCH another owner's id → 404; `before` pagination. `sw-share.js`: `parseShareForm` with 11 files keeps 10; a 51 MB image and an `image/svg+xml` file are dropped; `text: "https://example.com/a"` with empty `url` → `url` promoted, `text` empty; fields over the caps are truncated; unknown fields ignored; `handleShareTarget` stores the payload then returns a 303 to `/inbox?shared=1` and performs no network request; a throwing IndexedDB returns 303 `/inbox?shared=error` (no unhandled rejection). `drainShares`: payload stays in the store when the handler rejects, removed when it resolves, order preserved. `InboxClient`: `add` while offline queues and `pending() === 1`, flushes on `online`; reload (new instance, same fake-indexeddb) still has the queue and sends it once; 401 → `needs-login`, queue intact; `markPlaced` offline is queued. `placeInboxItem`: image item creates an `ImageObj` with provenance and calls `markPlaced`; url item for a YouTube link creates an `EmbedObj`; text creates a `TextObj`; placing the same item twice creates objects twice but marks placed once. Manifest test: `share_target` has exactly the shape above. Quick capture: Enter in the URL field submits; pasting a file adds it; focus returns to the trigger on close.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: inbox, share target and quick capture`.

### Task 18: Asset library — usage tracking, "used in N boards", duplicates

**Files:**
- Create: `lib/assets/usage-tracker.ts`, `lib/server/library.ts`, `app/api/boards/[id]/assets/route.ts`, `app/api/assets/duplicates/route.ts`, `app/library/page.tsx`, `components/library/AssetGrid.tsx`, `DuplicateGroups.tsx`
- Modify: `app/api/assets/route.ts` (GET list), `app/api/assets/[id]/route.ts` (GET, DELETE), `components/panels/InspectorPanel.tsx` ("Used in N boards" for a selected image), `components/home/*` (Library link), `lib/assets/upload-queue.ts` (reuse on `duplicateOf`), `app/b/[boardId]/page.tsx` (start `UsageTracker`)
- Test: `tests/unit/usage-tracker.test.ts`, `tests/unit/library-api.test.ts`, `tests/unit/asset-grid.test.tsx`

**Interfaces:**
- Consumes: Task 1 `asset_usages`, `similar_assets`, `hamming`; Task 9 `phash`; Task 3 `duplicateOf`; Task 2 object types.
- Produces (exact):
  ```ts
  collectAssetIds(doc: BoardDoc): string[]       // unique: image.assetId, video.assetId + posterAssetId, link.imageAssetId
  class UsageTracker { constructor(deps: { doc: BoardDoc; boardId: string; api: { putUsage(boardId: string, assetIds: string[]): Promise<void> }; debounceMs?: number /* 5000 */ }); start(): void; stop(): void; flush(): Promise<void> }
  //   sends on open and after debounced changes, only when the id set differs from the last successfully sent set; failures retry on the next change or `online`
  // PUT /api/boards/[id]/assets { assetIds: string[] (<= 5000) } -> { count }   owner-only; replaces asset_usages rows for the board; ids not owned by the caller are ignored
  export interface LibraryAsset extends AssetMeta { usedIn: number; boards: { id: string; title: string }[] /* <= 5 */; createdAt: string; similarTo: string[] }
  // GET /api/assets?query=&kind=&sort=recent|used|size&unused=1&limit=100&before=ISO -> { assets: LibraryAsset[] }  (hidden = false; usedIn counts only boards with deleted_at is null)
  // GET /api/assets/[id] -> LibraryAsset;  DELETE /api/assets/[id] -> 204, or 409 { error: "in-use" } when usedIn > 0 (deletes the R2 objects `a/{id}/*` and the row)
  // GET /api/assets/duplicates -> { groups: { assetIds: string[]; dist: number }[] }   clusters of >= 2 assets with hamming <= 6 (dist = max within group); exact matches have dist 0
  ```
  Library page `/library`: grid (thumbnails via `w256`), filters All / Unused / Possible duplicates, sort (Recent, Most used, Largest), search over title/credit/source; each card shows "Used in N boards" as text (popover lists up to 5 board titles linking to them), a "Possible duplicate" badge with a link to its group, "Send to Inbox" (creates an inbox item so it can be placed on any board, reusing Task 17) and "Delete" (disabled with explanation unless `usedIn = 0`; confirm dialog). `DuplicateGroups` shows each group side by side with sizes, `usedIn` per member, and "Delete unused copies" (never touches a member with `usedIn > 0`). On upload, `duplicateOf` makes `AssetUploader` reuse the existing asset with toast "Already in your library — reused"; inserting an asset already on the current board shows "Already on this board" (non-blocking).
- [ ] **Step 1: Failing tests.** `collectAssetIds` over a doc with 2 images sharing an asset, a video with a poster, a link with an image, a text → 4 unique ids; `UsageTracker`: does not send when the set is unchanged, sends once for 10 changes within the debounce, retries after a rejected PUT on the next change, `flush()` sends immediately; PUT API: replaces the previous set (asset removed from board → row deleted), ignores another owner's asset id, 5,001 ids → 400, 401/403 non-owner, other owner's board → 404; library API: `usedIn` excludes soft-deleted boards (create 2 boards, soft-delete one → count 1), `unused=1` filter, `sort=used`, `query` matches credit text, `hidden` excluded, DELETE of a used asset → 409 and nothing removed, DELETE of an unused asset removes row and calls R2 delete for its keys; duplicates API groups `000…0` / `000…f` (dist 4) together and not an asset at dist 10, never mixes owners; `AssetGrid`: every card has an accessible name, "Used in 3 boards" is text, delete is `aria-disabled` with `aria-describedby` explanation when in use; duplicate group "Delete unused copies" never selects a used member.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: asset library and duplicate detection`.

### Task 19: End-to-end, accessibility, benchmark re-run, deploy notes

**Files:**
- Create: `e2e/images.spec.ts`, `e2e/layout.spec.ts`, `e2e/palette.spec.ts`, `e2e/links.spec.ts`, `e2e/inbox.spec.ts`, `e2e/library.spec.ts`, `e2e/a11y-phase2.spec.ts`, `e2e/fixtures/` (3 small JPEG/PNG, 1 GIF, 1 mp4 ≤ 200 KB, a corrupt 0-byte `.jpg`)
- Modify: `docs/PROGRESS.md`, `docs/DEPLOY.md`, `README.md`, `.github/workflows/atelier-ci.yml`, `scripts/test-rls.sh` (already iterates migrations)

**Interfaces:** consumes everything; runs with `ATELIER_LOCAL_ONLY=1` (library and inbox pages use `page.route` JSON stubs because there is no database in local-only mode).
- [ ] **Step 1: Write specs.** (images) drop 3 fixtures → zoom to 400 % → the on-screen `<img>` has `data-variant="w2048"` (or `original` above 2048 px), zoom out to fit → `w256`; crop to 16:9 via the Inspector preset button, mask circle, grayscale on, flip, replace image keeping crop, undo each; drop the corrupt 0-byte file → toast names it, no object, no console error. (layout) select 12 images → ⌘K "Grid" → positions form 4 columns with 16 px gutters (read via the Inspector) → undo restores. (palette) insert palette → swatches appear after analysis → click a swatch → non-matching images get `data-dimmed="true"` → Escape clears; Export → "CSS variables" download contains `--color-`. (links) paste a YouTube URL → facade, click → one iframe with the exact `sandbox`; paste `https://example.com` with `/api/link-preview` stubbed → card title; paste `http://127.0.0.1:3000` (real route) → card ends in "Preview unavailable" and no request reaches it; type specimen "Playfair Display" with the Google Fonts hosts blocked via `page.route` → fallback chip, board still usable. (inbox) after the service worker is active, `fetch("/share-target", { method: "POST", body: formData })` from the page → follow to `/inbox?shared=1` → item present → drag onto canvas (and again with the "Add to board" button) → object created. (library) page renders stubbed assets with "Used in 3 boards" and a disabled delete. (a11y) axe: zero serious/critical on `/inbox`, `/library`, the Palette panel open, the Inspector Type and Source sections, and the Arrange popover; all new toolbar/menu items keyboard-operable.
- [ ] **Step 2: Run `npm run e2e` → fix until green on `desktop` and `phone`.**
- [ ] **Step 3: Benchmark and memory.** Run `npm run bench`; copy the table into `docs/PROGRESS.md` (gate: every scenario p95 < 20 ms, resident bytes within budget). Manual checks recorded as passed/failed in `PROGRESS.md`: 1,000-image board on iPad Safari (≥ 30 fps, no crash); import the generated `.ase` into a desktop design app and the `.swatches` into Procreate; share an image from Android Chrome (installed PWA) into the Inbox.
- [ ] **Step 4: Docs.** `docs/DEPLOY.md`: owner-run step to apply `0002_atelier_phase2.sql` with the Supabase MCP `apply_migration` to project `rvbllpkhwakjuahxyfff` (after the owner's go-ahead), no new env vars, CSP now allows Google Fonts and the three embed origins, Web Share Target needs the installed Android PWA and does not exist on iOS. `README.md`: Phase 2 features. CI: optional `bench` job described in Task 5.
- [ ] **Step 5: Final gate:** `npm run typecheck && npm run lint && npm test && npm run build && npm run e2e && npm run bench` and `scripts/test-rls.sh` all pass; `PROGRESS.md` lists every SPEC §2 Phase 2 bullet and §8 rows for Phase 2 as passed/failed.
- [ ] **Step 6: Commit** `Atelier: phase 2 end-to-end tests, benchmark results and deploy notes`.

---

## Phase 2 acceptance (from SPEC §2, §8)

256/1024/2048 WebP variants + original with per-zoom selection and an LRU memory budget · 1,000-image benchmark at p95 < 20 ms (or the WebGL fallback) · crop with aspect presets, rectangle/rounded/circle masks, radius, opacity, grayscale value-check, flip, replace-keeping-crop · grid, masonry, justified, tight pack, normalise heights, tidy, gutter · worker palette extraction, live board palette with % weights, swatch highlight, lock/rename, ASE / Procreate / CSS / Tailwind / JSON exports · type specimen cards loading only the used Google Font with an offline fallback · video and GIF objects · link cards with SSRF-safe previews and YouTube/Vimeo/Figma embeds · swatch card · provenance fields and credits overlay · Inbox with Web Share Target and quick capture · asset library with "used in N boards" and perceptual-hash duplicate detection · migration `0002` with RLS tests · all tests and CI green.

Deferred by design: server-side variant jobs for HEIC the browser cannot decode (Phase 1 behaviour kept: reject with a toast), share/present/export (Phase 3), connector routing, mind maps, nested boards (Phase 4).
