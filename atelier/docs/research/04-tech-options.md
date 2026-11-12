# 04 — Tech options for a personal infinite-canvas moodboard (Miro-like)

Research date: 2026-11-12. Audience: one designer (owner) + clients/collaborators via share links.
House stack (from `stash/`): Next.js 16.3 App Router + TS, React 19.2, Tailwind 4, Supabase (Postgres/Auth/Storage/Realtime), Vercel, hand-written `public/sw.js` + `app/manifest.ts` PWA, Cloudflare R2 already chosen for Stash video. Supabase free tier is already used by 2 active projects (rss-reader, stash), which matters for the cost section.

**Sources / method and blocked hosts.** WebFetch could not resolve `tldraw.dev`, `liveblocks.io`, `supabase.com`, `developers.cloudflare.com`; `api.npmjs.org` (download counts) was refused by the proxy. Facts below come from: (1) the npm registry (`npm view`, exact versions/dates/licences below); (2) the shipped tldraw 5.6.0 and 3.15.6 tarballs (`DOCS.md`, `RELEASE_NOTES.md`, licence-enforcement source read directly); (3) the Supabase docs MCP (authoritative pricing/limits tables); (4) WebSearch summaries (marked "reported" where only third-party). Re-check prices before buying.

---

## 0. TL;DR recommendation

| Layer | Pick | Why |
|---|---|---|
| Canvas engine | **tldraw SDK 5.6.0** (`tldraw`, `@tldraw/sync`) — *gated on a licence decision* (see §A.1) | Only option that ships images/video/crop/frames/arrows/rich text/embeds/export/pen mode/comments/multiplayer, mature (tldraw.com runs on it). Building the same is 4–9 months solo. |
| Licence path | Build on 5.x (free in dev, 100-day prod trial). Before launch: apply for **hobby** key (free, watermark) or get a **commercial** quote. Fallback with zero licence cost: pin **tldraw 3.15.6** (watermark, no key needed). Last-resort fallback: custom engine (§A.3). | 5.x **stops rendering after 5 s in production without a valid key** — a hard dependency you must settle before clients rely on links. |
| Realtime sync | **tldraw sync, self-hosted on Cloudflare Durable Objects** (official `sync-cloudflare` template) | One DO per board, SQLite persistence, WebSocket hibernation, per-session `isReadonly` + comment-only lane = view/comment/edit roles out of the box. Vercel can't host this well (WS capped at function max duration, default 5 min). |
| Board docs | DO SQLite = live doc; nightly/“on idle” snapshot JSON → R2 (+ row pointer in Postgres) for history/backup | Keeps Postgres small; snapshots give restore + engine-neutral escape hatch. |
| Images/files | **Cloudflare R2** (zero egress) + client-generated renditions (256/1024/2048 px WebP) + original; served via custom domain with immutable cache | 20 GB ≈ $0.15/mo. Same vendor as Stash and as the sync worker. |
| Auth / metadata | **Supabase** Auth (email+password, TOTP MFA; passkeys beta) + Postgres tables `boards`, `board_members`, `share_links`, `assets`, RLS | Matches house stack. Guests don't need Supabase accounts: Next.js route validates link → mints short-lived JWT for the sync worker. |
| App shell | **Next.js 16 on Vercel** (as Stash) | Pages: dashboard, `/b/[id]` editor (client-only, `dynamic(..., {ssr:false})`), `/s/[token]` share landing. |
| Export | Client-side: `editor.toImage` / `getSvgString` per frame/selection; multi-page PDF via jsPDF 4.2.1 (+svg2pdf for vector) | No headless Chromium needed; server Chromium only if you later need scheduled/emailed PDFs. |
| PWA / iPad | Reuse Stash's `app/manifest.ts` + hand-written `sw.js` (app-shell cache only); tldraw pen mode handles Apple Pencil | |

Realistic running cost for one heavy user with 5–20 GB of images: **$0–5/mo on free tiers** (with caveats: Vercel Hobby and tldraw hobby are both "non-commercial"; Supabase free pauses idle projects) or **~$50/mo "properly licensed infra"** (Vercel Pro $20 + Supabase Pro $25 + Workers Paid $5 + R2 <$1) — **plus the tldraw commercial licence if you go that way (reported ~$6k/yr)**.

---

## A. Canvas engine options

### A.1 tldraw SDK

**Versions (npm, 2026-11-12):** `tldraw` 5.6.0 (published 2026-10-28; 5.0.0 on 2026-05-06; 4.0.0 on 2025-09-18). `@tldraw/sync` / `@tldraw/sync-core` 5.6.0. Licence field: "SEE LICENSE IN LICENSE.md" → the *tldraw license* (source-available, not OSI).

**Licence (from shipped DOCS.md, v5.6.0):**

| Type | Watermark | Duration | Purpose |
|---|---|---|---|
| Trial | No | 100 days, no grace | Evaluate; one per company/project |
| Commercial | No | Annual (+30-day grace) | "required for any commercial use in production"; price via sales |
| Hobby | Yes ("made with tldraw") | Varies | Non-commercial; **discretionary**, each request reviewed |

- Dev (http, localhost, or `NODE_ENV!=='production'`) needs no key. **Production without a valid key: console errors, then after 5 s the editor stops rendering.** Key is validated locally (signature, allowed hosts incl. wildcards, expiry) — no licence-server call; can live in `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`.
- Hobby/trial keys ping tldraw with licence ID, SDK version and page URL (no canvas content). Commercial sends nothing.
- **Commenting (anchored threads, v5.3+) is a separately licensed feature**; without a licence that includes it, comment components render nothing in production.
- Hobby page wording (reported): "personal projects and early experiments; student work, research, side projects, prototypes, and ideas that aren't a business yet." A working designer sharing boards with paying clients is plausibly *commercial* → ask sales@tldraw.com in writing.
- Commercial price is not published; multiple third-party sources report **~$6,000/yr at the 4.0 launch** (Sept 2025), discounted startup pricing on application. Disproportionate for one user — the core risk of this choice.
- **v3 escape hatch (verified in source):** `tldraw@3.15.6` (published 2026-02-11, last 3.x) — its `LicenseProvider` only blocks rendering for an expired *internal* key; an unlicensed production deployment renders **with the watermark**. The v3.0 release terms said use in commercial and non-commercial projects is allowed as long as the watermark is visible. Caveats: frozen line (no new features/fixes; you miss v4/v5 perf work, rich-text TipTap upgrades, comments, hibernation support in sync); the package's LICENSE.md is just a link to the *current* main-branch licence, so get written confirmation that 3.x terms still apply to you. `@tldraw/sync@3.15.6` exists.

**Features out of the box (5.x):** select/transform/rotate/snap/align/distribute/group/lock, geo shapes, arrows with bindings + labels (elbow/precise), lines, freehand draw/highlight with real Apple-Pencil pressure (perfect-freehand), notes (sticky), rich text (TipTap; v5.5 smart typography), **frames** (export-bounds containers, nesting), **images** (crop, flip, animated GIF/WebP/AVIF/APNG flag), **video** assets/shapes, **bookmarks** (needs your unfurl endpoint), **embeds** (YouTube, Figma, etc., custom embed definitions, iframe sandboxing), pages, laser pointer, follow-user, cursors/presence, undo/redo, copy/paste (incl. images, URLs, Mermaid text), drag-drop files, keyboard nav, WCAG 2.2 AA work (v4), dark mode/themes (v5 theme system), custom shapes/tools/UI overrides/custom records & assets (v5), readonly mode, camera constraints + `zoomToBounds` (slideshow example), local IndexedDB persistence (`persistenceKey`), export (SVG/PNG/JPEG/WebP, scale, pixelRatio, padding, transparent bg, per-frame exact bounds).

**Performance:** DOM/SVG shapes positioned with CSS transforms (React + signals, per-shape re-render), R-tree spatial index, viewport culling (`display:none` for off-screen shapes), LOD (simpler geometry and no text shadows when zoomed out, debounced zoom above 500 shapes). Default `maxShapesPerPage` = **4000** (configurable) and `maxImageDimension` = 5000 px (larger uploads downscaled). Images: `TLAssetStore.resolve(asset, ctx)` receives `screenScale`, `dpr`, `networkEffectiveType`, `shouldResolveToOriginal` → return a rendition URL per zoom level; original only for export/copy. That hook is what makes "hundreds of high-res images" feasible — without renditions the browser decodes full-size bitmaps (a 24 MP photo ≈ 96 MB RGBA) and iPad Safari will evict/crash.

**Multiplayer (tldraw sync):** server-authoritative record sync (not a CRDT); `useSync({uri, assets})` client; `TLSocketRoom` server. Official Cloudflare template: one Durable Object per room, state in DO SQLite, assets in R2; v5 adds WebSocket-hibernation APIs (`onSessionSnapshot`, `handleSocketResume`) so idle rooms cost ~nothing. You add: auth, upload size limits/rate limits, history snapshots, room listing. Per-session `isReadonly` and an "object-store lane" with separate `objectAccess` + `canComment` → maps exactly to view / comment / edit. Must have exactly one `TLSocketRoom` per room globally (DOs guarantee that). Alternatives: Node `sync-core` server (Fly/Render/Railway), Liveblocks Storage (official Liveblocks example `nextjs-tldraw-whiteboard-storage`), Yjs bridge (community `tldraw-yjs` example; laggy reports for WIP Liveblocks-Yjs bridge).

**Maturity:** very high: ~monthly minors, big changelogs, used by tldraw.com and many SaaS; breaking changes per major (agent "migration skill" provided). Risk = licence/pricing changes (already changed at v3 and v4).

### A.2 Excalidraw (`@excalidraw/excalidraw` 0.18.1, MIT)

- Features: rectangle/diamond/ellipse/arrow (incl. elbow arrows, bindings)/line/freedraw/text/**image** (with crop, 2025)/frames/embeddables (iframe, `validateEmbeddable`)/element links, libraries, export PNG/SVG/clipboard, `excalidrawAPI` imperative API, `updateScene`, `onChange`. No video element, no rich text, single-canvas Canvas2D renderer (static + interactive canvas).
- **Aesthetic limitation:** rough.js hand-drawn look is the identity. `roughness: 0` + "Normal"/code fonts gets you "cleaner" but still Excalidraw-ish strokes, fills and UI — wrong default for a premium client-facing moodboard.
- Images: stored as `BinaryFiles` (dataURL + `fileId`) next to elements; host app must persist files itself (e.g., upload to R2 and rehydrate via `addFiles`). No built-in zoom-dependent renditions → hundreds of large images are memory-heavy; known lag on scenes with thousands of elements (reported).
- Collaboration: not in the library. excalidraw.com uses `excalidraw-room` (socket.io relay) + end-to-end encryption (key in URL fragment) + Firebase for persistence; you implement reconciliation (element `version`/`versionNonce`) and presence yourself, or bolt on Yjs/Liveblocks.
- Licence MIT, free, no watermark. Release cadence of the npm package is slow (0.18.x for ~1.5 years; Excalidraw+ is the commercial product, ~$6–7/user/mo).
- Verdict: great for diagrams/whiteboarding, poor fit for image-heavy design moodboards.

### A.3 Building custom

| Base | Version/licence | Strengths | Weaknesses for this app |
|---|---|---|---|
| DOM + CSS transforms (React, `transform: matrix()` on a world div) | — | Native text editing/selection, `<img srcset>`/`<video>`/iframes free, CSS filters, accessibility; tldraw proves it scales to thousands of shapes with culling | Need own culling, spatial index, hit-testing; many-image compositing cost on GPU; SVG export by hand |
| Konva / react-konva | konva 10.9.1, react-konva 19.3.2, MIT | Scene graph, events, Transformer, layers (one canvas each), caching, good React binding | Canvas2D: text editing needs DOM overlay; perf ok to low thousands of nodes; image LOD by hand |
| PixiJS v8 | 8.23.0, MIT | WebGL/WebGPU, fastest for thousands of sprites, mipmaps, texture GC, render groups | Lower-level: no transformer/selection UI, text is bitmap/canvas text; DOM overlay for editing; you build the whole editor |
| Fabric.js | 7.4.0, MIT | Rich object model, built-in controls, filters, SVG import/export, good for single-artboard editors | Single canvas, not designed for infinite canvases; reported slow with many images |
| Leafer.js | leafer-ui 2.3.4, MIT | Claims 1M shapes, editor plugin (move/scale/rotate/multi-select), partial rendering, infinite canvas focus | Mostly Chinese docs/community, vendor-only benchmarks, smaller Western ecosystem |
| Plain Canvas2D/WebGL | — | Total control | Everything from scratch |

**Effort estimate (one dev, experienced, AI-assisted):**
- MVP moodboard (pan/zoom incl. pinch, images with LOD renditions, text, sticky notes, frames, rect/ellipse, select/move/resize/rotate/multi-select, snapping guides, z-order, undo/redo, clipboard + drag-drop upload, persistence, read-only share): **8–12 weeks**.
- + realtime multiplayer (Yjs + y-partyserver/Hocuspocus, presence/cursors, conflict-safe undo): **+3–4 weeks**.
- + arrows with bindings, rich text, comments, video/embeds, Apple Pencil inking, export PNG/SVG/PDF, presentation mode, accessibility: **+8–16 weeks**.
- Total to tldraw-level polish: **5–9 months**, then ongoing maintenance. Main hard parts: text editing on canvas, robust gestures on iPad, undo in multiplayer, export fidelity.
- If forced custom: DOM + CSS transforms for shapes/text + optional PixiJS layer for image-heavy zoomed-out views; Yjs `Y.Map` of shapes keyed by id with fractional indices for z-order.

### A.4 Other

- **React Flow / xyflow** (`@xyflow/react` 12.12.1, MIT; "Pro" subscription only for premium examples): node-graph/diagram-centric DOM nodes, edges, minimap. Great for flows, awkward for freeform image collage (no freehand, rotation, crop; viewport handles a few hundred–low thousands of nodes).
- **Polotno** (4.20.1, proprietary): Canva-style single-page design editor (Konva). Free only for non-commercial/local dev; commercial tiers reported $249/mo (grass-roots) to $899/mo (self-serve). Not an infinite canvas. No.
- **Quickdraw** (`@quickdrawjs/core` 0.3.0, MIT, created 2026-08, single maintainer, markets itself as "tldraw alternative"): too young to bet on; watch.
- **BlockSuite/AFFiNE edgeless** (`@blocksuite/presets` 0.19.5, MPL-2.0, last publish 2025-06): powerful but heavy, docs-oriented, npm releases stalled.
- **Penpot internals:** MPL-2.0, ClojureScript app with new Rust/WASM (Skia) renderer; not an embeddable library — reference only.
- **tldraw vs Excalidraw perf:** no rigorous public head-to-head found. Architecturally tldraw (DOM shapes + R-tree culling + LOD + asset-resolve hook) handles image-heavy boards better; Excalidraw (single Canvas2D, full redraw of static scene on change, no image LOD) degrades earlier with many large images. Benchmark your own board (e.g., 300 images + 2000 shapes on an iPad) during the trial.

---

## B. Real-time collaboration / sync

| Option | Version / licence | Hosting | Free tier | Fit |
|---|---|---|---|---|
| **tldraw sync** | 5.6.0, tldraw licence | Self-host: CF Durable Objects template (recommended) or any Node WS server | DO free plan (SQLite DOs; ~100k req/day; ops fail rather than bill) / Workers Paid $5/mo incl. 1M DO requests, then $0.15/M; idle hibernated DOs not billed for duration | **Best** if tldraw. Roles built in. Not a CRDT: long offline edits not guaranteed to merge cleanly. |
| Yjs + y-websocket | yjs 13.6.33, y-websocket 3.1.0, MIT | Needs long-lived WS server (Fly/Render/Railway/VPS) | — | Generic CRDT; you build shape schema + undo (`Y.UndoManager`). |
| Hocuspocus | 4.8.0 (v4 stable 2026), MIT | Node, Bun, Deno, **Cloudflare Workers** (crossws), hooks for auth/persistence (Postgres/S3) | self-host | Best Yjs server DX; v3/v4 wire-compatible. |
| y-partyserver / PartyKit | partyserver 0.5.10, partykit 0.0.115, y-partykit 0.0.33 | Cloudflare (PartyKit acquired by Cloudflare 2024; `partyserver` = DO helper) | as DO | Lightweight Yjs-on-DO; good for custom engine. |
| y-indexeddb | 9.0.12 (last publish 2023-11) | client | — | Offline cache for Yjs; stable but unmaintained-ish. |
| y-supabase | `@supabase-labs/y-supabase` ~0.1.0 | Supabase Realtime broadcast + optional Postgres persistence | Supabase quotas | Early-stage; Realtime rate limits (see below) make it risky for drag-heavy canvases. |
| Liveblocks | client/yjs 3.25.0, Apache-2.0 client; hosted | Hosted (no server to run) | Free: **500 monthly active rooms**, hard-blocked over limit, unlimited MAU (reported) | Pro reported $30/mo ($25 annual), $0.03/room overage. Official tldraw-Storage example. Easiest hosted path; vendor lock-in. |
| Supabase Realtime | supabase-js 2.119.0 | Supabase | Free: 200 concurrent conns, 100 msg/s, 2M msgs/mo, presence 20 msg/s, broadcast payload 256 KB; Pro 500 conns, 500 msg/s, 5M msgs (+$2.5/M) | Good for **presence, cursors, "board updated" pings, comments**; not as the document sync engine (no persistence/ordering guarantees; msg/s cap disconnects clients). |
| Automerge | 3.5.0, MIT | automerge-repo sync server | — | Good JSON CRDT, heavier; fewer canvas examples. |
| Loro | loro-crdt 1.17.1, MIT | BYO transport | — | Fast Rust/WASM CRDT with movable tree/list, rich text, time travel — best CRDT for a custom canvas with version history. |
| Electric SQL | client 1.5.28, Apache-2.0 | Electric service + Postgres | Electric Cloud | Postgres read-path sync ("shapes" over HTTP); writes via your API. Fits metadata (board lists), not per-stroke canvas edits. |
| Replicache / Zero | replicache 15.3.0 (maintenance, superseded), Zero 1.12.0 (1.0 GA mid-2026), Apache-2.0 | zero-cache server (SQLite replica of Postgres) on a long-lived host | self-host | Excellent for relational app data; canvas-drag frequency and CRDT-free model make it a poor doc engine. |

**Vercel constraint:** Vercel Functions gained WebSocket support (public beta June 2026; reported GA Oct 2026) via `experimental_upgradeWebSocket()` on Fluid compute, but **connections close at function max duration (default 5 min)** and are pinned to one instance (needs Redis fan-out). Fine for notifications, wrong for a room server that must be the single authority per board. → Run sync on Cloudflare DO (or Fly/Railway), keep Vercel for HTTP.

---

## C. Storage & persistence

**Board document**
- *tldraw sync path:* live state in DO SQLite (automatic). Add: (1) on DO idle/alarm every N minutes or on last disconnect → `room.getCurrentSnapshot()` JSON → R2 `boards/{id}/snapshots/{ts}.json` (gzip; a 2k-shape board is ~0.5–3 MB); (2) Postgres `boards` row stores `latest_snapshot_key`, `thumbnail_key`, `updated_at`; (3) version-history UI lists snapshots. Postgres jsonb for full docs is OK under ~1 MB each but bloats WAL/backups on Free (500 MB DB cap).
- *CRDT path (custom):* append Yjs/Loro updates to an update log, compact into periodic snapshots (Hocuspocus `onStoreDocument` debounced). Store compacted binary in R2 or `bytea`.
- *Local-first:* tldraw `persistenceKey` → IndexedDB (document + assets) for instant load and offline viewing; tldraw sync reconnects and rebases pending changes after short drops, but treat multi-hour offline editing as unsupported. For true offline-first use Yjs/Loro + y-indexeddb.

**Images/files — vendor comparison (verified Supabase numbers from docs MCP)**

| | Free tier | Paid | Egress | Image transforms |
|---|---|---|---|---|
| **Cloudflare R2** | 10 GB-mo, 1M Class A, 10M Class B | $0.015/GB-mo Standard ($0.01 IA) | **$0** | via Cloudflare Images: 5,000 unique transformations/mo free, then $0.50/1k (paid) |
| Supabase Storage | 1 GB, 50 MB max file, 5 GB egress (+5 GB cached) | Pro $25/mo org: 100 GB incl., then $0.021/GB | 250 GB incl., then $0.09/GB uncached, $0.03 cached | Pro only: 100 origin images incl., then **$5 per 1,000**; max 2500 px output, 25 MB/50 MP input, auto-WebP only (AVIF output "coming") |
| Vercel Blob | Hobby 1 GB storage, 10 GB transfer | ~$0.023/GB storage, ~$0.05/GB transfer (reported) | metered | none (Next/Image optimisation separately metered) |

**Rendition strategy (recommended):** on upload, in the browser: `createImageBitmap` → `OffscreenCanvas` → encode 256 px (grid/zoomed-out), 1024 px, 2048 px WebP (use `@jsquash/webp`/`@jsquash/avif` WASM where `canvas.toBlob('image/webp')` is unsupported, e.g. older Safari), keep original; store blurhash/dominant colour + w/h in the asset record so the board lays out before any byte arrives. Upload directly to R2 via presigned PUT (Next.js route signs; avoid Vercel's ~4.5 MB request-body limit). Serve via custom domain, `Cache-Control: public, max-age=31536000, immutable`, content-hashed keys. **Set R2 CORS** (`GET` from app origin) — otherwise canvas/PNG export hits tainted-canvas errors. Tiled/deep-zoom (DZI) only needed for >50 MP images; skip initially. HEIC from iPhone: decode client-side (`heic2any`/WASM) or reject — Supabase transforms can't output HEIC; browsers other than Safari can't display it.

**Cost for one heavy user (images 5–20 GB + ~30% renditions):**

| Item | 5 GB | 20 GB |
|---|---|---|
| R2 storage | $0 (in free 10 GB) | ~(26−10)×0.015 ≈ **$0.24/mo** |
| R2 ops/egress | $0 | $0 |
| Supabase Storage alternative | needs Pro ($25/mo) — free is 1 GB | Pro $25/mo (within 100 GB) |
| Vercel Blob alternative | ~$0.10 + transfer | ~$0.45 + transfer |

---

## D. Auth & sharing

**Owner login:** Supabase email + password (GA) with TOTP MFA; passkeys in Supabase Auth are **beta/experimental since 2026-05** (opt-in client flag, API may change) — add later. Magic link optional. Use custom SMTP (built-in SMTP is heavily rate-limited). Free Supabase **pauses projects after 7 days of low activity** → a paused DB breaks client share links; use the existing Stash project with a new schema (e.g. `boards`) to stay within the 2-free-project limit, or upgrade to Pro.

**Data model (Postgres, schema `boards`):**
- `boards(id, owner_id, title, room_id, latest_snapshot_key, thumb_key, created_at, updated_at, archived_at)`
- `board_members(board_id, user_id, role check in ('viewer','commenter','editor'))`
- `share_links(id, board_id, token_hash, role, password_hash null, expires_at null, revoked_at null, max_uses null, use_count, created_by, created_at)`
- `assets(id, board_id, r2_key, mime, w, h, bytes, renditions jsonb, sha256)`
- RLS: owner `using (owner_id = auth.uid())`; members via `security definer` fn `board_role(board_id) returns text`; anonymous `is_anonymous` JWT claim must be excluded with **restrictive** policies if you enable anonymous sign-ins.

**Share flow:** `/s/[token]` (Next.js server) → hash token, look up link, check `revoked_at`/`expires_at`/`max_uses` → if `password_hash`, show form, verify with `crypt()` (pgcrypto bcrypt) or argon2 in the route, rate-limit (Upstash/Vercel KV or Postgres counter) → ask guest name (stored in localStorage) → mint a **short-lived JWT** (HS256/EdDSA, 15–60 min, claims: `board_id`, `role`, `guest_name`, `link_id`) → client connects to `wss://sync.yourdomain/connect/{room}?token=…`; DO verifies JWT, sets `isReadonly = role==='viewer'||'commenter'`, comment lane writable for commenter. Revocation = flip `revoked_at` + DO checks a revocation list / short JWT TTL. Asset reads: either public-but-unguessable content-hashed URLs (simplest; acceptable for moodboards) or a Worker that checks the same JWT before streaming from R2 (private boards).
- Supabase anonymous sign-ins are an alternative identity for guests (rate limit 30/hr/IP, add Turnstile), but the custom JWT avoids polluting `auth.users`.
- Presence names: tldraw `useSync({ userInfo })` / presence records; colours per guest.

---

## E. Export

- **tldraw built-ins:** `editor.getSvgString(ids, opts)`, `editor.toImage(ids, { format: 'png'|'jpeg'|'webp'|'svg', scale, pixelRatio (default 2 for raster), background, padding, darkMode })`; frames export with exact bounds (no padding) → ideal for "export frame as 3000 px PNG". Works for whole page (empty array), selection, or a frame. `maxExportDelayMs` 5 s (images must load → use renditions sized via `pixelRatio`/`shouldResolveToOriginal`).
- **Multi-page PDF from frames:** sort frames (x/y or explicit order) → per frame `toImage` PNG at 2–3× → `jsPDF` 4.2.1 `addImage` per page sized to frame aspect; for vector output, `getSvgElement` → `svg2pdf.js` into jsPDF (embed fonts with `addFont`; foreignObject rich text may need rasterising). `pdf-lib` 1.17.1 works but is unmaintained since 2022.
- **Server-side headless Chromium:** `@sparticuz/chromium(-min)` + puppeteer-core on Vercel (250 MB unzipped function limit; up to 5 GB "large functions" beta on Fluid) or Cloudflare Browser Rendering. Only worth it for big unattended exports (e.g., "email me a 40-page PDF"); otherwise client export is faster and free.
- **Presentation mode:** frames = slides; `editor.zoomToBounds(frameBounds, { animation, inset })`, camera constraints to lock, readonly instance state, arrow keys/pencil tap to advance; reuse the share link with `?present=1`. tldraw has a "slideshow" example.

---

## F. PWA, iPad, touch, Apple Pencil, mobile performance

- Installability: `app/manifest.ts` (Next 16 metadata route) + minimal hand-written `public/sw.js` caching the app shell and rendition images (stale-while-revalidate, size-capped) — same as Stash. If you prefer a library, `@serwist/next` 9.5.13 (verify Turbopack support in Next 16; Serwist historically required a webpack build). iPadOS supports Home-Screen web apps; storage is evictable unless `navigator.storage.persist()` is granted.
- Pointer input: Pointer Events (`pointerType: 'pen'`, `pressure`, `tiltX/Y`), `touch-action: none` on the canvas. `getCoalescedEvents` in Safari is reported from 18.2 — feature-detect. Apple Pencil Pro barrel roll is not exposed to the web. Safari makes pen and touch mutually exclusive while one is down; implement "ignore touch while pen active".
- tldraw specifics: **pen mode** turns on automatically for direct-display pens (Apple Pencil) and then ignores finger input for drawing (fingers pan/zoom); draw tool uses real pressure (`isPen`), mice/touch get velocity-simulated pressure; v5.5 fixed stuck gestures on `pointercancel` (palm rejection, edge swipe).
- Mobile perf: the limiting factor is decoded image memory (iOS Safari kills tabs at roughly 1–1.5 GB; canvas backing-store limits are lower). Always serve renditions matched to `screenScale × dpr`, cap concurrent decodes, use `decoding="async"`, keep `maxShapesPerPage` sane (4000 default), avoid CSS `filter`/`backdrop-filter` on many nodes, test on the oldest iPad you support.

---

## Cost table (monthly, single heavy user, 5–20 GB images)

| Component | Free-tier path | "Properly licensed" path | Notes |
|---|---|---|---|
| Vercel (Next.js app) | Hobby $0 | Pro $20/seat | Hobby = **non-commercial personal use only** per Vercel fair-use; a designer's client tool is grey/commercial |
| Supabase (auth + metadata) | $0 (reuse Stash project, new schema) | Pro $25 (+compute; $10 credit covers one Micro) | Free pauses after 7 idle days; 500 MB DB |
| Cloudflare Workers + DO (sync) | $0 (Free plan SQLite DOs, request caps fail closed) | $5 Workers Paid | Hibernation keeps duration ≈ 0 |
| R2 (images + snapshots) | $0 ≤10 GB | ~$0.25 at 26 GB | zero egress |
| Image transforms | $0 (client-side renditions) | $0–few (CF Images 5k free) | avoid Supabase $5/1k |
| Liveblocks (if used instead of DO) | $0 (500 rooms) | $25–30 | |
| tldraw licence | $0 hobby (watermark, discretionary) or v3.15.6 (watermark) | Commercial: quote; reported ~$6,000/yr ≈ $500/mo | **dominant cost** |
| Domain | ~$1 | ~$1 | |
| **Total** | **≈ $0–5/mo** | **≈ $51/mo infra + tldraw commercial** | |

---

## Risks & mitigations

1. **tldraw licence** (biggest): 5.x hard-stops in production without a key; hobby is discretionary and arguably excludes client work; commercial price is opaque (reported ~$6k/yr) and terms changed at v3 and v4. *Mitigate:* email tldraw sales before building past the trial; keep engine-neutral backups (snapshot JSON + assets in your own R2); keep custom shapes thin; fallback = pin 3.15.6 (watermark) or migrate to custom engine.
2. **Free-tier ToS:** Vercel Hobby and tldraw hobby are non-commercial; Supabase free pauses → broken share links. Budget ~$45–50/mo if this becomes a client-facing business tool.
3. **Two vendors for realtime + storage (Cloudflare) vs app (Vercel/Supabase):** two deploy pipelines, JWT shared secret across them. Acceptable (Stash already uses R2).
4. **Image memory on iPad:** must ship renditions from day 1; test with 300+ large photos.
5. **CORS/tainted canvas on export** if R2 lacks CORS headers or images come from third-party hotlinks — proxy/cached-copy external images on paste.
6. **Not a CRDT:** tldraw sync is great online, weaker for long offline sessions; acceptable for this use case.
7. **Supabase passkeys beta**, `y-supabase` 0.1 and Quickdraw 0.3 immature — don't depend on them.
8. **Security of share links:** store only token hashes, rate-limit password attempts, short JWT TTL, revoke list in DO, sanitize SVG uploads (tldraw 4.5+ auto-sanitizes), iframe sandbox for embeds.

## Suggested build order
1. Next.js shell + Supabase schema/RLS + owner login (reuse Stash patterns).
2. tldraw 5.x single-user with `persistenceKey`, R2 presigned uploads, rendition pipeline, `TLAssetStore.resolve` LOD.
3. Deploy `sync-cloudflare` template; add JWT auth, size limits, snapshots → R2.
4. Share links (roles, password, expiry), guest names/presence.
5. Export (PNG/SVG per frame, multi-page PDF), presentation mode.
6. PWA + iPad polish; licence decision gate before giving clients links.
