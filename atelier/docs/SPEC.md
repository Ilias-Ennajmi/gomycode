# Atelier — Design Spec

Status: draft for owner review · Date: 2026-11-12 · Working title (rename any time)

Atelier is a private, infinite-canvas moodboard and whiteboard web app for one creative director.
You **collect** references, **compose** them on boards, **present** them to clients, and get
**decisions** back. Planning (sticky notes, kanban) and diagrams (shapes, connectors) are built in
as solid supporting tools.

Research behind every decision lives in `docs/research/`:
`01-miro-features.md`, `02-miro-complaints.md`, `03-competitors.md`, `04-tech-options.md`.
(Network limits meant most vendor pages were read through search snippets; treat quotes and prices as
indicative.)

---

## 1. Understanding (agreed with the owner)

| Topic | Decision |
|---|---|
| Uses | Visual moodboards, client presentations, planning & brainstorming, diagrams & flows |
| Accounts | One owner account (password + optional authenticator code). Everyone else uses share links |
| Others on shared boards | View, react and comment without an account. Only the owner edits |
| Devices | Desktop browser, iPad / tablet with pen, phone, installable app (PWA + Android wrapper later) |
| Offline | Offline-first: edits save on the device first, sync in the background |
| Budget | Free tiers to start; paid upgrades later when needed |
| Canvas engine | Our own engine on MIT/open-source parts (no tldraw licence, no Excalidraw fork) |
| Clients see | Published **rounds**, not live edits (a link can be switched to live) |
| Not in v1 | Live multi-user co-editing, AI features, team accounts, third-party integrations |

**Success means:** a 1,000-image board pans and zooms smoothly; a share link opens fast on a client's
phone with no account; exports are sharp enough to send to clients; nothing is ever lost.

### Positioning (from research)
"PureRef's speed + Milanote's structure + Eagle's colour brain + FigJam's delight, with client review
no whiteboard has done properly."

### Miro pain points this design answers (see `02-miro-complaints.md`)
| Miro problem | Atelier answer | Where |
|---|---|---|
| Lag/blur on image-heavy boards | Multi-resolution images, culling, 1,000-image benchmark gate | §3.2, §8 |
| Guests forced to sign in | No-account share links with name only | §5 |
| Weak client presentation | Rounds, frames-as-slides, per-image review, designed PDF deck | §5, §7 |
| Blurry exports | Vector SVG/PDF, PNG at exact size / 4× | §7 |
| Arrows/snapping fight the user | Bind only on drop with highlight; ⌘ to bypass; visible snap toggle | §6 |
| Weak text & sticky auto-size | Rich text everywhere; stickies keep their font size and grow | §6 |
| Confusing trackpad zoom/pan | Figma-style defaults, lockable mode, sensitivity slider | §6 |
| Weak iPad / Pencil | Pointer Events with pressure, pen-only drawing mode with palm rejection | §3.3 |
| No offline | Offline-first Yjs + IndexedDB | §3.4 |
| No layers panel, no find & replace, no dark mode | All three in Phase 1 | §6 |
| Basic image tools (crop presets only, no masks, no palette) | Crop, masks, rounded corners, layouts, palette extraction | Phase 2 |
| Free plan/version-history paywalls, lock-in fear | Own data: backups, open-format export, version history | §7, §9 |

---

## 2. Phases (each phase ships something usable)

### Phase 1 — Foundation & canvas core
- Owner login (email + password + optional TOTP code), session on trusted devices.
- Home: board grid with thumbnails, Recent, Starred, Folders, search, create from 5 starter templates
  (Moodboard, Presentation deck, Brainstorm, Flowchart, Kanban). Rename, duplicate, move, delete (with undo).
- Canvas: infinite pan/zoom, minimap, zoom presets, zoom-to-fit (⇧1), zoom-to-selection (⇧2).
- Objects: image, rich text, sticky note, basic shapes (rectangle, rounded rectangle, ellipse, triangle,
  diamond, star, line), arrow/line with binding, frame (with real-size presets), pen, highlighter, eraser.
- Editing: select, marquee, multi-select, move, resize, rotate, flip, group/ungroup, lock, align,
  distribute, bring forward/back, copy/paste style, duplicate (⌘D, Alt-drag), nudge (arrows, ⇧ = 10 px),
  unlimited undo/redo, find & replace (⌘F).
- Clipboard: copy/cut/paste inside and between boards; paste images, screenshots, URLs, text and files
  from other apps; drag-and-drop files (auto-arranged grid).
- Layers panel, Inspector panel, ⌘K command palette, right-click / long-press context menu.
- Offline-first saving and multi-device sync; sync status indicator.
- Light and dark theme; installable PWA.

### Phase 2 — Moodboard power
- Image pipeline: 256 / 1024 / 2048 px WebP variants + original; right size per zoom level.
- **Performance gate:** automated 1,000-image benchmark must hold the §8 targets (else switch the image
  layer to WebGL/PixiJS behind the same renderer interface).
- Image tools: crop with aspect presets (free, 1:1, 4:5, 3:4, 16:9, 9:16), non-destructive masks
  (rectangle, rounded, circle), corner radius, opacity, grayscale value-check, flip, replace image
  keeping crop.
- Layout tools on a selection: grid, masonry, justified rows, tight pack, normalise heights, tidy
  (keep grid); gutter setting.
- Colour: 5–8 colour palette auto-extracted per image (worker); **live board palette** object with % weight;
  click a swatch to highlight images containing it; lock/rename swatches; export ASE, Procreate
  `.swatches`, CSS variables / Tailwind tokens, JSON.
- Type specimen card: type a font name (Google Fonts) → renders sample text; size/weight/sample editable;
  stores licence/source note.
- Video & GIF objects (poster frame, loop, mute); link cards with preview (title, image, site);
  embeds for YouTube, Vimeo, Figma; colour swatch card.
- Provenance on every image: source URL, author/credit, licence, capture date (auto-filled from paste/share
  where possible); credits overlay toggle.
- **Inbox ("Unsorted")**: items sent from the phone share sheet or quick-capture land here; drag onto any board.
- **Asset library**: every uploaded file is one asset reused by reference across boards; "used in N boards";
  duplicate detection by perceptual hash.

### Phase 3 — Present & share
- Presentation mode: frames in order as slides, smooth camera transitions, presenter notes,
  laser pointer, hide UI; mobile swipe.
- Rounds: "Publish round" snapshots; history of rounds; side-by-side compare; "changed since last viewed".
- Share links with options (§5); client review (§5); feedback panel; push notifications.
- Exports (§7): PNG/JPG/WebP, SVG, multi-page PDF deck with optional title/palette/credits pages,
  ZIP of originals + credits CSV + palette files, `.atelier` backup + JSON Canvas.
- Version history: restore any compacted daily state or published round.

### Phase 4 — Planning & diagrams
- Full shape library (flowchart set, callouts, arrows, icons via Lucide/Phosphor), connector routing
  (straight / elbow with obstacle avoidance / curved), connector labels.
- Mind map (Tab = child, Enter = sibling, auto-layout).
- Columns / kanban container that auto-stacks cards; tables (simple grid of text cells).
- Timer (visible on share links), nested boards (a board card that opens a child board, breadcrumb back).
- Sticky power: bulk create from pasted list, tags, colour sets.

### Later (designed for, not planned now)
Live co-editing (Yjs websocket provider on Cloudflare Durable Objects), opt-in private AI ("find more like
these", "cluster by mood", "name this palette"), browser extension, desktop app with PureRef-style
always-on-top reference overlay, Miro import, end-to-end encrypted private boards.

---

## 3. Architecture

### 3.1 Repository & stack
New folder `atelier/` in this repo, mirroring `stash/` conventions:
Next.js (App Router, TypeScript, current major used by Stash), Tailwind, Vercel project `atelier`,
Supabase (existing Stash project, **new schema `atelier`**), Cloudflare R2 (new bucket), Vitest,
Playwright. Key libraries (all MIT/Apache/ISC): `yjs`, `y-indexeddb`, `rbush` (spatial index),
`perfect-freehand` (pen strokes), `fractional-indexing` (z-order), `jspdf` + `svg2pdf.js` (PDF),
`fflate` (ZIP), `lucide-react` or Phosphor (icons, one family only), `@supabase/ssr`.
Every dependency is checked for licence and size before adding.

Suggested layout:
```
atelier/
  app/                 # routes: (auth) login, / home, /b/[boardId], /s/[token] share, /api/*
  lib/engine/          # canvas engine — framework-light, unit-tested
    model/             # object types, schema, validation, migrations
    doc/               # Yjs document wrapper, transactions, undo
    geometry/          # bounds, transforms, hit-testing, snapping maths
    spatial/           # rbush index, culling
    input/             # pointer/keyboard/gesture state machines, tools
    render/            # renderer interface + DOM/SVG implementation (+ optional WebGL image layer)
    clipboard/         # serialise/parse internal + external clipboard data
    layout/            # grid, masonry, justified, pack, tidy, align/distribute
    export/            # SVG/PNG/PDF/ZIP builders
  lib/assets/          # upload queue, worker image pipeline, palette, phash
  lib/sync/            # IndexedDB persistence, server sync, realtime ping
  lib/share/           # token, password, permission checks
  components/          # UI chrome: toolbar, panels, menus, dialogs
  styles/tokens.css    # the only source of colours/fonts/radii/spacing
  supabase/migrations/ # SQL, applied in order
  tests/ e2e/ bench/
  docs/ SPEC.md PROGRESS.md research/
```
The engine has no dependency on Next.js or Supabase: it takes a Yjs document and an asset resolver,
so it can be tested alone and reused (share page, future desktop app).

### 3.2 Canvas engine
**Document model.** A board is a Yjs document with:
- `meta` (Y.Map): title, background, grid setting, palette state, schema version.
- `objects` (Y.Map<id, Y.Map>): every object. Common fields: `id`, `type`, `x`, `y`, `w`, `h`,
  `rotation`, `parentId` (frame or group, nullable), `index` (fractional index string for z-order),
  `locked`, `opacity`, `createdAt`, `updatedAt`. Type-specific fields:
  - `image`: `assetId`, `crop {x,y,w,h}`, `mask {kind, radius}`, `flipX/Y`, `grayscale`
  - `text` / `sticky`: `content` (Y.XmlFragment or structured rich-text runs), `fontFamily`, `fontSize`,
    `align`, `lineHeight`, `fill` (sticky colour), `autoGrow`
  - `shape`: `kind`, `fill`, `stroke`, `strokeWidth`, `strokeStyle`, `cornerRadius`, `label`
  - `arrow`: `start`/`end` (point or `{bindTo, anchor}`), `route` (straight/elbow/curved), heads, label
  - `frame`: `name`, `preset`, `background`, `order` (presentation order), `notes`
  - `stroke`: points with pressure, `tool` (pen/highlighter), colour, size
  - `video`, `link`, `embed`, `swatch`, `palette`, `typeSpecimen`, later `mindmapNode`, `column`, `table`
- Objects are validated against a schema on read; unknown/invalid fields are dropped and logged, never crash.
- `meta.schemaVersion` + migration functions keep old boards opening.

**Renderer.** Interface `Renderer { mount, setCamera, render(visibleObjects), hitTest, destroy }`.
v1 implementation: one transformed container (`transform: translate() scale()`), objects as absolutely
positioned DOM/SVG elements.
- **Culling:** only objects whose bounds intersect the viewport (+ margin) are mounted (rbush query).
- **Level of detail:** image `src` picks the smallest variant ≥ on-screen pixel size × devicePixelRatio;
  original loads only above 2048 px on screen. At very low zoom, text renders as grey bars and strokes are
  simplified.
- **Gesture mode:** during pan/pinch only the container transform changes (no per-object work);
  LOD/culling recompute after the gesture settles (debounced ~100 ms).
- **Image memory budget:** full-res bitmaps beyond a budget are released (LRU) when off-screen.
- `content-visibility` and `decoding="async"` on images; `will-change: transform` only during gestures.
- Escape hatch: `WebGLImageLayer` (PixiJS) implementing the same interface for images only, if the
  benchmark fails.

**Spatial index.** rbush over object bounds (rotated bounds' AABB), updated incrementally from Yjs
change events; used for culling, marquee select, hit-test candidates, snapping candidates.

### 3.3 Input
- One Pointer Events pipeline for mouse, trackpad, touch and pen; pointer capture during drags;
  ignore extra touches once a single-pointer drag has started; drag threshold (3 px mouse, 6 px touch).
- Trackpad: two-finger scroll = pan, pinch (ctrlKey wheel) = zoom (Figma-style). Mouse wheel = zoom
  by default with a setting to swap; zoom sensitivity slider; option to lock behaviour.
- Touch: one finger = current tool, two fingers = pan/zoom; long-press = context menu.
- Pen: pressure → stroke width (perfect-freehand); **"Pen draws, finger pans"** mode on tablets
  ignores touch for drawing (palm rejection by `pointerType`).
- Tools are a state machine (idle → pointing → dragging → …) per tool; Escape always returns to Select.
- Keyboard shortcuts never animate; every drag action has a keyboard/menu alternative (WCAG 2.2 2.5.7):
  nudge with arrows, Inspector for exact values, "Move to frame…" menu.

### 3.4 Persistence, offline & sync
- **Local:** each board's Yjs doc persists in IndexedDB (`y-indexeddb`); board list + asset metadata
  cached in IndexedDB too. App shell cached by a service worker → app opens offline.
- `navigator.storage.persist()` requested on first use; storage quota shown in Settings.
- **Server:** Supabase `atelier` schema (§4).
  - Client sends Yjs **update** blobs to `POST /api/boards/:id/updates` (batched, every ~1 s while editing
    and on `visibilitychange`), stored in `board_updates` with an increasing `seq`.
  - Opening/focusing a board: fetch updates after last known `seq` and apply.
  - **Compaction:** when >200 updates or daily, the server merges them into `board_snapshots`
    (encoded state) and deletes merged rows; each compaction keeps a dated version for history.
  - **Cross-device ping:** Supabase Realtime broadcast `board:{id}` "changed" → other open devices pull.
- Conflicts are impossible by construction (CRDT merge); offline edits on two devices both survive.
- **Undo:** `Y.UndoManager` tracking local origin only; grouped per gesture.
- iOS Safari can evict site storage after 7 days without use; the server copy is the long-term source,
  installing to the home screen protects local data, and the app rebuilds any missing/corrupt local doc
  from the server.
- **Future live co-editing** = add a websocket Yjs provider; data model unchanged.

### 3.5 Assets (images, video, files)
- Pipeline in a Web Worker (`createImageBitmap` + `OffscreenCanvas`): decode → orient (EXIF) →
  variants 256/1024/2048 px WebP (q≈0.82) → palette (k-means on a 64 px sample) → perceptual hash (dHash).
  HEIC and huge images: fall back to the original upload + server-side variant job only if the browser
  can't decode (logged).
- Upload: `POST /api/assets` returns presigned R2 `PUT` URLs; client uploads original + variants directly;
  then `POST /api/assets/:id/complete` stores metadata. Duplicate (same phash + size) → reuse existing asset.
- Offline: blobs queue in IndexedDB; canvas shows a local object URL; queue retries with backoff.
- Serving: R2 public bucket under unguessable 128-bit keys (`a/{assetId}/{variant}.webp`), long
  immutable cache headers; CORS configured for canvas export. Trade-off accepted: anyone holding an exact
  file URL can open that file; board access is still controlled by share links.
- Limits: 50 MB per image file, 200 MB per video (configurable); warn at 80 % of R2 free tier (10 GB).

---

## 4. Data (Supabase schema `atelier`)

All tables have RLS **enabled**; owner policies check `auth.uid() = owner_id` and an allow-listed owner id;
anonymous role has no direct access. Visitor actions go through server routes using the service role after
link checks.

| Table | Purpose / key columns |
|---|---|
| `folders` | id, owner_id, name, parent_id, sort |
| `boards` | id, owner_id, folder_id, title, starred, thumbnail_asset_id, last_opened_at, deleted_at (trash 30 days) |
| `board_updates` | board_id, seq (bigserial), update (bytea), device_id, created_at |
| `board_snapshots` | board_id, state (bytea), upto_seq, kind (`compaction`/`round`), label, created_at |
| `assets` | id, owner_id, kind, mime, width, height, bytes, variants jsonb, palette jsonb, phash, source_url, credit, licence, captured_at |
| `asset_usages` | asset_id, board_id (for "used in N boards") |
| `inbox_items` | id, owner_id, asset_id or url/text, created_at, placed_at |
| `rounds` | id, board_id, number, label, snapshot_id, published_at |
| `share_links` | id, board_id, token_hash, mode (`round`/`live`), round_id, scope (`board`/`frames` + frame ids), permission (`view`/`react`/`comment`), password_hash, expires_at, welcome_note, allow_download, watermark, show_credits, blind_votes, revoked_at |
| `visitors` | id, share_link_id, display_name, created_at (cookie-identified) |
| `reactions` | id, share_link_id, visitor_id, round_id, object_id, kind (`pick`/`reject`/`more`), created_at (unique per visitor+object+kind) |
| `comments` | id, board_id, share_link_id?, visitor_id? or owner, object_id?, x/y pin, body (≤2,000 chars), parent_id, resolved_at |
| `approvals` | id, share_link_id, visitor_id, frame_id, round_id, created_at |
| `link_views` | share_link_id, visitor_id, frame_id, started_at, duration_ms |
| `push_subscriptions` | owner push endpoints |
| `error_log` | timestamp, area, message, context jsonb |

RLS is tested with SQL tests: owner can do everything on own rows; another authenticated user and the
anon role can do nothing.

---

## 5. Auth, share links & client review

### Owner login
- Supabase Auth email + password; optional TOTP MFA (required AAL2 for settings and share-link creation once
  enabled). Password managers and paste allowed; visible label, show/hide toggle.
- `ATELIER_OWNER_ID` env var: middleware/proxy and every API route reject any other user; RLS repeats the check.
  Stash's anonymous identities in the same project get nothing in `atelier`.
- Passkeys added when Supabase's support leaves beta.

### Share links
- Token: 32 random bytes, base64url, in URL `/s/{token}`; DB stores SHA-256 only.
- Options per link: scope (board or chosen frames), permission (view / react / comment), mode
  (published round — default — or live), password (argon2id/bcrypt hash), expiry, welcome note,
  allow download, watermark, show credits, blind votes.
- Visitor flow: open → password (if set; rate-limited, exponential backoff per IP+link) → name (required
  to react/comment; remembered in an httpOnly cookie scoped to that link) → review view.
- Server route issues a signed, short-lived (12 h, sliding) visitor cookie; every visitor API call re-checks
  link not revoked, not expired, permission, scope.
- Revoke = immediate. Owner sees per link: opened when, by whom, time per frame (no third-party analytics).

### Client review view
- Clean viewer, no editing chrome; works on a 375 px phone; pinch-zoom to full resolution.
- Navigation: swipe/arrow through frames like slides, or free-roam canvas; thumbnail strip.
- Per image: ❤ Pick, ✕ Reject, ➕ More like this (toggle), 💬 pinned comment. (Buttons use SVG icons + text labels.)
- Per frame/direction: "Approve this direction" (name + date stamp; confirmation step).
- Blind votes: visitors don't see others' reactions until the owner reveals.
- Fast first paint: server provides pre-rendered frame preview images (generated on publish) shown first,
  then the interactive viewer hydrates.

### Owner feedback
- Reaction counts badge on each image; per-frame totals ("Direction A: 7 ❤ · 2 ✕ · 3 ➕").
- Feedback panel: all comments by round/link, reply, resolve, jump to object.
- Web push notifications on new comment/approval (opt-in), plus in-app inbox badge.

---

## 6. Interface & interaction

### Layout
- Top-left: board name, folder breadcrumb, sync status (Saved · Offline, saved on this device · Syncing).
- Top-right: Present, Share (the one primary button), Export.
- Bottom-centre floating toolbar (`role="toolbar"`, roving focus, arrow-key navigation, labelled icon
  buttons with tooltips): Select V, Hand H, Sticky N, Text T, Shapes S, Arrow/Line L, Pen P
  (pen/highlighter/eraser E), Frame F, Image/Upload, More (link, embed, swatch, type specimen, table…).
- Contextual bar above the selection showing only relevant controls; same actions in the context menu.
- Right panels (one open at a time, resizable): Layers, Inspector, Palette, Feedback, Inbox.
- Bottom-right: zoom %, minimap toggle, undo/redo.
- ⌘K command palette for every action, board and object (search by text).
- Tablet/phone: toolbar at bottom with 44 px targets, panels as bottom sheets, safe-area aware.

### Editing behaviour
- Snapping to edges, centres and equal spacing with distance guides; ⌘/Ctrl held = no snap for that drag;
  visible snap toggle; snapping is softer during fast drags (velocity-aware).
- Arrows bind only when released over a highlighted target; ⌘ = place unbound; bindings survive copy,
  paste, duplicate and moving frames.
- Text: bold, italic, underline, strike, headings, lists, links, alignment, line spacing, mixed sizes,
  curated quality fonts. Stickies keep the chosen size (S/M/L/XL) and grow vertically.
- Frames: presets — Slide 16:9 (1920×1080), 4:3, IG post 4:5 (1080×1350), Square, Story/Reel 9:16,
  A4/A3/Letter in mm with DPI (72/150/300), custom. Frames clip content (toggle) and move their children.
- Paste rules: image → at cursor; YouTube/Vimeo/Figma URL → embed; other URL → link card; text → text
  object (multi-line list → offer "one sticky per line"); Atelier objects → exact copies with offsets;
  multiple files → grid.
- Find & replace across text, stickies, shapes and frame names.
- Paste style (⌥⌘V) works on images too (crop ratio, mask, radius, opacity).
- Delete always undoable (toast "Deleted 3 objects · Undo").

### Visual design
- Style: Swiss minimal. Neutral warm greys so **images are the colour**; near-black ink; one restrained
  accent for selection/focus; canvas background off-white (light) / near-black (dark), never pure
  white/black.
- Type: Inter (UI); an editorial serif (e.g. Newsreader or Instrument Serif) only on share-page titles
  and PDF covers.
- One icon family (Lucide or Phosphor), consistent stroke width, SVG only (no emoji as UI icons).
- Tokens only (`styles/tokens.css`): colour roles (bg, surface, ink, muted, border, accent, danger,
  selection), radii, spacing (4 px grid), elevation (3 levels), z-index scale, motion tokens.
- Light and dark designed together; contrast ≥ 4.5:1 text, ≥ 3:1 UI and focus indicators.

### Motion rules
- Keyboard-triggered actions never animate (⌘K palette, shortcuts, tool switching).
- UI motion uses transform/opacity only; custom ease-out `cubic-bezier(0.23, 1, 0.32, 1)`;
  popovers 150–200 ms from their trigger origin; modals/sheets 200–300 ms; exits faster than enters.
- Buttons scale to 0.97 on press; nothing animates from scale(0).
- Canvas camera moves (zoom-to-fit, presentation transitions) use a smooth ease-in-out ≤ 400 ms and are
  interruptible by any input.
- Hover effects only under `(hover: hover) and (pointer: fine)`; `prefers-reduced-motion` removes movement
  but keeps fades.

### Accessibility
WCAG 2.2 AA for all chrome and the share page: keyboard access to every action, visible focus,
labelled icon buttons, status messages in a polite live region (copy/save/sync), dialogs with escape
routes, targets ≥ 24 px (44 px on touch), no colour-only meaning (reactions show icon + count),
alt text for images from title/credit fields. Canvas objects are reachable via the Layers panel and
Tab cycling.

---

## 7. Export & backup
All exports run in a worker with progress and cancel.
- **Image:** PNG/JPG/WebP of selection, frame or board at 1×/2×/4× or exact px; transparent background option.
- **SVG:** vector shapes and text; images embedded (data URLs) or linked.
- **PDF deck:** one page per frame in presentation order, real text (embedded fonts), images at Screen (150 dpi)
  or Print (300 dpi); optional cover page (board title, client, date), palette page, credits page.
- **ZIP:** originals + `credits.csv` (file, source, credit, licence) + palette files (ASE, .swatches, CSS, JSON).
- **Backup:** `.atelier` (ZIP of Yjs state + assets + manifest) re-importable; **JSON Canvas** export for portability.
- Exports respect share-link `allow_download` for visitors (visitors get PDF/images only if allowed).

---

## 8. Performance targets (measured, gating)
| Metric | Target | How measured |
|---|---|---|
| Open 500-object board from local cache | < 500 ms to interactive | Playwright trace |
| Pan/zoom, 1,000 images (laptop, Chrome) | ≥ 60 fps, p95 frame < 20 ms | `bench/` script (CDP tracing) |
| Pan/zoom, 1,000 images (iPad Safari) | ≥ 30 fps, no crash | manual check per phase |
| Drag latency | < 16 ms per frame of work | bench |
| Share link on mid phone, 4G throttled | LCP < 2.5 s (preview), interactive < 4 s | Lighthouse / Playwright |
| JS for share page | < 200 KB gzipped initial | build stats |
| Image memory | full-res bitmaps capped by LRU budget | bench |

---

## 9. Reliability & error handling
- Local-first: every edit is durable on the device before any network call.
- Sync errors → status "Saved on this device", exponential backoff retries, no modal interruptions.
- Upload queue survives reloads; failed uploads visible in an "Uploads" sheet with retry.
- Corrupt/missing local doc → rebuild from server snapshot + updates.
- Server validates update sizes and board ownership; rejects oversized/invalid payloads.
- Daily compaction keeps 30 days of daily versions + every published round forever.
- Trash: deleted boards recoverable for 30 days.
- `error_log` table + `/api/health` endpoint; client errors reported with context (no secrets/PII).

---

## 10. Testing & delivery
- **Unit (Vitest):** geometry, transforms, hit-testing, snapping, selection, undo grouping, fractional
  index, clipboard parse/serialise, layout algorithms, palette & phash, schema validation/migrations,
  share permission checks, token/password handling.
- **E2E (Playwright):** create/draw/paste/arrange; offline edit then reconnect sync (two contexts);
  share link with password + name + reactions + comment on a 375 px viewport; exports produce valid
  files; axe accessibility checks on home, editor chrome and share page.
- **DB:** RLS tests for owner / other user / anon.
- **Bench:** 1,000-image board scripted pan/zoom.
- **CI:** GitHub Actions workflow `atelier-ci.yml` (typecheck, lint, unit, build, e2e) like the reader's.
- A phase is done only when typecheck, lint, build and all tests pass and each acceptance item is reported
  passed or failed.

---

## 11. Hosting & cost
| Piece | Start (free) | Later |
|---|---|---|
| Web app | Vercel Hobby | Vercel Pro $20/mo once used for paid client work (Hobby is non-commercial) |
| Database/Auth/Realtime | Existing Stash Supabase project, schema `atelier` | Supabase Pro $25/mo if limits are hit |
| Files | Cloudflare R2 free 10 GB, no egress fees | ~$0.015/GB-month beyond |
| Live co-editing (later) | — | Cloudflare Workers paid $5/mo (Durable Objects) |

Secrets only in Vercel env, Supabase secrets and `.env.local` (never committed). No model names in code,
commits or files.

---

## 12. Open questions (owner to confirm during review)
1. Final product name (working title "Atelier").
2. Accent colour preference for selection/focus (default: a muted ink-blue).
3. Share-page branding: your studio name/logo on client links? (default: small studio name text, no logo)
4. Default comment permission for new links (default: view + react; comment opt-in per link).
