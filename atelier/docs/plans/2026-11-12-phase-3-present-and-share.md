# Atelier Phase 3 — Present & Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a board into something you can present and sell from: frames-as-slides presentation mode, published rounds with history and compare, no-account share links with a phone-first client review (pick / reject / more-like-this, pinned comments, per-frame approval, blind votes), an owner feedback panel with push notifications and link analytics, sharp exports (PNG/JPG/WebP, SVG, designed PDF deck, ZIP with credits and palettes, `.atelier` backup and JSON Canvas), and a non-destructive version history.

**Architecture:** Presentation reuses the camera maths from Phase 1 with an interruptible animator. Exports share one renderer-agnostic `Scene` built from a `SceneSource` (the owner's `BoardDoc` or a visitor's `ViewerBoard`), then drawn by a raster, SVG or PDF writer inside a worker with progress and cancel. Publishing a round snapshots the Yjs state server-side and uploads frame preview images that the **client** rendered with the same export engine (Vercel has no headless Chromium). Visitors never receive Yjs: the server turns a snapshot into a validated, redacted `ViewerBoard` JSON, and a deliberately light viewer (no Yjs, Tiptap, jsPDF) renders it. Every visitor call goes through one guard that re-checks link state, cookie, permission and scope. All share/review persistence goes through a `ShareStore` interface with a Supabase implementation and an in-memory implementation (used for unit tests and `ATELIER_LOCAL_ONLY` e2e).

**Tech Stack:** Phase 1/2 stack plus `jspdf` (MIT), `fflate` (already added in Phase 2), `hash-wasm` (MIT, argon2id in WASM), `web-push` (MPL-2.0, server only, unmodified). Share page JS budget < 200 KB gzipped.

**Spec:** `atelier/docs/SPEC.md` §2 Phase 3, §4 (tables), §5, §6 (motion, accessibility), §7, §8, §9. Earlier plans: `2026-11-12-phase-1-foundation-canvas.md`, `2026-11-12-phase-2-moodboard-power.md` (names such as `BoardDoc`, `CanvasObject`, `Camera`, `fitRect`, `SpatialIndex`, `requireOwner`, `AssetResolver`, `AssetMetaStore`, `PaletteSwatch`, `pickVariant`, `DomImageLayer`, `isAllowedEmbedUrl`, `aggregatePalette`, `toASE`, `creditLine` come from them).

> **Reconciliation with Phase 1 as built (overrides anything below that disagrees; read the code first):**
> - `assets.id` is a **uuid** (128 random bits in 8-4-4-4-12 hex, `newAssetId()` in `lib/assets/asset-id.ts`), generated on the client; not a 22-char nanoid.
> - R2 keys: `a/{assetId}/w1024.webp` and `a/{assetId}/original` (**no extension**; the Content-Type is signed into the PUT URL). New variants follow `a/{assetId}/w{N}.webp`.
> - The browser reads the public host from `NEXT_PUBLIC_R2_PUBLIC_HOST` (fallback `R2_PUBLIC_HOST`); `lib/assets/resolver.ts` (`AssetResolverImpl`, `getAssetResolver()`), `lib/assets/upload-queue.ts` (`AssetUploader`), `lib/assets/pipeline.ts` (`processImage`) are the real Phase 1 names.
> - All object coordinates are absolute canvas coordinates (children of frames/groups too). Objects returned by `BoardDoc` are immutable: always `update()`.
> - Server routes use `requireOwner()` / `responseFromError(e)` from `lib/server/owner.ts`; `requireOwner` returns 503 in local-only mode.
> - `proxy.ts` open paths and anonymous-identity rejection are as built (see the file); new public paths (`/s/*`, `/api/s/*`, `/share-target`) must be added there deliberately with tests.

## Global Constraints

- Everything in the Phase 1 and Phase 2 Global Constraints still applies (tokens only, `lucide-react` only, local-first, WCAG 2.2 AA, motion rules, licence check, `ATELIER_LOCAL_ONLY` refused in production, attribution on commits, `docs/PROGRESS.md` updated per task, no secrets in code).
- Migration `0003_atelier_phase3.sql` is append-only on top of `0001`/`0002`; visitors have **no** database role: every visitor action runs in a server route with the service role after the guard (SPEC §4).
- **One guard for visitors.** Every `/api/s/[token]/*` handler except `meta` and `session` calls `requireVisitor` (Task 12). Handlers never read link state, cookies or scope themselves.
- **Share tokens** are 32 random bytes, base64url; only the SHA-256 hex is stored; the plaintext is shown once at creation. Cookies are HMAC-signed, `httpOnly`, `Secure` (production), `SameSite=Lax`, scoped by name to one link, 12 h sliding.
- **No Yjs, Tiptap, jsPDF, fflate or `lib/engine/doc/**` import anywhere under `app/s/**` or `components/viewer/**`** (ESLint `no-restricted-imports`, Task 14). Export code is loaded with dynamic `import()` only after a visitor clicks Download.
- All user-supplied strings (visitor names, comments, labels, welcome notes) are rendered as React text, never as HTML; rich text travels as `RichBlock[]` JSON, never HTML, to visitors.
- Exports, backups and imports run in a worker with progress and cancel; nothing blocks the main thread for more than 50 ms.
- Share pages send `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store` (the token is in the URL).
- New dependencies: `jspdf`, `hash-wasm`, `web-push`. Record each licence and size in `docs/DEPENDENCIES.md` (`web-push` is MPL-2.0, acceptable as an unmodified server-side dependency; flagged for the owner in `DEPLOY.md`).
- Env vars added: `ATELIER_VISITOR_SECRET` (≥ 32 bytes, base64), optional `ATELIER_VISITOR_SECRET_PREV`, `ATELIER_STUDIO_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_R2_PUBLIC_HOST`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Never printed or committed.

## Review Focus

1. **A visitor holding a valid cookie for link A** calls link B, board B, an owner route, or link A after it was revoked / expired / its password changed → denied immediately (no grace period). Tests owned by Task 12 (and re-asserted in Task 19).
2. **Hostile visitor input** (2,001-char or 1 MB comment, `<script>`/RTL-override/zero-width names, pin coordinates NaN or 1e308, reply to a comment on another link) → rejected, or stored inert and rendered as escaped text in the viewer, the owner panel and push notifications. Tests owned by Tasks 15 and 19.
3. **Password and token abuse** (100 wrong passwords from one IP, thousands of page loads trying to create visitors) → backoff with `Retry-After`, visitor creation capped, no difference in response between "wrong password" causes. Test owned by Task 12.
4. **Heavy or hostile export/import input** (4× export of a 30,000 px board, 1,000-image PDF, an image that fails to load, cancel mid-way, CJK text with no bundled font, an `.atelier` file with path traversal, a zip bomb or a newer format version) → clamped with an explanation, partial failures reported, cancel stops within 200 ms, nothing crashes or overwrites existing boards. Tests owned by Tasks 5–8.
5. **Publish or restore racing another device's offline edits** → no edit is lost; restore is a forward, undoable edit preceded by an automatic safety snapshot; the newest snapshot is never pruned. Tests owned by Tasks 9 and 10.

---

## File map (new unless marked Modify)

```
atelier/
  supabase/migrations/0003_atelier_phase3.sql   supabase/tests/rls.sql (Modify)
  app/s/[token]/page.tsx loading.tsx  app/b/[boardId]/compare/page.tsx
  app/api/s/[token]/{meta,session,unlock,join,board,reactions,comments,approvals,view}/route.ts
  app/api/boards/[id]/{share-links,rounds,history,feedback,comments}/route.ts  app/api/boards/[id]/rounds/prepare/route.ts
  app/api/boards/[id]/snapshots/[sid]/route.ts
  app/api/share-links/[id]/route.ts  app/api/share-links/[id]/{revoke,analytics}/route.ts
  app/api/comments/[id]/route.ts  app/api/push/{subscribe,public-key}/route.ts  app/api/notifications/route.ts
  middleware-free headers: next.config.ts (Modify)  proxy.ts (Modify: /s/* and /api/s/* bypass the owner guard)
  components/
    present/ PresentView.tsx SlideSorter.tsx NotesBar.tsx LaserOverlay.tsx
    export/ ExportDialog.tsx ExportProgress.tsx
    share/ ShareDialog.tsx LinkTable.tsx LinkActivity.tsx PublishDialog.tsx
    panels/ RoundsPanel.tsx FeedbackPanel.tsx HistoryPanel.tsx
    canvas/ FeedbackOverlay.tsx
    viewer/ ViewerApp.tsx Gate.tsx SlideDeck.tsx ThumbStrip.tsx ViewerCanvas.tsx ReactionBar.tsx CommentLayer.tsx ApprovePanel.tsx NamePrompt.tsx Watermark.tsx
  lib/
    engine/present/ slides.ts animator.ts swipe.ts laser.ts controller.ts
    engine/export/ scene.ts text-layout.ts raster.ts svg.ts pdf.ts zip.ts backup.ts json-canvas.ts export.worker.ts manager.ts fonts.ts csv.ts
    engine/doc/ restore.ts   engine/rounds/ diff.ts
    share/ token.ts password.ts cookie.ts backoff.ts options.ts guard.ts display-name.ts
    server/ share-store.ts share-store-supabase.ts share-store-memory.ts state.ts viewer-board.ts rounds.ts feedback.ts notify.ts push.ts same-origin.ts
    viewer/ viewer-types.ts viewer-resolver.ts
  public/fonts/export/*.ttf LICENSES.md   public/sw.js (Modify: push, notificationclick)
  scripts/check-bundle-size.mjs  docs/DEPENDENCIES.md
  tests/unit/** tests/security/** e2e/**
```

---

### Task 1: Migration `0003_atelier_phase3.sql` and RLS tests

**Files:**
- Create: `supabase/migrations/0003_atelier_phase3.sql`
- Modify: `supabase/tests/rls.sql`
- Test: `supabase/tests/rls.sql` via `scripts/test-rls.sh`

**Interfaces:**
- Consumes: `boards`, `board_snapshots`, `atelier.is_owner`.
- Produces (schema `atelier`, all `enable row level security`, `anon` gets nothing):
  - `board_snapshots`: add `id uuid not null default gen_random_uuid()` + unique index on `id` (needed by `rounds.snapshot_id`).
  - `rounds (id uuid pk default gen_random_uuid(), board_id fk cascade, number int not null, label text check (length(label) <= 120), snapshot_id uuid not null references board_snapshots(id), previews jsonb not null default '{}', diff jsonb not null default '{}', published_at timestamptz default now(), unique (board_id, number))`.
  - `share_links (id uuid pk, board_id fk cascade, owner_id uuid not null, name text check (length(name) <= 80), token_hash text not null unique, mode text check in ('round','live'), round_id uuid references rounds(id), scope text check in ('board','frames'), frame_ids text[] not null default '{}', permission text check in ('view','react','comment'), password_hash text, expires_at timestamptz, welcome_note text check (length(welcome_note) <= 1000), allow_download bool default false, watermark bool default false, show_credits bool default false, blind_votes bool default false, votes_revealed bool default false, cookie_epoch int not null default 0, created_at, revoked_at)` with CHECKs: `scope = 'frames'` ⇒ `cardinality(frame_ids) between 1 and 100`; `mode = 'round'` ⇒ `round_id is not null`.
  - `visitors (id uuid pk, share_link_id fk cascade, display_name text check (length(display_name) <= 60), ip_hash text /* HMAC of the IP, abuse caps only, never shown */, created_at, last_seen_at, last_round_id uuid references rounds(id) on delete set null)` + index `(share_link_id, ip_hash, created_at)`.
  - `reactions (id, share_link_id fk cascade, visitor_id fk cascade, round_id uuid null, object_id text not null, kind text check in ('pick','reject','more'), created_at)` with `unique nulls not distinct (visitor_id, object_id, kind, round_id)`.
  - `comments (id, board_id fk cascade, share_link_id fk set null, visitor_id fk set null, author_kind text check in ('owner','visitor'), object_id text, frame_id text, pin_space text check in ('object','canvas'), pin_x double precision, pin_y double precision, round_id uuid, body text not null check (char_length(btrim(body)) between 1 and 2000), parent_id uuid references comments(id) on delete cascade, resolved_at, created_at)` with CHECK `author_kind = 'visitor'` ⇒ `visitor_id is not null`; pins finite (`pin_x between -1e7 and 1e7`).
  - `approvals (id, share_link_id fk cascade, visitor_id fk cascade, frame_id text not null, round_id uuid null, created_at, unique nulls not distinct (visitor_id, frame_id, round_id))`.
  - `link_views (id bigserial, share_link_id fk cascade, visitor_id fk cascade null, frame_id text null, started_at timestamptz default now(), duration_ms int check (duration_ms between 0 and 600000))`.
  - `push_subscriptions (id, owner_id, endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 2048), p256dh text not null, auth text not null, user_agent text, created_at, last_success_at, failed_count int default 0)`.
  - `owner_notifications (id, owner_id, kind text check in ('comment','approval','reaction'), board_id, share_link_id, ref_id uuid, summary text check (length(summary) <= 200), created_at, read_at, pushed_at)`.
  - `share_auth_attempts (share_link_id fk cascade, ip_hash text, fails int not null default 0, locked_until timestamptz, updated_at, primary key (share_link_id, ip_hash))`.
  - Policies: owner tables (`rounds`, `share_links`, `push_subscriptions`, `owner_notifications`) `owner_all`; visitor-data tables (`visitors`, `reactions`, `approvals`, `link_views`, `share_auth_attempts`) owner **select/delete only** via the board join; `comments` owner select/insert (`author_kind = 'owner'` only)/update (resolve)/delete via board join. Indexes on every FK and `(share_link_id, created_at)`.
- [ ] **Step 1: Extend `rls.sql` (failing first):** for each new table: owner A can insert/select; user B sees 0 rows and cannot update/delete; `anon` denied; plus (a) duplicate `token_hash` fails; (b) `scope='frames'` with empty `frame_ids` fails, with 101 ids fails; `mode='round'` without `round_id` fails; (c) duplicate reaction `(visitor, object, kind, round NULL)` fails; (d) comment body of 2,001 chars fails, whitespace-only fails, `author_kind='visitor'` without `visitor_id` fails, owner cannot insert `author_kind='visitor'`; (e) deleting a share link cascades visitors, reactions, approvals, link_views; deleting a board cascades links and comments; (f) `push_subscriptions.endpoint` of `http://x` fails; (g) `duration_ms = 600001` fails; (h) `rounds (board_id, number)` unique.
- [ ] **Step 2: Run `scripts/test-rls.sh` → FAIL. Step 3: Write the migration. Step 4: → PASS. Step 5: Commit** `Atelier: phase 3 migration (rounds, share links, review data)`.

### Task 2: Share crypto — tokens, password hashing, visitor cookie, backoff

**Files:**
- Create: `lib/share/token.ts`, `password.ts`, `cookie.ts`, `backoff.ts`, `display-name.ts`, `lib/server/same-origin.ts`
- Modify: `package.json` (`hash-wasm`), `docs/DEPENDENCIES.md`
- Test: `tests/unit/share-token.test.ts`, `tests/unit/share-password.test.ts`, `tests/unit/share-cookie.test.ts`, `tests/unit/backoff.test.ts`, `tests/unit/display-name.test.ts`, `tests/unit/same-origin.test.ts`

**Interfaces:**
- Produces (exact):
  ```ts
  // token.ts
  generateToken(): { token: string /* 43 chars base64url of 32 random bytes */; hash: string /* sha256 hex */ }
  hashToken(token: string): string                 // sha256 hex; any string accepted, never throws
  isPlausibleToken(token: string): boolean         // /^[A-Za-z0-9_-]{43}$/ (cheap reject before any DB call)
  // password.ts — argon2id via hash-wasm (MIT, WASM: no native binary, runs on Vercel's Node runtime); params m=19456 KiB, t=2, p=1 (OWASP minimum), 16-byte salt, PHC-encoded output
  export interface PasswordHasher { hash(pw: string): Promise<string>; verify(pw: string, encoded: string): Promise<boolean> }
  export const passwordHasher: PasswordHasher; export const PASSWORD_MIN = 4, PASSWORD_MAX = 128;
  // cookie.ts
  export interface VisitorClaims { lid: string; vid: string; ep: number /* link cookie_epoch */; pw: boolean /* password gate passed */; exp: number /* epoch seconds */ }
  visitorCookieName(linkId: string): string                       // `atl_v_${linkId.slice(0, 12)}`
  signVisitorCookie(c: VisitorClaims, secret: string): string     // "v1.<base64url(JSON)>.<base64url(HMAC-SHA256)>"
  verifyVisitorCookie(value: string, secrets: string[], nowSec: number): VisitorClaims | null   // timing-safe, tries each secret, null if malformed/expired/forged
  slideCookie(c: VisitorClaims, nowSec: number, ttlSec = 43200): { value: string; refreshed: boolean } // reissue only when < 11 h of life remain (sliding 12 h)
  cookieAttributes(isProd: boolean, maxAgeSec: number): string    // HttpOnly; Path=/; SameSite=Lax; Max-Age; Secure when isProd
  // backoff.ts
  lockSeconds(fails: number): number    // 0 for fails <= 3; then 2^(fails-3) seconds, capped at 900
  // display-name.ts
  sanitiseDisplayName(raw: unknown): string | null   // string, NFC-normalised, control/format/bidi-override/zero-width characters removed, whitespace collapsed, trimmed, 1..60 chars after cleaning else null
  // same-origin.ts
  assertSameOrigin(req: Request, appOrigin: string): void   // throws a 403 Response for non-GET/HEAD when `Origin` is present and !== appOrigin, or absent with Sec-Fetch-Site not in {"same-origin","none"}; GET/HEAD always pass
  ```
- [ ] **Step 1: Failing tests.** `generateToken` produces 43-char values, 1,000 tokens are unique, `hash` equals `sha256(token)` hex, `isPlausibleToken` rejects 42/44 chars and `+/=` characters; `hashToken("")` does not throw. Password: `hash` returns a string starting `$argon2id$v=19$m=19456,t=2,p=1$`, two hashes of one password differ, `verify` true/false correctly, `verify` of garbage encoded string resolves `false` (never throws), 129-char password is rejected by a `validatePassword` helper with a message, hashing takes < 1.5 s (generous CI bound). Cookie: round trip; flipping one signature or payload byte → `null`; expired → `null`; verifies with the previous secret; cookie from secret A fails with only secret B; `slideCookie` does not reissue at 1 h age and reissues at 2 h; `cookieAttributes(true, …)` contains `HttpOnly`, `Secure`, `SameSite=Lax`; name differs per link and is ≤ 30 chars. `lockSeconds`: 0,0,0,0 (fails 0–3), 2,4,8 (4–6), 900 for 20. `sanitiseDisplayName`: `"  Jane   Doe "` → `"Jane Doe"`; `"‮evil"` → `"evil"`; zero-width joiners removed; `"<script>alert(1)</script>"` kept verbatim (escaping is the renderer's job); 61 chars → null; `""`/`"​"`/`123`/`null` → null. `assertSameOrigin`: POST with matching Origin passes, foreign Origin throws 403, no Origin with `Sec-Fetch-Site: cross-site` throws, GET passes.
- [ ] **Step 2: FAIL. Step 3: Implement** (Web Crypto only for hashing/HMAC; record `hash-wasm` licence MIT and ~20 KB WASM in `DEPENDENCIES.md`; chosen over `@node-rs/argon2`/`argon2` because it has no native binary to break Vercel builds, and over `bcryptjs` because argon2id is what SPEC §5 names first). **Step 4: PASS. Step 5: Commit** `Atelier: share token, password and cookie primitives`.

### Task 3: Presentation mode — slides, interruptible camera transitions, notes, laser, swipe

**Files:**
- Create: `lib/engine/present/slides.ts`, `animator.ts`, `swipe.ts`, `laser.ts`, `controller.ts`, `components/present/PresentView.tsx`, `SlideSorter.tsx`, `NotesBar.tsx`, `LaserOverlay.tsx`
- Modify: `components/chrome/TopBar.tsx` (Present button enabled), `lib/engine/commands/commands.ts`, `components/canvas/CanvasView.tsx` (`readOnly` prop, `setCamera({ animate })` honoured via the animator), `app/b/[boardId]/page.tsx`
- Test: `tests/unit/slides.test.ts`, `tests/unit/animator.test.ts`, `tests/unit/swipe.test.ts`, `tests/unit/laser.test.ts`, `tests/unit/present-controller.test.ts`, `tests/unit/present-view.test.tsx`

**Interfaces:**
- Consumes: Phase 1 `FrameObj` (`order`, `notes`, `name`), `Camera`, `fitRect`, `keyBetween`, `CanvasHandle`, `registry`.
- Produces (exact):
  ```ts
  export type Slide = { id: string; index: number; name: string; rect: Rect; notes: string };
  slidesOf(frames: FrameObj[]): Slide[]                      // top-level frames (parentId null) sorted by `order` then `index`; name falls back to "Slide {n}"
  slidesOfDoc(doc: BoardDoc): Slide[]
  cameraForSlide(s: Slide, viewport: { w: number; h: number }): Camera   // fitRect(s.rect, viewport, padding = 3 % of min(viewport), maxZoom 32)
  easeInOutCubic(t: number): number
  interpolateCamera(a: Camera, b: Camera, t: number, viewport: { w: number; h: number }): Camera
  //   zoom interpolated geometrically (log space), the canvas-space point at the viewport centre interpolated linearly in the eased "visual" parameter so zoom speed feels constant; t=0 -> a, t=1 -> b exactly; clamps t to [0,1]
  reorderSlides(doc: BoardDoc, orderedIds: string[]): void  // rewrites FrameObj.order with keyBetween keys, one undo step
  class CameraAnimator { constructor(d: { get(): Camera; set(c: Camera): void; viewport(): { w: number; h: number }; raf?: (cb: (t: number) => void) => number; caf?: (id: number) => void; now?: () => number; reducedMotion?: () => boolean });
    animateTo(target: Camera, o?: { durationMs?: number /* default 400, max 400 */ }): Promise<"done" | "cancelled">; cancel(): void; readonly running: boolean }
  //   reducedMotion() true -> set(target) immediately, resolve "done"; any new animateTo cancels the previous (resolves it "cancelled")
  swipeDirection(dx: number, dy: number, dtMs: number): "next" | "prev" | null  // |dx| >= 50 px, |dx| >= 1.5 * |dy|, dt <= 800 ms; dx < 0 -> next
  class LaserTrail { add(p: Point, nowMs: number): void; points(nowMs: number): { x: number; y: number; alpha: number }[]; clear(): void }  // fades linearly over 600 ms, keeps <= 64 points
  export type PresentState = { active: boolean; index: number; count: number; uiHidden: boolean; laser: boolean; notesOpen: boolean };
  class PresentationController { constructor(d: { doc: BoardDoc; canvas: CanvasHandle; animator: CameraAnimator });
    start(index?: number): void; next(): void; prev(): void; goTo(i: number): void; exit(): void;
    toggleUi(): void; toggleLaser(): void; toggleNotes(): void; interrupt(): void;   // interrupt() = any user input cancels the running transition
    readonly state: PresentState; subscribe(cb: () => void): () => void }
  // commands (group view): present.start (Mod+Alt+P) from the first slide, present.fromSelection (current frame), present.exit (Escape while presenting)
  ```
  Behaviour: `start` stores the previous camera and restores it on `exit`; `next()` on the last slide does nothing (no wrap); keys while presenting: →/Space/PageDown next, ←/PageUp prev, Home/End, Escape exit, `F` fullscreen (Fullscreen API when available), `N` notes, `L` laser, `U` toggle UI (chrome is hidden by default while presenting). The canvas is `readOnly` (no tools, no selection) during presentation. Keyboard-triggered slide changes **do not animate** (SPEC §6 motion rules); swipe, click-arrows and the slide strip do (≤ 400 ms, interruptible). Laser: while enabled the pointer draws a fading red trail (colour token `--color-laser`, ≥ 3:1 on both themes) on a 2D canvas overlay, never writes to the doc, hides the system cursor. Notes bar shows `Slide.notes` as plain text (Escaped), toggled by `N`, never visible on share links. `SlideSorter` (dialog from the Present split-button): ordered list of frames with drag **and** "Move up/down" buttons, rename, and "Notes" textarea bound to `FrameObj.notes` (≤ 5,000 chars). Present button is disabled with tooltip "Add a frame to present" when there are no frames.
- [ ] **Step 1: Failing tests.** `slidesOf`: sorts by `order`, ignores nested frames, names empty frames "Slide 2"; `reorderSlides` makes `slidesOfDoc` return the new order and is one undo step; `interpolateCamera(a,b,0)` equals `a`, `(a,b,1)` equals `b` (±1e-9), midpoint zoom of 1 → 4 is 2 (geometric), no NaN for identical cameras or a zero-size viewport; `CameraAnimator` (fake raf/now): reaches the target at 400 ms exactly and never exceeds 400 ms even if `durationMs: 5000` is asked, a second `animateTo` mid-flight resolves the first as `"cancelled"` and continues from the current camera, `cancel()` stops at the current camera, `reducedMotion` jumps in one `set`; `swipeDirection(-80,5,200)` = `"next"`, `(80,5,200)` = `"prev"`, `(-80,70,200)` = `null`, `(-30,0,100)` = `null`, `(-80,0,900)` = `null`; `LaserTrail` alpha 1 → 0 across 600 ms, ≤ 64 points; controller: `start(2)` frames the third slide via `cameraForSlide`, `next()` at the last slide is a no-op, `exit()` restores the previous camera, a keyboard `next` calls `canvas.setCamera` with `animate: false` and a swipe `next` with `animate: true`, `interrupt()` cancels the animator; view: the notes text `<img src=x onerror=…>` renders as text, `N`/`L`/`U` toggle state, Escape exits, Present button disabled with no frames; no object can be selected or edited while presenting.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: presentation mode`.

### Task 4: Export scene builder and text layout (renderer-agnostic, pure)

**Files:**
- Create: `lib/engine/export/scene.ts`, `text-layout.ts`
- Test: `tests/unit/scene.test.ts`, `tests/unit/text-layout.test.ts`

**Interfaces:**
- Consumes: Phase 1/2 object types, `arrowPath`, `boundsOf`, `unionRects`, `maskRadii`, `creditLine`, `PaletteSwatch`, `Slide`/`slidesOf` (Task 3), Tiptap fragment structure from Phase 1 (`richTextToHtml` marks/nodes).
- Produces (exact):
  ```ts
  export type RichMark = "bold" | "italic" | "underline" | "strike";
  export type RichRun = { text: string; marks: RichMark[]; href?: string /* http(s)/mailto only */; size?: number };
  export type RichBlock = { kind: "p" | "h1" | "h2" | "h3" | "li"; listType?: "bullet" | "ordered"; index?: number; align?: "left" | "center" | "right"; runs: RichRun[] };
  fragmentToBlocks(frag: Y.XmlFragment): RichBlock[]          // shared by export, backup, viewer builder (server) and JSON Canvas
  blocksToPlainText(blocks: RichBlock[]): string
  blocksToMarkdown(blocks: RichBlock[]): string               // used by JSON Canvas
  export interface SceneSource { all(): CanvasObject[]; get(id: string): CanvasObject | undefined; childrenOf(parentId: string | null): CanvasObject[]; blocks(id: string): RichBlock[]; meta: { title: string; background: string | null } }
  boardDocSource(doc: BoardDoc): SceneSource
  export type TextMeasurer = (text: string, font: { family: string; weight: number; italic: boolean; size: number }) => number;
  export type PositionedLine = { x: number; y: number /* baseline */; width: number; runs: (RichRun & { x: number; font: { family: string; weight: number; italic: boolean; size: number } })[] };
  layoutBlocks(blocks: RichBlock[], o: { width: number | null; fontSize: number; lineHeight: number; align: "left" | "center" | "right"; family: string; measure: TextMeasurer }): { lines: PositionedLine[]; height: number }
  //   greedy word wrap at `width` (null = no wrap), hard-breaks overlong single words by character, headings 1.6/1.3/1.15 × size bold, list items indented 1.5 × size with "•" or "{n}." marker run, ties baseline = top + lineHeight*size*0.8
  export type ExportTarget = { kind: "board" } | { kind: "frame"; id: string } | { kind: "selection"; ids: string[] };
  export type Paint = { fill: string | null; stroke: string | null; strokeWidth: number; dash: number[] | null; opacity: number };
  export type SceneNode =
    | ({ kind: "rect"; x: number; y: number; w: number; h: number; rotation: number; radius: number } & Paint & NodeCommon)
    | ({ kind: "ellipse"; x: number; y: number; w: number; h: number; rotation: number } & Paint & NodeCommon)
    | ({ kind: "path"; d: string; closed: boolean } & Paint & NodeCommon)                        // triangle, diamond, star, arrows + heads, pen/highlighter strokes (perfect-freehand polygon)
    | ({ kind: "image"; assetId: string; x: number; y: number; w: number; h: number; rotation: number; crop: Rect | null; rx: number; ry: number; flipX: boolean; flipY: boolean; grayscale: boolean; opacity: number } & NodeCommon)
    | ({ kind: "text"; x: number; y: number; rotation: number; lines: PositionedLine[]; opacity: number } & NodeCommon);
  type NodeCommon = { sourceId: string; clip: Rect | null /* frame clip, scene coordinates */ };
  export interface FontRef { family: string; weight: number; italic: boolean }
  export interface Scene { width: number; height: number; origin: Point /* canvas coords of the scene's top-left */; background: string | null; nodes: SceneNode[]; assetIds: string[]; fonts: FontRef[]; warnings: string[] }
  buildScene(src: SceneSource, target: ExportTarget, o: { background: "transparent" | "board" | string; padding: number; measure: TextMeasurer; frameChrome: boolean /* draw frame name labels */; credits: boolean }): Scene
  ```
  Rules: nodes in z-order (parents before children, siblings by `index`), world transforms applied (group/frame offsets flattened; rotation kept per node); frame `clip: true` sets `clip` on descendants; `target frame` = scene is exactly the frame rect with its own `background`; hidden/zero-size objects skipped; video → poster `image`; link card → rect + text lines (+ image); embed → rect + title text; swatch → filled rect + name/value text; palette → one rect per swatch plus labels (weights as `%` when `showWeights`); typeSpecimen → text in `family` (added to `fonts`); `credits: true` adds a caption text node under each image/video that has a `creditLine`; unbound arrow ends and bound ones resolve through `arrowPath`; colours are resolved to concrete `#rrggbb` (tokens never leak); an unknown future object type adds a warning and is skipped.
- [ ] **Step 1: Failing tests (fake measurer = `text.length * size * 0.5`).** `layoutBlocks`: wraps a 40-char paragraph in a 100 px box at size 20 into the right number of lines and never exceeds width except for a single overlong word which is broken; centre alignment offsets x by half the free space; ordered list markers `1.`, `2.`; heading bigger and bold; empty blocks produce a blank line height; `width: null` never wraps. `fragmentToBlocks` maps bold/italic/underline/strike/link marks and drops `javascript:` hrefs; `blocksToMarkdown` of bold+link = `**text**` and `[text](https://…)`. `buildScene`: frame target → `width/height` equal the frame size, children outside the frame excluded, frame with `clip` marks child nodes `clip` equal to the frame rect; board target of a rotated image yields the same rotation and `padding` added; selection target includes selected group children only; image with `mask circle` gives `rx = w/2, ry = h/2`; swatch/palette/typeSpecimen/link/embed/video produce the node kinds above; `credits: true` adds caption nodes only for images with provenance; `background: "transparent"` gives `background: null`; empty board returns a 1×1-padded scene with no NaN; 2,000-object board builds in < 400 ms; unknown type → warning not throw; `fonts` lists each family/weight/italic once.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier export: scene builder and text layout`.

### Task 5: Raster and SVG export, export worker, progress/cancel, Export dialog

**Files:**
- Create: `lib/engine/export/raster.ts`, `svg.ts`, `export.worker.ts`, `manager.ts`, `fonts.ts`, `components/export/ExportDialog.tsx`, `ExportProgress.tsx`, `lib/download.ts` (exists from Phase 2: reuse)
- Modify: `components/chrome/TopBar.tsx` (Export enabled), `lib/engine/commands/commands.ts` (`export.open`, Mod+Shift+E), `lib/assets/resolver.ts` (expose `urlsFor(assetId)` for workers)
- Test: `tests/unit/raster.test.ts`, `tests/unit/svg.test.ts`, `tests/unit/export-manager.test.ts`, `tests/unit/export-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 4 `Scene`, `buildScene`, `ExportTarget`; Phase 2 `pickVariant`, `ChosenVariant`, `downloadBlob`.
- Produces (exact):
  ```ts
  export const MAX_CANVAS_SIDE = 16384; export const MAX_CANVAS_AREA = 268_000_000;
  clampScale(scene: { width: number; height: number }, req: { scale: number } | { widthPx: number }): { scale: number; width: number; height: number; clamped: boolean; reason?: string }
  //   requested size above either limit is reduced to fit and `reason` says e.g. "Reduced to 16,384 px wide (browser limit)"; widthPx < 1 or non-finite -> scale 1
  export type RasterOptions = { scale: number; format: "png" | "jpeg" | "webp"; quality: number /* 0..1, default 0.92 */; transparent: boolean };
  export interface ImageProvider { load(assetId: string, neededPx: number): Promise<ImageBitmap | null> }   // chooses the variant with pickVariant({gesture:false}); null = failed
  export interface JobDeps { images: ImageProvider; signal: AbortSignal; onProgress(ratio: number, label: string): void; canvasFactory?: (w: number, h: number) => OffscreenCanvas }
  renderRaster(scene: Scene, o: RasterOptions, d: JobDeps): Promise<{ blob: Blob; width: number; height: number; failedAssets: string[] }>
  //   draws SceneNodes in order on a 2D context: clip rect for `clip`, rounded/elliptical clip for image masks, flips, crop, `grayscale` (ctx.filter when supported, else a temp-canvas luminance pass), opacity; JPEG (or any non-transparent export) is filled with scene.background ?? "#F5F2EC"; failed image -> hatched placeholder + failedAssets; checks signal.aborted every node and throws DOMException("Aborted","AbortError"); progress every 25 nodes
  sceneToSvg(scene: Scene, o: { imageMode: "embed" | "link"; images: { dataUrl(assetId: string): Promise<string | null>; url(assetId: string): string | null } }, d: Pick<JobDeps, "signal" | "onProgress">): Promise<{ svg: string; failedAssets: string[] }>
  //   well-formed standalone SVG; all text and attribute values XML-escaped; text as <text>/<tspan> (fonts referenced by family, not embedded — noted in the export summary); clipPath for frame clips and masks, feColorMatrix for grayscale; only `data:image/(png|jpeg|webp|gif)` and http(s) hrefs; no script, no event attributes, no foreignObject
  // worker protocol (export.worker.ts)
  export type JobKind = "raster" | "svg" | "pdf" | "zip" | "backup" | "import";
  export type WorkerIn = { type: "start"; id: string; kind: JobKind; payload: unknown } | { type: "cancel"; id: string };
  export type WorkerOut = { type: "progress"; id: string; ratio: number; label: string } | { type: "done"; id: string; blob: Blob; summary: ExportSummary } | { type: "error"; id: string; message: string };
  export interface ExportSummary { failedAssets: string[]; substitutedFonts: string[]; clampedReason?: string; warnings: string[]; width?: number; height?: number }
  class ExportManager { constructor(deps?: { createWorker?: () => Worker });
    run(kind: JobKind, payload: unknown, onProgress: (ratio: number, label: string) => void): { promise: Promise<{ blob: Blob; summary: ExportSummary }>; cancel(): void } }
  //   one job at a time (queued); cancel() posts "cancel", then terminates the worker after 100 ms and rejects with ExportCancelled; worker crash -> rejection with a readable message
  ```
  Export dialog (⌘⇧E): scope (Selection / Frame / Board; frames listed by name), format (PNG, JPG, WebP, SVG), size (1×, 2×, 4×, or exact width in px), transparent background (PNG/WebP/SVG only), quality slider for JPG/WebP, SVG image mode (embedded / linked), include credits captions, filename; shows the output pixel size and the clamp reason **before** starting; `ExportProgress` is `role="progressbar"` with `aria-valuenow`, a Cancel button, polite live-region updates at 25 % steps, and a post-run summary listing failed images and substituted fonts; result downloads via `downloadBlob`. "All frames (one file each)" is provided in Task 7 as a ZIP.
- [ ] **Step 1: Failing tests (Review Focus #4).** `clampScale({width:30000,height:20000},{scale:4})` → `clamped true`, width ≤ 16384, `width*height ≤ MAX_CANVAS_AREA`, `reason` contains "16,384"; `{widthPx: 1920}` on a 960×540 scene → scale 2; `{widthPx: NaN}` → scale 1; a 1,000×1,000 at 2× is not clamped. `renderRaster` with a recording fake context: nodes drawn in order; clipped node issues `clip` before its draw; JPEG fills `#F5F2EC` first, transparent PNG does not fill; `rx/ry` mask clips; failed provider returns null → placeholder drawn and id in `failedAssets`, render still resolves; aborting the signal after 3 nodes rejects with `AbortError` and draws no further nodes; progress is monotonic and ends at 1; a scene with `width: 0` does not throw (1×1 output). `sceneToSvg` (jsdom `DOMParser`, `application/xml`): output parses with no `parsererror`; text `</text><script>alert(1)</script>` and a name with `"` and `&` are escaped; no element named `script`/`foreignObject` and no attribute starting `on`; `imageMode: "embed"` uses data URLs, `"link"` uses https URLs, a `javascript:` URL from the provider is replaced by a placeholder; clip ids unique across 50 clipped nodes. `ExportManager`: jobs run serially; `cancel()` terminates the fake worker within 200 ms and rejects with `ExportCancelled`; a `{type:"error"}` message rejects with that message; progress callbacks forwarded. Dialog: shows "Reduced to 16,384 px wide" for a 30,000 px board at 4×, disables transparent for JPG, Cancel button present while running, summary lists failed assets.
- [ ] **Step 2: FAIL. Step 3: Implement** (worker uses `fetch` + `createImageBitmap`; fonts for raster text are `FontFace`s loaded in the worker from bundled TTFs in `public/fonts/export/` — Inter 400/500/700 + italics and Playfair Display 400/700, all OFL, licences in `public/fonts/LICENSES.md`; other families fall back to Inter and are reported in `substitutedFonts`). **Step 4: PASS; build. Step 5: Commit** `Atelier: image and SVG export`.

### Task 6: PDF deck export

**Files:**
- Create: `lib/engine/export/pdf.ts`
- Modify: `lib/engine/export/export.worker.ts` (job `pdf`), `lib/engine/export/fonts.ts` (TTF loader for jsPDF), `components/export/ExportDialog.tsx` (PDF options), `package.json` (`jspdf`, loaded only inside the worker), `docs/DEPENDENCIES.md`
- Test: `tests/unit/pdf.test.ts`

**Interfaces:**
- Consumes: Task 4 `buildScene`, `SceneSource`, `slidesOf`; Task 5 `JobDeps`, `ExportSummary`; Phase 2 `aggregatePalette`/`PaletteSwatch`, `creditLine`.
- Produces (exact):
  ```ts
  export interface PdfOptions { quality: "screen" | "print" /* 150 | 300 dpi */; cover: { title: string; client: string; date: string } | null; palettePage: boolean; creditsPage: boolean; frameIds: string[] | null /* null = all slides in presentation order */; compress: boolean }
  framePageSize(frame: FrameObj): { wPt: number; hPt: number }   // mm / inch presets (a4, a3, letter) -> real size in pt (a4 = 595.28 × 841.89); pixel presets and custom -> px * 0.75
  imageTargetPx(placedWidthPt: number, dpi: number, originalWidthPx: number): number   // min(round(placedWidthPt / 72 * dpi), originalWidthPx)
  buildPdf(src: SceneSource, o: PdfOptions, d: JobDeps & { fonts: PdfFontSource }): Promise<{ blob: Blob; summary: ExportSummary; pageCount: number }>
  export interface PdfFontSource { ttf(font: FontRef): Promise<ArrayBuffer | null> }    // bundled Inter/Playfair; others -> null -> substituted with Inter and listed in summary.substitutedFonts
  ```
  Behaviour: **drawn directly with jsPDF in the worker** from `Scene` nodes (rects, ellipses, paths via `lines`/`curveTo`, real text with embedded TTF via `addFileToVFS`/`addFont`, images via `addImage`); SPEC §3.1 lists `svg2pdf.js`, but it needs a DOM that workers do not have, so it is **not** added (decision recorded in `docs/DEPENDENCIES.md`; revisit only if a node kind cannot be drawn). One page per slide (frame) at `framePageSize`; frame content only (clipped); images are downsampled with an `OffscreenCanvas` to `imageTargetPx` (JPEG q 0.85, PNG when the image has transparency) so a 4000 px photo placed at 100 mm is ≤ 1,181 px at 300 dpi; optional **cover** page (Playfair title, client, date, palette strip), **palette** page (swatches with name, hex, `%` weight from the board's palette object or `aggregatePalette` of all images), **credits** page(s) (table: file/title, credit, licence, source; 40 rows per page; long values wrapped and truncated at 120 chars). `compress: false` is used only by tests.
- [ ] **Step 1: Failing tests (Review Focus #4).** `framePageSize` for `a4` = 595.28 × 841.89 (±0.01), `slide-16-9` = 1440 × 810, `letter` = 612 × 792; `imageTargetPx(283.46 /* 100 mm */, 300, 4000)` = 1181 and never exceeds the original (`imageTargetPx(283.46,300,800)` = 800). `buildPdf` (Node, jsPDF, `compress:false`): 3 frames → `pageCount 3` and the output contains `%PDF-` and three `/Type /Page` entries; cover + palette + credits add 3 pages; with 95 credited images the credits section spans 3 pages; the frame title text object "Direction A" appears as a text operator string in the content stream (real text, not an image); a frame ordered second appears second; `frameIds: ["b"]` yields one page; a scene image that fails to load leaves a placeholder rect, the PDF still builds, and `summary.failedAssets` lists it; a text run in family "Noto Sans JP" with no bundled font is drawn with Inter and `substitutedFonts` contains it; CJK characters outside the font's glyphs are replaced with "□" and a warning is added (no throw); aborting the signal mid-build rejects with `AbortError`; 1,000 small images complete with peak in-flight image decodes ≤ 4 (instrumented provider) and progress reaching 1.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build (jsPDF must not appear in any route's first-load JS; verify with `npm run build` output). Step 5: Commit** `Atelier: PDF deck export`.

### Task 7: ZIP export — originals, credits CSV, palette files, per-frame images

**Files:**
- Create: `lib/engine/export/zip.ts`, `csv.ts`
- Modify: `export.worker.ts` (job `zip`), `ExportDialog.tsx` (ZIP tab), `lib/engine/commands/commands.ts` (`export.zip`)
- Test: `tests/unit/zip-export.test.ts`, `tests/unit/csv.test.ts`

**Interfaces:**
- Consumes: Phase 2 `toASE`, `toProcreateSwatches`, `toCssVariables`, `toTailwindTokens`, `toPaletteJson`, `NamedColor`, `slugifyColorName`, `collectAssetIds`, `AssetMeta`; Task 5 `JobDeps`, `renderRaster`; fflate (`Zip`, `ZipPassThrough`, `ZipDeflate`).
- Produces (exact):
  ```ts
  export interface CreditRow { file: string; title: string; sourceUrl: string; credit: string; licence: string; capturedAt: string }
  csvEscape(cell: string): string        // RFC 4180 quoting; cells starting with = + - @ \t \r get a leading ' (spreadsheet formula injection); newlines preserved inside quotes
  creditsCsv(rows: CreditRow[]): string  // header file,title,source_url,credit,licence,captured_at; CRLF line endings
  uniqueFileName(base: string, ext: string, used: Set<string>): string   // sanitised ([^A-Za-z0-9._ -] -> _), <= 80 chars, collisions get " (2)"
  export interface ZipOptions { boardTitle: string; assets: { assetId: string; meta: AssetMeta }[]; palette: NamedColor[]; includePalette: boolean; includeCredits: boolean; frameImages: { frameId: string; name: string; scene: Scene }[] | null; raster?: RasterOptions }
  buildZip(o: ZipOptions, d: JobDeps & { fetchOriginal(assetId: string): Promise<{ blob: Blob; ext: string } | null>; sink?: WritableStream<Uint8Array> }): Promise<{ blob?: Blob; summary: ExportSummary; fileCount: number; estimatedBytes: number }>
  //   layout: originals/{name}.{ext} (stored, not recompressed), credits.csv, palette/{board}.ase, palette/{board}.swatches, palette/colors.css, palette/tailwind.css, palette/colors.json, frames/{NN}-{frame name}.png (when frameImages), README.txt
  estimateZipBytes(assets: { meta: Pick<AssetMeta, "bytes"> }[]): number
  ```
  Behaviour: streamed with fflate's `Zip` so memory stays bounded; when `sink` (File System Access `showSaveFilePicker` writable) is provided no Blob is built; otherwise a Blob is returned and an estimate over 500 MB shows a confirm step in the dialog ("This ZIP will be about N MB; continue?"); originals are fetched with concurrency 3; an original that fails to download is skipped and listed in `summary.failedAssets` and in `README.txt`; cancel closes the stream without producing a file.
- [ ] **Step 1: Failing tests.** `csvEscape("=cmd|' /C calc'!A0")` starts with `'`; `csvEscape('say "hi", ok')` = `"say ""hi"", ok"`; multiline cell stays one quoted cell; `creditsCsv` header and CRLF; `uniqueFileName("a/b:c?.jpg"…)` sanitises and `"photo","jpg"` twice gives `photo.jpg`, `photo (2).jpg`; a 200-char name truncates to 80. `buildZip` (fake fetchers, unzip with fflate in the test): contains `originals/…` for each asset exactly once even when two objects share an asset, `credits.csv` rows equal the assets that have provenance (none for assets without), palette files exist and `colors.css` contains `--color-`, `frames/01-…png` when `frameImages` given, `README.txt` lists a failed download; zero assets still produces a valid zip with README; progress ends at 1; cancel mid-way rejects with `AbortError` and calls `sink.abort`; originals are not recompressed (entry compression method 0); concurrency never exceeds 3 (instrumented); `estimateZipBytes` sums bytes.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: ZIP export`.

### Task 8: `.atelier` backup and import, JSON Canvas export

**Files:**
- Create: `lib/engine/export/backup.ts`, `json-canvas.ts`, `lib/engine/doc/from-state.ts`
- Modify: `export.worker.ts` (jobs `backup`, `import`), `ExportDialog.tsx` (Backup / JSON Canvas), `app/page.tsx` + `components/home/*` ("Import backup…" button and drop target), `lib/engine/commands/commands.ts` (`export.backup`, `export.jsonCanvas`, `board.importBackup`)
- Test: `tests/unit/backup.test.ts`, `tests/unit/json-canvas.test.ts`

**Interfaces:**
- Consumes: Phase 1 `BoardDoc`, `createBoard` API; Phase 2 `migrateBoard`, `SCHEMA_VERSION`, `AssetUploader.addAssetOnly`, `AssetMetaStore`; Task 4 `fragmentToBlocks`, `blocksToMarkdown`; fflate.
- Produces (exact):
  ```ts
  export const ATELIER_FORMAT_VERSION = 1;
  export interface AtelierManifest { format: "atelier"; version: 1; schemaVersion: number; boardTitle: string; createdAt: string; assets: { id: string; file: string /* assets/{id}/original.{ext} */; kind: "image" | "video" | "gif"; mime: string; width: number; height: number; bytes: number; palette: PaletteColor[] | null; phash: string | null; title: string; provenance: Provenance | null }[] }
  // archive layout: manifest.json, board.ydoc (Y.encodeStateAsUpdate), assets/{id}/original.{ext}
  buildBackup(doc: BoardDoc, meta: AssetMetaStore, d: JobDeps & { fetchOriginal(assetId: string): Promise<{ blob: Blob; ext: string } | null> }): Promise<{ blob: Blob; summary: ExportSummary }>
  const ENTRY_NAME = /^(manifest\.json|board\.ydoc|assets\/[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9._-]{1,100})$/;
  export const IMPORT_LIMITS = { manifestBytes: 1_000_000, ydocBytes: 50_000_000, entries: 20_000, totalUncompressedBytes: 4_000_000_000, maxRatio: 200 };
  parseBackup(file: Blob, d: { signal: AbortSignal }): Promise<{ manifest: AtelierManifest; state: Uint8Array; entries: Map<string, () => Promise<Blob>> }>   // throws ImportError(code) with codes "not-atelier" | "newer-version" | "bad-entry-name" | "too-large" | "zip-bomb" | "corrupt" 
  importBackup(file: Blob, deps: { createBoard(title: string): Promise<string>; uploader: AssetUploader; openDoc(boardId: string): Promise<BoardDoc>; assetExists(sha: string, bytes: number): string | null }, d: JobDeps): Promise<{ boardId: string; skippedObjects: number; failedAssets: string[] }>
  //   ALWAYS creates a new board (never overwrites); each asset goes through addAssetOnly (variants/palette/phash regenerated) and gets a new assetId; objects' assetId / posterAssetId / imageAssetId are remapped; board state loaded through docFromState(state) -> migrateBoard -> validateObject (invalid objects skipped and counted)
  docFromState(state: Uint8Array): BoardDoc
  // json-canvas.ts  (jsoncanvas.org 1.0)
  export interface JsonCanvas { nodes: JsonCanvasNode[]; edges: JsonCanvasEdge[] }
  toJsonCanvas(src: SceneSource, o: { assetPath(assetId: string): string | null }): { canvas: JsonCanvas; warnings: string[] }
  //   text/sticky -> text node (markdown from blocks); image/video -> file node (path from assetPath, null -> skipped with warning); link/embed -> link node; frame -> group node with label; shape with a label -> text node; palette/swatch -> text node "#hex name"; typeSpecimen -> text node; arrows with both ends bound -> edge with fromSide/toSide from the anchor; strokes and unbound arrows skipped (warning counts); coordinates and sizes rounded to integers (min size 1); rotation dropped (warning); ids reused (<= 64 chars)
  ```
- [ ] **Step 1: Failing tests (Review Focus #4).** `buildBackup` → `parseBackup` round trip equals the original: manifest fields, `board.ydoc` state decodes to the same objects, each original present. `parseBackup`: a file with an entry named `../evil.txt` or `assets/a/../../x` → `bad-entry-name`; a non-zip → `not-atelier`; manifest `version: 2` → `newer-version` with the message "Made by a newer version of Atelier"; manifest over 1 MB or > 20,000 entries → `too-large`; a tiny zip that claims a 5 GB uncompressed total or ratio > 200 → `zip-bomb` (checked from the central directory before inflating); truncated archive → `corrupt`. `importBackup`: creates a **new** board and never touches an existing board id; remaps `assetId` of images, video posters and link images to the new ids; skips (and counts) a hand-edited object with `x: NaN`; board with `schemaVersion 1` objects opens (migrated); a failing asset upload is listed in `failedAssets` and its image objects are kept with an "Image unavailable" placeholder state (no crash); cancel mid-import leaves the created board marked for deletion (soft delete) and no orphan upload queue entries. `toJsonCanvas`: all node ids unique; every edge's `fromNode`/`toNode` exists; a bound arrow on the right edge of node A yields `fromSide: "right"`; sticky bold text → `**…**`; a frame becomes a `group` with `label`; strokes counted in warnings; every number is a finite integer; output validates against a minimal JSON Canvas 1.0 structural check (types, required fields, `color` only `"1".."6"` or `#rrggbb`).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: backup, import and JSON Canvas export`.

### Task 9: Rounds — publish, server snapshot, diff, frame previews

**Files:**
- Create: `lib/server/state.ts`, `lib/server/rounds.ts`, `lib/engine/rounds/diff.ts`, `lib/engine/export/preview.ts`, `app/api/boards/[id]/rounds/route.ts`, `app/api/boards/[id]/rounds/prepare/route.ts`, `components/share/PublishDialog.tsx`
- Modify: `lib/server/r2.ts` (previews prefix helper), `lib/engine/commands/commands.ts` (`round.publish`), `components/chrome/TopBar.tsx` (Publish round in the Share split-button)
- Test: `tests/unit/state.test.ts`, `tests/unit/round-diff.test.ts`, `tests/unit/rounds-api.test.ts`, `tests/unit/previews.test.ts`

**Interfaces:**
- Consumes: Task 1 tables (`rounds`, `board_snapshots.id`), Phase 1 `compaction.ts` merge logic, `presignPut`, `validateObject`, `SyncClient.flush`; Task 3 `slidesOf`; Task 4–5 `buildScene`, `renderRaster`, `ExportManager`.
- Produces (exact):
  ```ts
  // `StateDb`, `RoundsDb` (this task) and `SnapshotDb` (Task 10) are narrow interfaces over the Supabase service client (select/insert/delete on board_snapshots, board_updates, rounds), declared in lib/server/state.ts with in-memory implementations for tests; `RoundsApi` = { prepare(boardId, frames): Promise<{ previewToken: string; uploads: Record<string, { w480: string; w1280: string }> }>; create(boardId, body): Promise<Round> }
  // lib/server/state.ts
  loadBoardState(boardId: string, db: StateDb): Promise<{ state: Uint8Array; uptoSeq: number }>    // newest snapshot + every later update applied to one Y.Doc, re-encoded
  objectsFromState(state: Uint8Array): Map<string, CanvasObject>                                  // validateObject on every object; invalid skipped
  // lib/engine/rounds/diff.ts (pure; also used by the Compare page, Task 10)
  export interface RoundDiff { added: string[]; removed: string[]; changed: string[]; byFrame: Record<string, { added: number; changed: number; removed: number }>; truncated: boolean }
  diffObjects(prev: Map<string, CanvasObject> | null, next: Map<string, CanvasObject>): RoundDiff
  //   changed = validated JSON differs ignoring updatedAt and index; id lists capped at 2,000 (truncated: true, counts stay exact); frame attribution = top-most frame ancestor by parentId, objects without one under "_none"; prev null -> everything added
  // lib/server/rounds.ts
  snapshotRound(boardId: string, label: string, db: StateDb): Promise<{ snapshotId: string; uptoSeq: number; state: Uint8Array }>   // inserts board_snapshots kind "round"; never deletes updates
  export interface PreviewFrame { frameId: string; name: string; w: number; h: number }
  export interface Round { id: string; boardId: string; number: number; label: string; snapshotId: string; previews: Record<string, { w480: string; w1280: string; w: number; h: number }>; diff: RoundDiff; publishedAt: string }
  publishRound(a: { boardId: string; ownerId: string; label: string; previewToken: string | null; frames: PreviewFrame[] }, db: RoundsDb): Promise<Round>
  //   number = max + 1 (one retry on unique violation); label trimmed to 120, default `Round ${n}`; previews kept only for frames whose keys are `p/${previewToken}/{frameId}-w480.webp|w1280.webp` (frameId must match /^[A-Za-z0-9_-]{1,40}$/); diff against the previous round's snapshot
  // POST /api/boards/[id]/rounds/prepare { frames: { frameId: string; bytes1280: number; bytes480: number }[] } -> { previewToken: string /* 22-char nanoid */; uploads: Record<string, { w480: string; w1280: string }> }   // owner + board ownership; <= 100 frames; each file <= 3 MB; presigned PUT image/webp, 10 min
  // POST /api/boards/[id]/rounds { label, previewToken, frames } -> Round ;  GET /api/boards/[id]/rounds -> { rounds: Round[] } (newest first)
  // lib/engine/export/preview.ts (client)
  renderFramePreviews(src: SceneSource, deps: { exporter: ExportManager; signal: AbortSignal; onProgress(r: number, label: string): void }): Promise<{ frames: { frameId: string; name: string; w: number; h: number; w1280: Blob; w480: Blob }[]; failedFrames: string[] }>
  //   for each slide: buildScene(frame target, board background, no chrome, no credits) -> renderRaster at widthPx 1280 and 480 -> WebP q 0.82; > 100 frames: first 100 + warning; a failing frame is reported and skipped, never aborts the round
  publishRoundFlow(deps: { doc: BoardDoc; sync: { flush(): Promise<void> }; api: RoundsApi; exporter: ExportManager; upload(url: string, blob: Blob): Promise<void> }, label: string, signal: AbortSignal, onProgress: (r: number, label: string) => void): Promise<Round>
  //   flush sync -> render previews -> prepare -> upload (concurrency 4, 2 retries) -> create round; if previews fail wholesale the round is still created with previews {} and the UI toast says "Published without preview images — clients will see a slightly slower first load"
  ```
  Why client-rendered previews: the app runs on Vercel serverless with no headless Chromium; the owner's browser already holds the fonts and image bitmaps, and the export engine (Tasks 4–5) renders slides identically to how they will look in the PDF and presentation. Round snapshots are immutable and are never deleted by compaction or pruning.
- [ ] **Step 1: Failing tests (Review Focus #5).** `loadBoardState` equals applying snapshot + updates in order; `diffObjects(null, next)` marks all added; a moved object is `changed`, an object whose only difference is `updatedAt` is not; frame attribution walks `parentId` to the top-most frame; 3,000 added objects → `truncated true`, `added.length 2000`, `byFrame` counts exact. `publishRound`: first round number 1, second 2; a concurrent publish (unique violation) retries once and gets the next number; preview keys from another token are dropped; label `"  "` becomes `Round 3`; the round's snapshot `upto_seq` includes an update pushed by a second device just before publishing and **excludes** one pushed after; an offline device's edits arriving after publication are in the live doc and the next round, never lost. API: 401/403 non-owner; board of another owner → 404; 101 frames → 400; a 4 MB declared file → 400; `prepare` URLs only for the requested frame ids. `renderFramePreviews`: frames rendered in slide order, a frame whose render throws is in `failedFrames` and the rest still returned, aborting stops further frames. `publishRoundFlow`: calls `sync.flush` before anything else; with all previews failing still calls `createRound` with `frames: []` and surfaces the warning.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: publish rounds`.

### Task 10: Round history, compare, version history and non-destructive restore

**Files:**
- Create: `lib/engine/doc/restore.ts`, `app/api/boards/[id]/history/route.ts`, `app/api/boards/[id]/snapshots/route.ts`, `app/api/boards/[id]/snapshots/[sid]/route.ts`, `components/panels/RoundsPanel.tsx`, `HistoryPanel.tsx`, `app/b/[boardId]/compare/page.tsx`, `components/canvas/CompareView.tsx`
- Modify: `lib/server/compaction.ts` (`pruneSnapshots`), `components/canvas/CanvasView.tsx` (`readOnly`, `onCameraChange` for sync), `lib/engine/commands/commands.ts` (`history.open`, `round.compare`)
- Test: `tests/unit/restore.test.ts`, `tests/unit/prune-snapshots.test.ts`, `tests/unit/history-api.test.ts`, `tests/unit/compare-view.test.tsx`

**Interfaces:**
- Consumes: Task 9 `Round`, `diffObjects`, `loadBoardState`, `docFromState` (Task 8); Phase 1 `BoardDoc`, `compact`, `SyncClient`; Phase 2 `DERIVED_ORIGIN` untouched.
- Produces (exact):
  ```ts
  export interface HistoryVersion { id: string; kind: "compaction" | "round"; label: string | null; roundNumber: number | null; createdAt: string; uptoSeq: number }
  // GET /api/boards/[id]/history -> { versions: HistoryVersion[] }  newest first; compactions limited to the last 30 days, rounds always
  // POST /api/boards/[id]/snapshots { label } -> { id }   server snapshot kind "compaction" of the current merged state (label e.g. "Before restore"); never deletes updates
  // GET /api/boards/[id]/snapshots/[sid] -> application/octet-stream (the Yjs state); owner + board match, else 404
  pruneSnapshots(boardId: string, now: Date, db: SnapshotDb): Promise<number>   // deletes kind "compaction" rows older than 30 days and, inside the 30 days, all but the newest compaction per UTC day; NEVER deletes kind "round" and NEVER the single newest snapshot of the board; called at the end of compact()
  restoreSnapshotInto(doc: BoardDoc, state: Uint8Array): { added: number; removed: number; changed: number }
  //   loads `state` into a temporary Y.Doc; validated objects only (invalid skipped and logged); ONE doc.transact(...): delete objects absent from the snapshot, create or overwrite the rest (properties and rich-text fragments), leave meta.title; the result is an ordinary local edit — undoable with one undo(), synced like any edit, mergeable with other devices' edits
  restoreAsCopy(state: Uint8Array, deps: { createBoard(title: string): Promise<string>; openDoc(id: string): Promise<BoardDoc> }, title: string): Promise<string>
  ```
  UI: **Rounds panel** (right panel) lists rounds (label, number, date, how many share links point at it) with Publish round, Compare, and "Restore…"; **History** tab groups compaction snapshots by day. Restore dialog text: "Restore {label} into this board? We save the current state first and you can undo." Flow: `POST /api/boards/[id]/snapshots {label:"Before restore"}` (when offline: skip with a visible warning, local undo still available) → `restoreSnapshotInto` → toast "Restored {label} · Undo". Secondary action "Open as copy" uses `restoreAsCopy`. **Compare page** `/b/[boardId]/compare?a={snapshotId}&b={snapshotId|current}`: two read-only canvases side by side with one shared camera (`CameraSync`), a frame picker that jumps both to the same frame, mode toggle Side by side / Swipe (a range input overlays B over A with `clip-path: inset(0 {100-v}% 0 0)`, keyboard operable, `aria-label="Compare position"`), "Highlight changes" outlines added/changed objects (accent) and lists removed ones as text from `diffObjects`; identical states show "No differences".
- [ ] **Step 1: Failing tests (Review Focus #5).** `restoreSnapshotInto`: after restore, validated objects equal the snapshot's (ignoring `updatedAt`), objects created later are gone, rich text restored; a single `undo()` returns the exact pre-restore state; counts match; an invalid object in the snapshot is skipped; remote update from device B applied after the restore merges without throwing and B's new object survives; restoring the same snapshot twice is idempotent. `pruneSnapshots` (fake db with 90 days of dailies + 3 rounds + 4 same-day compactions): keeps newest per day for 30 days, keeps all rounds, deletes older compactions, and with a board untouched for 90 days still keeps its newest snapshot; returns the delete count; compaction calls prune after merging and the next `pull` still works (snapshot + later updates). API: history 404 for another owner's board; snapshot download returns bytes that `docFromState` opens; `POST snapshots` 401/403 non-owner. Compare: identical states show the "No differences" text; changed object receives the highlight attribute; Swipe slider changes clip and `aria-valuenow` with arrow keys; shared camera: moving A updates B within one frame.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: round history, compare and restore`.

### Task 11: `ShareStore`, link options and the owner share-link API

**Files:**
- Create: `lib/server/share-store.ts`, `share-store-supabase.ts`, `share-store-memory.ts`, `lib/share/options.ts`, `app/api/boards/[id]/share-links/route.ts`, `app/api/share-links/[id]/route.ts`, `app/api/share-links/[id]/revoke/route.ts`, `components/share/ShareDialog.tsx`, `LinkTable.tsx`
- Modify: `components/chrome/TopBar.tsx` (Share enabled, primary), `lib/engine/commands/commands.ts` (`share.open`), `proxy.ts` (see Task 12), `lib/supabase/server.ts` (service-role client factory, server only)
- Test: `tests/unit/share-options.test.ts`, `tests/unit/share-store-contract.test.ts` (runs against the memory store), `tests/unit/share-links-api.test.ts`

**Interfaces:**
- Consumes: Task 1 tables, Task 2 `generateToken`, `passwordHasher`, `assertSameOrigin`; Phase 1 `requireOwner`, `needsSecondFactor`, `isLocalOnly`; Task 9 `Round`.
- Produces (exact):
  ```ts
  export interface ShareLinkOptions { name: string /* <= 80 */; mode: "round" | "live"; roundId: string | null; scope: "board" | "frames"; frameIds: string[] /* 1..100 when scope = frames */;
    permission: "view" | "react" | "comment"; password: string | null /* 4..128 chars */; expiresAt: string | null /* ISO, in the future, <= 365 days */; welcomeNote: string /* <= 1000 */;
    allowDownload: boolean; watermark: boolean; showCredits: boolean; blindVotes: boolean }
  export const DEFAULT_LINK_OPTIONS: ShareLinkOptions;   // mode "round" (latest round), scope "board", permission "react" (SPEC §12 Q4: view + react, comment opt-in), everything else off/empty, name "Client link"
  validateLinkOptions(raw: unknown, ctx: { now: Date; roundIds: string[]; frameIds: string[] }): { ok: true; value: ShareLinkOptions } | { ok: false; errors: Record<string, string> }
  //   mode "round" requires roundId in ctx.roundIds (error "Publish a round first" when none exist); frameIds must exist in ctx.frameIds; welcomeNote is plain text; unknown keys rejected
  export interface LinkRow { id: string; boardId: string; ownerId: string; name: string; tokenHash: string; mode: "round" | "live"; roundId: string | null; scope: "board" | "frames"; frameIds: string[]; permission: "view" | "react" | "comment"; passwordHash: string | null; expiresAt: string | null; welcomeNote: string; allowDownload: boolean; watermark: boolean; showCredits: boolean; blindVotes: boolean; votesRevealed: boolean; cookieEpoch: number; createdAt: string; revokedAt: string | null }
  export type Action = "view" | "react" | "comment" | "approve";
  linkState(l: Pick<LinkRow, "revokedAt" | "expiresAt">, now: Date): "ok" | "revoked" | "expired"
  can(l: Pick<LinkRow, "permission">, a: Action): boolean          // view: view; react: view, react, approve; comment: everything
  inScope(l: Pick<LinkRow, "scope" | "frameIds">, ref: { frameId: string | null }): boolean   // scope board -> true; frames -> ref.frameId in frameIds (null -> false)
  export type ShareLinkSummary = Omit<LinkRow, "tokenHash" | "passwordHash"> & { hasPassword: boolean; status: "ok" | "revoked" | "expired" };
  // lib/server/share-store.ts — the only persistence door for share/review data
  export interface ShareStore {
    insertLink(row: Omit<LinkRow, "id" | "createdAt" | "revokedAt" | "cookieEpoch" | "votesRevealed">): Promise<LinkRow>;
    getLinkByHash(tokenHash: string): Promise<LinkRow | null>; getLink(id: string): Promise<LinkRow | null>;
    listLinks(boardId: string, ownerId: string): Promise<LinkRow[]>;
    updateLink(id: string, ownerId: string, patch: Partial<Omit<LinkRow, "id" | "boardId" | "ownerId" | "tokenHash" | "createdAt">> & { bumpEpoch?: boolean }): Promise<LinkRow | null>;
    revokeLink(id: string, ownerId: string, now: Date): Promise<LinkRow | null>;   // sets revokedAt and bumps cookieEpoch
    deleteLink(id: string, ownerId: string): Promise<boolean>;
    listRounds(boardId: string): Promise<Round[]>; getRound(id: string): Promise<Round | null>; latestRound(boardId: string): Promise<Round | null>;
    // later tasks append their methods (visitors, attempts, viewer data, reactions, comments, approvals, views, notifications, push) to this interface and to BOTH implementations
  }
  getShareStore(): ShareStore        // memory store when isLocalOnly(), Supabase service-role store otherwise
  // routes (owner-only, assertSameOrigin on mutations, AAL2 required when a TOTP factor is enrolled -> 403 { error: "mfa-required" })
  // POST /api/boards/[id]/share-links ShareLinkOptions -> 201 { link: ShareLinkSummary; url: string /* `${NEXT_PUBLIC_APP_URL}/s/${token}`, the ONLY time the token is returned */ }
  // GET  /api/boards/[id]/share-links -> { links: ShareLinkSummary[] }
  // PATCH /api/share-links/[id] Partial<ShareLinkOptions> & { votesRevealed?: boolean } -> ShareLinkSummary   (password: string sets, null clears, absent keeps; changing or clearing the password bumps cookieEpoch)
  // POST /api/share-links/[id]/revoke -> ShareLinkSummary ;  DELETE /api/share-links/[id] -> 204
  ```
  Share dialog: options form with the defaults above, link table (name, status, mode/round, permission, expiry, views and last opened from Task 18), Create → shows the URL with a Copy button and the text "Copy this link now — for security it can't be shown again; create a new link to share it again", per-link Edit, Revoke (confirm), Reveal votes toggle; all controls labelled, errors from `validateLinkOptions` linked with `aria-describedby`.
- [ ] **Step 1: Failing tests.** `validateLinkOptions`: defaults valid when a round exists, `mode "round"` with no rounds → error "Publish a round first", `scope frames` with `[]` or 101 ids → error, expiry in the past or > 365 days → error, password of 3 or 129 chars → error, `permission "admin"` → error, 1,001-char welcome note → error, unknown key → error. `linkState`/`can`/`inScope` tables: revoked wins over expired; `view` cannot `react`/`comment`/`approve`; `react` can `approve`; `comment` can everything; frames scope allows only listed frames and rejects `null`. Store contract (memory): insert/get by hash; `revokeLink` sets `revokedAt` and increments `cookieEpoch`; `updateLink` with another owner id returns `null`; `listLinks` scoped to board+owner. API: 401 without session, 403 non-owner, 403 `mfa-required` when enrolled and `aal1`, 404 for another owner's board, response of GET never contains `tokenHash`/`passwordHash`, POST returns a URL whose token hashes to the stored `tokenHash`, stored `passwordHash` verifies the password and is never the plaintext, PATCH password change bumps `cookieEpoch`, cross-origin POST → 403.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: share link store and owner API`.

### Task 12: Visitor session routes and the single visitor guard

**Files:**
- Create: `lib/share/guard.ts`, `lib/server/http.ts`, `app/api/s/[token]/meta/route.ts`, `session/route.ts`, `unlock/route.ts`, `join/route.ts`
- Modify: `lib/server/share-store.ts` + both implementations (visitor and attempt methods), `proxy.ts` (`/s/*` and `/api/s/*` bypass the owner guard; they never expose owner data), `next.config.ts` (headers for `/s/*`: `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store`)
- Test: `tests/unit/guard.test.ts`, `tests/unit/visitor-routes.test.ts`, `tests/unit/http.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 11.
- Produces (exact):
  ```ts
  export interface Visitor { id: string; linkId: string; displayName: string | null; createdAt: string; lastSeenAt: string; lastRoundId: string | null }
  // ShareStore additions
  createVisitor(linkId: string, ipHash: string | null): Promise<Visitor>; getVisitor(id: string): Promise<Visitor | null>; setVisitorName(id: string, name: string): Promise<void>;
  touchVisitor(id: string, patch: { lastRoundId?: string | null }): Promise<void>; countVisitors(linkId: string): Promise<number>; countRecentVisitors(linkId: string, ipHash: string, since: Date): Promise<number>;
  getAttempt(linkId: string, ipHash: string): Promise<{ fails: number; lockedUntil: string | null } | null>;
  recordFailure(linkId: string, ipHash: string, now: Date): Promise<{ fails: number; lockedUntil: string | null }>;   // fails+1; lockedUntil = now + lockSeconds(fails)
  clearAttempts(linkId: string, ipHash: string): Promise<void>;
  // http.ts
  readJsonLimited<T>(req: Request, maxBytes: number): Promise<T>        // 413 Response if Content-Length or streamed body exceeds; 400 on invalid JSON
  clientIp(req: Request): string                                        // x-vercel-forwarded-for, else first x-forwarded-for hop, else "0.0.0.0"
  ipHash(ip: string, secret: string): string                            // HMAC-SHA256 hex; never stored with the raw IP
  // guard.ts
  export interface Need { named?: boolean; action?: Action; frameId?: string | null }
  export interface GuardOk { link: LinkRow; visitor: Visitor; claims: VisitorClaims; cookieHeader: string | null /* Set-Cookie to attach when the sliding window refreshed */ }
  requireVisitor(req: Request, token: string, need: Need, deps?: { store?: ShareStore; now?: () => Date; secrets?: string[] }): Promise<GuardOk>
  //   throws a Response: 404 { error:"not-found" } (implausible or unknown token) · 410 { error:"gone" } (revoked or expired — identical body) · 401 { error:"session-required" | "password-required" } · 403 { error:"name-required" | "forbidden" | "out-of-scope" }
  //   order: isPlausibleToken -> hashToken -> getLinkByHash -> linkState -> verifyVisitorCookie(secrets) -> claims.lid === link.id && claims.ep === link.cookieEpoch -> (link.passwordHash ? claims.pw : true) -> visitor exists and belongs to link -> need.named ? visitor.displayName : true -> can(link, need.action) -> inScope(link, { frameId }) -> slideCookie
  // GET  /api/s/[token]/meta (no guard) -> { status: "ok" | "gone" | "not-found"; needsPassword: boolean; hasSession: boolean; visitorName: string | null; studioName: string; title: string | null /* only when no password gate is pending */; permission?: string; welcomeNote?: string | null }
  // POST /api/s/[token]/session {} -> creates a visitor + cookie for links WITHOUT a password (401 password-required otherwise); caps: 500 visitors per link, 30 new visitors per IP-hash per link per hour (429)
  // POST /api/s/[token]/unlock { password } -> 204 + cookie { pw: true } | 401 { error:"wrong-password", retryAfter } | 429 { error:"locked", retryAfter } + Retry-After header; JSON body <= 1 KB; verifies even when the link has no password (204)
  // POST /api/s/[token]/join { name } -> 200 { name } (sanitiseDisplayName; invalid -> 400); requires session (and password if set)
  ```
  Failure accounting: the attempt row is keyed `(linkId, ipHash)`; the first 3 failures are free, then `lockSeconds`; a locked client gets 429 **before** the password is verified (so lock cannot be probed); success clears the row; the same 401 body is returned for every kind of wrong password; all mutating routes call `assertSameOrigin`.
- [ ] **Step 1: Failing tests (Review Focus #1 and #3).** Guard, each with a fake store/clock: unknown token → 404; 42-char token → 404 without touching the store; revoked → 410 even with a perfectly valid cookie; expired → 410 with a body identical to revoked; cookie signed for link A presented to link B → 401 `session-required`; cookie with old `ep` after revoke/password change → 401; tampered or expired cookie → 401; password link with `pw:false` → 401 `password-required`; unnamed visitor needing `named` → 403 `name-required`; view-only link with `action: "react"` → 403 `forbidden`; frames-scope link with `frameId` outside scope → 403 `out-of-scope`; an owner-route request carrying a visitor cookie is rejected by `requireOwner` (401); success refreshes the cookie when 2 h old. Routes: `unlock` wrong password 1–3 times → 401 with no lock; the 4th wrong → 401 with `retryAfter 2`; a request during the lock → 429 and the password is **not** verified (spy); 100 wrong attempts never exceed `lockSeconds` cap 900 and never reveal state difference; correct password after the lock expires → 204, attempts cleared, cookie has `pw` claim, `HttpOnly`; `session` on a password link → 401; 31st session in an hour from one ip-hash → 429; visitor cap 500 → 429; `join` with `"‮evil<script>"` stores `evil<script>`, empty/61 chars → 400; 2 KB `unlock` body → 413; `meta` for a password link omits `title` and `welcomeNote`, for a revoked link returns `status:"gone"` with no other fields; every response carries `Cache-Control: private, no-store`. `readJsonLimited` rejects a stream that lies about Content-Length.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: visitor sessions and guard`.

### Task 13: Viewer board — server-side `ViewerBoard` builder and API

**Files:**
- Create: `lib/viewer/viewer-types.ts` (types only), `lib/server/viewer-board.ts`, `app/api/s/[token]/board/route.ts`
- Modify: `lib/server/share-store.ts` + implementations (`getSnapshotState`, `getBoardTitle`, `getAssets`, `getLiveState`)
- Test: `tests/unit/viewer-board.test.ts`, `tests/unit/viewer-board-api.test.ts`

**Interfaces:**
- Consumes: Task 4 `fragmentToBlocks`, `RichBlock`; Task 9 `loadBoardState`, `objectsFromState`, `diffObjects`, `Round`; Task 11/12 guard and store; Phase 2 `isAllowedEmbedUrl`, `creditLine`, `VariantName`, `validateObject`.
- Produces (exact):
  ```ts
  // viewer-types.ts (no imports from engine/doc, yjs or tiptap)
  export type ViewerObject = CanvasObject & { blocks?: RichBlock[] };          // text, sticky, shape label, frame name stays in `name`
  export interface ViewerSlide { id: string; name: string; w: number; h: number; x: number; y: number; previewW480: string | null; previewW1280: string | null }
  export interface ViewerAsset { w: number; h: number; kind: "image" | "video" | "gif"; variants: VariantName[]; credit: string | null; sourceUrl: string | null }
  export interface ViewerBoard {
    board: { title: string; background: string | null };
    round: { id: string; number: number; label: string; publishedAt: string } | null;
    slides: ViewerSlide[]; objects: ViewerObject[]; assets: Record<string, ViewerAsset>; assetBase: string;
    options: { permission: "view" | "react" | "comment"; allowDownload: boolean; watermark: boolean; showCredits: boolean; blindVotes: boolean; votesRevealed: boolean; welcomeNote: string };
    changed: { sinceRound: number; byFrame: Record<string, { added: number; changed: number }> } | null;
    visitor: { id: string; name: string | null };
  }
  // AssetRow = a row of the `assets` table as the service client returns it (id, kind, width, height, variants jsonb, source_url, credit, licence)
  buildViewerBoard(input: { state: Uint8Array; link: LinkRow; round: Round | null; title: string; assets: AssetRow[]; visitor: Visitor; diffsSinceLastView: RoundDiff[]; sinceRound: number | null; assetBase: string }): ViewerBoard
  visibleObject(state: Uint8Array, link: LinkRow, objectId: string): { frameId: string | null } | null   // used by Task 15 to validate reaction/comment targets
  // GET /api/s/[token]/board (guard: need {}) -> ViewerBoard ; round mode reads the immutable round snapshot (Cache-Control: private, max-age=30), live mode reads the merged current state (no-store)
  ```
  Redaction and scope: presenter notes are blanked (`FrameObj.notes = ""`) and never sent; `locked`, `createdAt`, `updatedAt` dropped; `provenance`/asset `credit`/`sourceUrl` included **only** when `link.showCredits`; scope `frames` keeps the listed frames, their descendants, and nothing outside them (objects not inside a listed frame are dropped, arrows whose ends are dropped are dropped); embed/link URLs re-checked with `isAllowedEmbedUrl`/http(s) (invalid → object dropped); rich text only as `RichBlock[]` (never HTML); invalid objects skipped; `changed` = sum of the `RoundDiff.byFrame` of every round published after `visitor.lastRoundId` (null for first-time visitors); after building, `touchVisitor(visitor.id, { lastRoundId: round.id })`; slides = frames in presentation order with preview URLs `${assetBase}/${key}` when previews exist.
- [ ] **Step 1: Failing tests.** Notes are empty strings in the JSON (assert the raw JSON string does not contain the notes text); a sticky's `blocks` are runs, and the serialised JSON contains no `<` from content; `showCredits: false` → `JSON.stringify(board)` contains neither a credit string nor a `sourceUrl`; `true` → present; scope `frames: [A]` → objects in frame B and free objects absent, an arrow from A to B absent; round mode returns the snapshot content even after the live doc changed, live mode returns the change; an `EmbedObj` with a tampered `embedUrl` is dropped; `previewW480/W1280` null when the round has none; `changed` sums two skipped rounds' diffs for a visitor last seen on round 1 when rounds 2 and 3 exist and is `null` for a new visitor; `touchVisitor` updates `lastRoundId`; 1,000-image board JSON ≤ 450 KB uncompressed (each image object ≤ 400 bytes); API: 410 for revoked, 401 without cookie, 404 for another link's token, response has no `tokenHash`, `passwordHash`, `ownerId`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `Atelier: viewer board API`.

### Task 14: Share page and phone-first viewer

**Files:**
- Create: `app/s/[token]/page.tsx`, `loading.tsx`, `components/viewer/ViewerApp.tsx`, `Gate.tsx`, `SlideDeck.tsx`, `ThumbStrip.tsx`, `ViewerCanvas.tsx`, `Watermark.tsx`, `lib/viewer/viewer-resolver.ts`, `lib/viewer/gate.ts`, `scripts/check-bundle-size.mjs`
- Modify: `eslint.config.mjs` (restricted imports), `package.json` (`"size": "node scripts/check-bundle-size.mjs"`), `.github/workflows/atelier-ci.yml` (run `npm run size` after build), `next.config.ts` (CSP for `/s/*`)
- Test: `tests/unit/gate.test.ts`, `tests/unit/viewer-app.test.tsx`, `tests/unit/check-bundle-size.test.ts`, `tests/unit/viewer-csp.test.ts`

**Interfaces:**
- Consumes: Task 12 routes, Task 13 `ViewerBoard`, Task 3 `swipeDirection`, `cameraForSlide`-style maths (import the pure files directly, not an index), Phase 1 `PointerTracker`, `arrowPath`, Phase 2 `pickVariant`, `DomImageLayer`, `EmbedView` facade, `maskRadii`, `isAllowedEmbedUrl`, `creditLine`.
- Produces (exact):
  ```ts
  export type GateState = "loading" | "gone" | "password" | "session" | "ready";
  nextGate(meta: { status: "ok" | "gone" | "not-found"; needsPassword: boolean; hasSession: boolean }): GateState   // gone/not-found -> "gone"; needsPassword -> "password"; !hasSession -> "session" (auto POST /session); else "ready"
  ```
  - **Page** `/s/[token]` (server component): calls the same lib functions as the API (no HTTP hop) to render the gate state; for a no-password link it also inlines the `ViewerBoard` JSON and renders the first slide preview `<img>` (`srcset` w480 / w1280, `width`/`height`, `fetchpriority="high"`, `decoding="async"`) **before** hydration; password gate = labelled field, show/hide, errors in a polite live region, countdown from `retryAfter`; "gone" screen "This link is no longer available" (same text for revoked, expired, unknown). Welcome note card first visit per link (dismiss remembered in `localStorage`, try/catch), studio name from `ATELIER_STUDIO_NAME` as small text (SPEC §12 Q3), no logo.
  - **Viewer** (client, no Yjs/Tiptap/jsPDF; rich text is drawn from `RichBlock[]` by a small `BlockText` component that renders runs as React text nodes with `<strong>/<em>/<u>/<s>` and validated `<a>` only): Slides mode (swipe, ←/→/Home/End, thumbnail strip, slide counter, polite live region "Slide 2 of 7: Direction A") and Canvas mode (free pan/zoom with `PointerTracker`, pinch-zoom upgrades image variants via `pickVariant`; **tap an image** → zoom-to-full-resolution view); layout works at 375 px with 16 px gutters and 44 px targets; `prefers-reduced-motion` removes slide movement; `Watermark` repeats "{visitor name or 'Guest'} · {date}" diagonally via a CSS background SVG data URI with escaped text (a deterrent, stated as such); outbound links use `rel="noopener noreferrer nofollow"`; images' alt text from `title`, else credit, else "Image {n}"; a 410 from any API call swaps to the "gone" screen immediately. When `allowDownload` the viewer offers "Download slide (PNG)" and "Download deck (PDF)" via dynamic `import()` of the export engine and `ViewerBoard` → `SceneSource` adapter; the UI text says downloads are a convenience and image files remain reachable by URL (SPEC §3.5 trade-off).
  - **Budget**: ESLint `no-restricted-imports` forbids `yjs`, `y-*`, `@tiptap/*`, `jspdf`, `fflate`, `hash-wasm`, `lib/engine/doc/**`, `lib/engine/export/**` (except through `import()` in `components/viewer/DownloadMenu.tsx`) under `app/s/**`, `components/viewer/**`, `lib/viewer/**`. `scripts/check-bundle-size.mjs` reads `.next/app-build-manifest.json` (or the build trace) for the route `/s/[token]`, gzips each first-load chunk, prints a table and exits 1 if the total exceeds 200 KB gz.
  - **CSP for `/s/*`**: `default-src 'self'; img-src 'self' https://{NEXT_PUBLIC_R2_PUBLIC_HOST} data: blob:; media-src https://{R2_HOST} blob:; connect-src 'self' https://{R2_HOST}; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.figma.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` (script nonce handled per Next docs).
- [ ] **Step 1: Failing tests.** `nextGate` truth table (gone, not-found, password, no session, ready); viewer app (jsdom, mocked fetch): gone meta renders only the gone text; password form has a visible label, wrong password shows the message in a `role="status"` region and the retry countdown disables submit; with a board the first slide `<img>` is in the server HTML (render-to-string) with `fetchpriority="high"`; slide change announces "Slide 2 of N: name"; arrow keys and swipe change slide; Canvas mode tap on an image opens the full-resolution view and requests a larger variant (check `data-variant`); a sticky containing `<img src=x onerror=…>` renders as text; watermark text is escaped; a 410 response swaps to the gone screen; 375 px layout has no horizontal overflow (`scrollWidth <= clientWidth`); download menu absent when `allowDownload` is false and does not statically import the engine (assert with the bundler metafile / a source scan). `check-bundle-size` fixture manifest: 199 KB passes, 201 KB fails with a readable table. CSP test: header string contains the R2 host and no wildcard, includes `frame-ancestors 'none'`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; `npm run build && npm run size` passes (record the number in PROGRESS). Step 5: Commit** `Atelier: share page and client viewer`.

### Task 15: Client review — reactions, pinned comments, approvals, blind votes

**Files:**
- Create: `app/api/s/[token]/reactions/route.ts`, `comments/route.ts`, `approvals/route.ts`, `lib/server/review.ts`, `components/viewer/ReactionBar.tsx`, `CommentLayer.tsx`, `ApprovePanel.tsx`, `NamePrompt.tsx`, `lib/viewer/review-client.ts`
- Modify: `lib/server/share-store.ts` + implementations, `lib/server/notify.ts` (interface; implemented in Task 17), `components/viewer/SlideDeck.tsx`, `ViewerCanvas.tsx`
- Test: `tests/unit/review-api.test.ts`, `tests/unit/review-client.test.ts`, `tests/unit/review-ui.test.tsx`

**Interfaces:**
- Consumes: Task 12 `requireVisitor`, `readJsonLimited`, `assertSameOrigin`, `sanitiseDisplayName`; Task 13 `visibleObject`; Task 11 `can`, `inScope`.
- Produces (exact):
  ```ts
  export type ReactionKind = "pick" | "reject" | "more";
  export interface ReviewComment { id: string; authorKind: "owner" | "visitor"; authorName: string; objectId: string | null; frameId: string | null; pin: { space: "object" | "canvas"; x: number; y: number } | null; body: string; parentId: string | null; resolved: boolean; createdAt: string; mine: boolean }
  // StoredComment = ReviewComment plus { boardId; linkId: string | null; visitorId: string | null; roundId: string | null }; NewComment = Omit<StoredComment, "id" | "createdAt" | "resolved" | "mine" | "authorName"> & { authorName?: never }; ApprovalRow = { id: string; linkId: string; visitorId: string; frameId: string; roundId: string | null; createdAt: string }
  // ShareStore additions
  setReaction(a: { linkId: string; visitorId: string; roundId: string | null; objectId: string; kind: ReactionKind; on: boolean }): Promise<void>;
  clearReaction(a: { visitorId: string; roundId: string | null; objectId: string; kind: ReactionKind }): Promise<void>;
  listReactions(linkId: string, roundId: string | null): Promise<{ visitorId: string; objectId: string; kind: ReactionKind }[]>;
  countVisitorReactions(visitorId: string): Promise<number>;
  insertComment(c: NewComment): Promise<ReviewComment>; listComments(f: { boardId: string; linkId?: string; roundId?: string | null; includeResolved?: boolean }): Promise<StoredComment[]>;
  getComment(id: string): Promise<StoredComment | null>; countRecentComments(visitorId: string, since: Date): Promise<number>;
  upsertApproval(a: { linkId: string; visitorId: string; frameId: string; roundId: string | null }): Promise<ApprovalRow>; deleteApproval(a: { visitorId: string; frameId: string; roundId: string | null }): Promise<void>; listApprovals(linkId: string, roundId: string | null): Promise<ApprovalRow[]>;
  // PUT  /api/s/[token]/reactions { objectId, kind, on } -> 200 { mine: { objectId; kinds: ReactionKind[] }, counts?: { pick; reject; more } }   guard need { action: "react", named: true, frameId } ; "pick" and "reject" are mutually exclusive per object (setting one clears the other); "more" independent; <= 2,000 reactions per visitor
  // GET  /api/s/[token]/reactions -> { mine: {...}[]; counts: Record<objectId, {pick;reject;more}> | null }   counts null while link.blindVotes && !link.votesRevealed
  // POST /api/s/[token]/comments { body, objectId?, frameId?, pin?: { space; x; y }, parentId? } -> 201 ReviewComment   guard { action: "comment", named: true }; JSON <= 8 KB else 413; body: control chars (except \n \t) stripped, trimmed, 1..2000 chars else 400 "too-long"/"empty"; pin x,y finite and within ±1e7 (space "object": 0..1); objectId must pass visibleObject; parentId must be a ROOT comment on the same link (depth 1); 20 comments per 10 minutes per visitor (429)
  // GET  /api/s/[token]/comments -> { comments: ReviewComment[] }   a visitor sees their own comments and every owner reply; when !blindVotes also other visitors' comments of the same link
  // POST /api/s/[token]/approvals { frameId } -> 201 { frameId; visitorName; createdAt } ; DELETE withdraws; guard { action: "approve", named: true, frameId }; idempotent per (visitor, frame, round)
  notifyOwner(e: { kind: "comment" | "approval" | "reaction"; boardId: string; linkId: string; refId: string; summary: string }): Promise<void>   // interface + no-op default here; implemented in Task 17
  ```
  UI (viewer): `ReactionBar` for the selected/tapped image — three `<button aria-pressed>`: Heart + "Pick", X + "Reject", Plus + "More like this" (SVG icons from `lucide-react` plus visible text), counts shown only when the API returned counts; blind-vote notice "Others' picks stay hidden until the studio shows them"; small icon badges on images already reacted to; `CommentLayer`: numbered pin buttons, composer bottom sheet with a character counter (2,000), thread view with owner replies; `ApprovePanel`: per slide "Approve this direction" → confirmation dialog "Approve “{frame}” as {name}? The studio will see your name and today's date." → shows "Approved by you · {date}" with Withdraw; `NamePrompt` dialog appears the first time an action needs a name (stored by `POST /join`, the cookie remembers). Updates are optimistic with rollback and a retry toast; failures never lose typed comment text.
- [ ] **Step 1: Failing tests (Review Focus #2).** API with fake store: view-only link → 403 on reactions/comments; unnamed visitor → 403 `name-required`; reaction to an object id from another board or outside a frames scope → 403/404; `pick` after `reject` leaves only `pick`; `more` toggles independently; 2,001st reaction → 429; comment of 2,000 chars ok, 2,001 → 400 `too-long`, 1 MB body → 413, whitespace-only → 400 `empty`, `"a\u0000b"` stored as `ab`; pin `{x: NaN}`, `{x: 1e308}`, `{space:"object", x: 2}` → 400; `parentId` of a comment on another link → 400, reply to a reply → 400; 21st comment in 10 minutes → 429; `<script>alert(1)</script>` stored verbatim and returned verbatim (escaping is the renderer's job); blind-vote link: `GET reactions` returns `counts: null` until `votesRevealed`, and a visitor does not see another visitor's comments but sees owner replies on their own thread; approval needs `named`, frame outside scope → 403, repeated POST is idempotent, DELETE removes it; every successful write calls `notifyOwner` once (spy); revoked link mid-session → 410. UI: optimistic toggle rolls back on failure and shows a retry toast; typed comment text kept after a failed send; confirmation dialog must be confirmed before the approval request is sent; comment text with `<img src=x onerror=…>` renders as text; counts hidden in blind mode; `aria-pressed` reflects state.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: client review actions`.

### Task 16: Owner feedback — badges, per-direction totals, feedback panel, reply and resolve

**Files:**
- Create: `lib/server/feedback.ts`, `app/api/boards/[id]/feedback/route.ts`, `app/api/boards/[id]/comments/route.ts`, `app/api/comments/[id]/route.ts`, `components/canvas/FeedbackOverlay.tsx`, `components/panels/FeedbackPanel.tsx`, `lib/engine/rounds/totals.ts`, `lib/feedback-client.ts`
- Modify: `components/canvas/CanvasView.tsx` (overlay slot), `components/panels/*` (panel host: Feedback), `components/canvas/objects/FrameView.tsx` (totals chip next to the frame name), `lib/engine/commands/commands.ts`
- Test: `tests/unit/feedback-api.test.ts`, `tests/unit/totals.test.ts`, `tests/unit/feedback-ui.test.tsx`

**Interfaces:**
- Consumes: Task 15 store methods and `ReviewComment`; Task 11 `listLinks`; Phase 1 `requireOwner`, `SelectionStore`, `CanvasHandle`, `fitRect`, `boundsOf`.
- Produces (exact):
  ```ts
  export interface OwnerComment extends ReviewComment { linkId: string | null; linkName: string | null; roundNumber: number | null; visitorName: string | null }
  export interface FeedbackBundle {
    reactions: Record<string /* objectId */, { pick: number; reject: number; more: number; names: { pick: string[]; reject: string[]; more: string[] } }>;
    comments: OwnerComment[];
    approvals: { id: string; frameId: string; visitorName: string; linkName: string; roundNumber: number | null; createdAt: string }[];
    links: { id: string; name: string; blindVotes: boolean; votesRevealed: boolean }[];
  }
  // GET /api/boards/[id]/feedback?round=<id>&link=<id> -> FeedbackBundle (owner-only; owner always sees counts and names, blind or not)
  // POST /api/boards/[id]/comments { body, parentId, objectId? } -> 201 OwnerComment   (author_kind "owner"; body 1..2000; JSON <= 8 KB; parent must be a root comment on this board)
  // PATCH /api/comments/[id] { resolved: boolean } -> OwnerComment   (sets/clears resolved_at on the root and its replies)
  frameTotals(fb: Pick<FeedbackBundle, "reactions">, objects: CanvasObject[]): Record<string /* frameId or "_none" */, { pick: number; reject: number; more: number }>   // attributed by top-most frame ancestor
  formatTotals(t: { pick: number; reject: number; more: number }): string       // accessible text: "7 picks, 2 rejects, 3 more like this"
  ```
  UI: `FeedbackOverlay` draws, over each image with feedback, a constant-screen-size badge (lucide `Heart` 3 · `X` 1 · `Plus` 2 — icon **and** count, non-zero kinds only, `aria-label` from `formatTotals`) when zoom ≥ 0.1 and feedback mode is on (`view.toggleFeedback`, default on when the board has feedback); frame name labels get a totals chip ("Direction A: 7 ❤ · 2 ✕ · 3 ➕" rendered as icons + numbers). `FeedbackPanel` (right panel): filters All / Unresolved, link, round; threads grouped by round and link with visitor name (React text), body, time; reply composer; Resolve/Reopen; "Jump to object" (selects it and `setCamera(fitRect(bounds, viewport, 128, 2))`); approvals list ("Direction B approved by Jane · 12 Nov"); per-link "Show votes to clients" switch for blind links (`PATCH` link `votesRevealed`). Live updates: the panel subscribes to Supabase Realtime broadcast `atelier:feedback:{boardId}` (sent by `notifyOwner`, Task 17) and refetches; it also refetches on window focus and every 60 s while open.
- [ ] **Step 1: Failing tests.** `frameTotals`: reactions on two images in frame A and one in frame B plus one free image → totals per frame and `_none`; nested group inside a frame attributes to the frame; unknown object ids ignored. API: owner-only (401/403), another owner's board → 404, blind link still returns counts and names to the owner, `round` and `link` filters work, owner reply creates `author_kind "owner"` with `parentId`, reply to a reply → 400, 2,001-char reply → 400, resolve sets `resolved` on the thread, a visitor cookie cannot call these routes. UI: badge shows icon + count text (not colour-only), is hidden below zoom 0.1 and when feedback mode is off, visitor name `<img src=x onerror=…>` renders as text in the panel; "Jump to object" selects the object and calls `setCamera`; Resolve toggles and moves the thread under the "Resolved" filter; blind switch calls the PATCH; Realtime message triggers one refetch.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: owner feedback panel and badges`.

### Task 17: Notifications — in-app inbox badge and web push

**Files:**
- Create: `lib/server/push.ts`, `app/api/push/subscribe/route.ts`, `app/api/push/public-key/route.ts`, `app/api/notifications/route.ts`, `components/settings/Notifications.tsx`
- Modify: `lib/server/notify.ts` (implementation), `lib/server/share-store.ts` + implementations (`insertNotification`, `listNotifications`, `markNotificationsRead`, `upsertPushSubscription`, `deletePushSubscription`, `listPushSubscriptions`, `bumpPushFailure`), `public/sw.js` (`push`, `notificationclick`), `app/settings/page.tsx`, `components/chrome/Toolbar.tsx` and `components/home/BoardCard.tsx` (unread badge), `package.json` (`web-push`, `@types/web-push`), `docs/DEPENDENCIES.md`
- Test: `tests/unit/push.test.ts`, `tests/unit/notify.test.ts`, `tests/unit/push-api.test.ts`, `tests/unit/sw-push.test.ts` (loads `public/sw.js` in a Node `vm` with stubbed `self`)

**Interfaces:**
- Consumes: Task 1 `push_subscriptions`, `owner_notifications`; Task 15 `notifyOwner` signature; Phase 1 `requireOwner`; env `VAPID_*`.
- Produces (exact):
  ```ts
  // PushSub = { id: string; endpoint: string; p256dh: string; auth: string; failedCount: number }
  pushPayload(e: { kind: "comment" | "approval" | "reaction"; boardId: string; summary: string }, boardTitle: string): { title: string; body: string; url: string; tag: string }
  //   title "New comment · {board title}" / "Direction approved · …", truncated to 60 chars; body = first 80 chars of the plain-text summary; url `/b/${boardId}?panel=feedback`; tag = boardId; JSON size <= 3 KB; control characters removed
  sendPush(subs: PushSub[], payload: ReturnType<typeof pushPayload>, deps: { webpush: Pick<typeof import("web-push"), "sendNotification" | "setVapidDetails"> }): Promise<{ sent: number; removed: string[]; failed: number }>
  //   404/410 -> subscription removed; other errors bump failed_count and the subscription is removed at 5; never throws
  notifyOwner(e): Promise<void>   // insert owner_notifications (summary <= 200 chars), broadcast Realtime `atelier:feedback:{boardId}`, then push unless a push for the same board was sent in the last 60 s (coalesce: row still created, pushed_at null); no VAPID env -> push skipped silently, in-app only; never throws into the visitor request
  // GET  /api/push/public-key -> { key } (404 when VAPID_PUBLIC_KEY unset)
  // POST /api/push/subscribe { endpoint: https URL <= 2048, keys: { p256dh, auth } } -> 204 (owner-only, AAL2 if enrolled, upsert by endpoint) ; DELETE /api/push/subscribe { endpoint }
  // GET  /api/notifications?unread=1 -> { items: { id; kind; boardId; summary; createdAt; readAt }[]; unread: number } ; POST /api/notifications { ids?: string[] } marks read (all when omitted)
  // sw.js: "push" -> showNotification(title, { body, tag, data: { url }, icon: "/brand/icon-192.png" }) with payload parsed defensively (invalid JSON -> generic "New feedback"); "notificationclick" -> close, then focus an existing window or open the url ONLY when `new URL(url, self.location.origin).origin === self.location.origin`
  ```
  Settings → Notifications: "Turn on notifications" (calls `Notification.requestPermission()` only from the click handler, then `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`), "Turn off", "Send a test notification"; states: unsupported, blocked, off, on; help text notes iOS delivers web push only to the installed app (16.4+).
- [ ] **Step 1: Failing tests (Review Focus #2).** `pushPayload` truncates a 500-char comment to 80, strips `\u0000`, keeps `<script>` as inert text, stays under 3 KB; `sendPush` removes a subscription on 410, bumps failures on 500 and removes at the 5th, never throws on a rejected promise; `notifyOwner`: creates a row, pushes once, a second event for the same board within 60 s creates a row but does not push, an event 61 s later pushes; with no VAPID env it creates only the row; an exception in push does not propagate; Realtime broadcast called once. API: subscribe 401/403 for non-owner, rejects `http://…` and a 2,100-char endpoint, upsert on same endpoint doesn't duplicate; `GET /api/notifications` only returns the owner's; mark-read clears `unread`. SW: `notificationclick` with `https://evil.example/x` does not open it, with `/b/abc?panel=feedback` does; `push` with garbage JSON shows the generic notification.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: notifications and web push`.

### Task 18: Link analytics

**Files:**
- Create: `app/api/s/[token]/view/route.ts`, `app/api/share-links/[id]/analytics/route.ts`, `lib/share/analytics.ts`, `lib/viewer/heartbeat.ts`, `components/share/LinkActivity.tsx`
- Modify: `lib/server/share-store.ts` + implementations (`insertView`, `listViews`), `components/viewer/ViewerApp.tsx` (heartbeat), `components/share/LinkTable.tsx` (opens, last opened)
- Test: `tests/unit/analytics.test.ts`, `tests/unit/heartbeat.test.ts`, `tests/unit/view-api.test.ts`

**Interfaces:**
- Consumes: Task 12 guard, Task 11 store, Task 1 `link_views`.
- Produces (exact):
  ```ts
  export interface ViewRow { visitorId: string | null; frameId: string | null; startedAt: string; durationMs: number }
  countOpens(views: ViewRow[], gapMs = 30 * 60 * 1000): number        // sessions: per visitor, consecutive views further apart than gapMs start a new open
  export interface LinkAnalytics { opens: number; uniqueVisitors: number; lastOpenedAt: string | null; visitors: { id: string; label: string /* display name or "Visitor {n}" in order of first seen */; firstSeen: string; lastSeen: string; totalMs: number; perFrame: { frameId: string; name: string; ms: number }[] }[] }
  aggregateViews(views: ViewRow[], visitors: Visitor[], slides: { id: string; name: string }[]): LinkAnalytics
  class SlideTimer { constructor(now?: () => number); enter(frameId: string | null): ViewBeat | null; leave(): ViewBeat | null; pause(): ViewBeat | null; resume(): void }   // counts only time while document.visibilityState === "visible"; each ViewBeat = { frameId; durationMs }
  // POST /api/s/[token]/view { frameId: string | null, durationMs: number } -> 204   guard { frameId }; JSON <= 1 KB; durationMs clamped to 0..600000; 120 per minute per visitor (429); sent with navigator.sendBeacon on slide change, visibilitychange and pagehide (fetch keepalive fallback)
  // GET /api/share-links/[id]/analytics -> LinkAnalytics (owner-only)
  ```
  No IP address, user agent or fingerprint is stored with views (the only IP-derived value is the HMAC `ip_hash` on `visitors` and `share_auth_attempts`, used for abuse caps and never returned). The Activity tab of the share dialog shows per-visitor total time and per-frame time as text with a proportional bar (`role="img"` with a text alternative), "opened when / by whom / time per frame" exactly as SPEC §5, and no third-party scripts.
- [ ] **Step 1: Failing tests.** `countOpens`: two views 10 min apart = 1 open, 31 min apart = 2, different visitors count separately, empty = 0; `aggregateViews`: unnamed visitors labelled "Visitor 1", "Visitor 2" by first-seen order, per-frame sums, `lastOpenedAt` is the newest `startedAt`; `SlideTimer`: switching slides emits the previous beat with elapsed ms, hidden time is excluded (fake visibility), `leave()` twice emits once; API: `durationMs: 99999999` stored as 600000, negative → 0, frame outside a frames-scoped link → 403, revoked link → 410 and nothing inserted, 2 KB body → 413, 121st beat in a minute → 429; analytics route owner-only and never includes `ipHash`; the stored row has no IP-like column (schema assertion in `rls.sql`/migration check).
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS; build. Step 5: Commit** `Atelier: share link analytics`.

### Task 19: Security hardening suite

**Files:**
- Create: `tests/security/visitor-isolation.test.ts`, `link-lifecycle.test.ts`, `hostile-input.test.ts`, `headers.test.ts`, `owner-surface.test.ts`, `docs/SECURITY.md`
- Modify: `package.json` (`"test:security": "vitest run tests/security"`), `.github/workflows/atelier-ci.yml` (runs as its own step), `supabase/tests/rls.sql` (Phase 3 re-assertions), any route that fails a test
- Test: the files above (all run against `MemoryShareStore` through the real route handlers)

**Interfaces:** consumes every Phase 3 route; produces no new production API. `docs/SECURITY.md` is a one-page threat model: assets (boards, share tokens, visitor data), attackers (link holder, guesser, other Supabase identity, hostile visitor content), controls and the test that proves each.
- [ ] **Step 1: Write failing tests** (any that already pass are kept as regression guards):
  - *Isolation:* with links A (board 1) and B (board 2) and a cookie for A: B's `board`, `reactions`, `comments`, `approvals`, `view` and `join` all return 401; A's cookie sent with token B in the path is rejected; an `objectId` belonging to board 2 sent to link A's `reactions` → 403/404 and no row written; a frames-scope link cannot react to, comment on, approve or log a view for an object/frame outside its frames; a **round-mode** link never returns data newer than its round; `GET /api/boards/…`, `/api/share-links/…`, `/api/push/…`, `/api/notifications` with a visitor cookie (and no owner session) → 401; a different Supabase identity (Stash anonymous user) calling owner share routes → 403.
  - *Lifecycle:* wrong password → 401 and no cookie; correct → cookie; **revoke** → the same cookie gets 410 on the very next call on every route; expiry boundary (`expiresAt == now` is expired); password changed → old cookie 401; link deleted → 404; tampered cookie, cookie for a deleted visitor, cookie with `exp` in the past → 401; secret rotation: cookie signed with `ATELIER_VISITOR_SECRET_PREV` still verifies, with an unknown secret does not.
  - *Hostile input:* comment 2,001 chars → 400, 1 MB → 413 before parsing, `unlock` 2 KB → 413; names `"<script>alert(1)</script>"`, `"‮​"` (→ rejected after cleaning), 61 chars → handled per Task 2; comment bodies with `<img src=x onerror=alert(1)>` and `javascript:alert(1)` round-trip verbatim and render as text in the viewer components, the owner `FeedbackPanel`, and `pushPayload` (render with Testing Library and assert no element is created and `innerHTML` contains `&lt;`); pins `NaN`, `Infinity`, `1e308`, `"x"` → 400; ids containing quotes/SQL fragments (`"'; drop table atelier.comments;--"`) never reach a query un-parameterised (store receives them as plain strings and returns nothing); reaction `kind: "admin"` → 400; 50 parallel reaction toggles leave exactly one row per (visitor, object, kind).
  - *Headers & CSRF:* every `/s/*` response has `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: private, no-store`, CSP with `frame-ancestors 'none'`; the visitor cookie has `HttpOnly`, `SameSite=Lax`, `Secure` in production; every mutating visitor and owner route rejects a foreign `Origin` with 403; outbound links rendered by the viewer carry `rel="noopener noreferrer nofollow"`; the token never appears in any API response body or in `Referer` for an embed (assert `referrerpolicy` on iframes).
  - *Owner surface:* GET share-link list never contains `tokenHash`, `passwordHash`, `ip_hash`; `ShareLinkSummary` JSON snapshot test; the migration contains no policy granting `anon` or `authenticated` access to `reactions`/`approvals`/`visitors` insert; `rls.sql` re-asserts B and anon see zero rows in all Phase 3 tables.
- [ ] **Step 2: Run `npm run test:security` → record failures; fix each in the owning route/guard (never by loosening a test). Step 3: PASS plus `scripts/test-rls.sh`. Step 4: Write `docs/SECURITY.md`. Step 5: Commit** `Atelier: share security tests and threat model`.

### Task 20: End-to-end, accessibility, performance, deployment notes

**Files:**
- Create: `app/api/dev/seed/route.ts` (404 unless `isLocalOnly()`; accepts `{ boardId, stateBase64, title }` and registers it in the memory store and round 1 without previews), `e2e/present.spec.ts`, `e2e/export.spec.ts`, `e2e/rounds.spec.ts`, `e2e/share.spec.ts`, `e2e/review.spec.ts`, `e2e/a11y-phase3.spec.ts`, `e2e/perf-share.spec.ts`, `e2e/fixtures/share-board.ts` (builds a 3-frame Yjs state with 12 images, 2 stickies, credits)
- Modify: `docs/PROGRESS.md`, `docs/DEPLOY.md`, `README.md`, `.github/workflows/atelier-ci.yml`

**Interfaces:** runs with `ATELIER_LOCAL_ONLY=1` (memory share store, seeded through `/api/dev/seed`); R2 PUT/GET stubbed with `page.route`.
- [ ] **Step 1: Write specs.** (present) Present from slide 1, `→` jumps without animation, swipe on `phone` animates ≤ 400 ms and a second swipe mid-flight interrupts it, `N` shows notes, `L` laser trail drawn, Escape restores the camera. (export) PNG 1×/2×/4× have the PNG signature and the expected pixel width, SVG parses and has no `script`, PDF starts `%PDF-` with N frame pages + cover/palette/credits when ticked (page count via `/Type /Page` regex), ZIP unzips to `originals/`, `credits.csv`, `palette/colors.css`, `.atelier` backup imports as a **new** board with equal object count; cancel during a 4× board export stops within 200 ms; a 30,000 px board shows the clamp notice. (rounds) publish round 1 (previews uploaded through the stub), edit, publish round 2, open Compare → highlight lists the changed object, Restore round 1 → board equals round 1 and one Undo returns; offline device edit during publish survives sync. (share, `phone` project 375×812) create link with password + comment permission → open in a fresh context → wrong password shows wait message, correct → name prompt on first Pick → Pick / Reject / More → pinned comment (2,000 chars ok, 2,001 blocked) → Approve with confirmation; owner sees badges, per-frame totals "7 ❤ · 2 ✕ · 3 ➕"-style chip and the comment, replies and resolves; revoke → visitor's next tap shows "This link is no longer available". Blind-vote link hides others' counts until revealed. (a11y) axe: zero serious/critical on the share gate, viewer (slides and canvas modes), comment sheet, approve dialog, Share dialog, Export dialog, Rounds panel, Feedback panel, Compare page, Present view; every new control keyboard-operable. (perf-share) with CDP network `1.6 Mbps / 150 ms RTT` and 4× CPU slowdown, the first slide preview is the LCP element and LCP < 2.5 s, interactive < 4 s; `npm run size` reports < 200 KB gz.
- [ ] **Step 2: Run `npm run e2e` → fix until green on `desktop` and `phone`.**
- [ ] **Step 3: Docs.** `docs/DEPLOY.md`: owner-run steps (after the owner's go-ahead): apply `0003_atelier_phase3.sql` with the Supabase MCP `apply_migration` to project `rvbllpkhwakjuahxyfff`; enable Realtime broadcast for channel prefix `atelier:`; generate secrets locally and add to Vercel env — `ATELIER_VISITOR_SECRET` (`openssl rand -base64 48`), VAPID pair (`npx web-push generate-vapid-keys`) as `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:` address), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_R2_PUBLIC_HOST`, `ATELIER_STUDIO_NAME`; R2 CORS must allow `PUT` and `GET` for prefix `p/` (previews); note `web-push` is MPL-2.0; smoke checklist (publish round on desktop, open link on a real phone over 4G in a private window, wrong password ×4 waits, comment, owner receives push, revoke). `README.md`, `PROGRESS.md` (every SPEC §2 Phase 3 bullet, §5, §7 and §8 share-page rows passed/failed with measured LCP/interactive/gz size); manual checks recorded: install PWA on iOS and receive a push, present on an iPad with Pencil laser, open a PDF deck in Preview/Acrobat and confirm text is selectable.
- [ ] **Step 4: Final gate:** `npm run typecheck && npm run lint && npm test && npm run test:security && npm run build && npm run size && npm run e2e` and `scripts/test-rls.sh` all pass.
- [ ] **Step 5: Commit** `Atelier: phase 3 end-to-end tests, performance checks and deploy notes`.

---

## Phase 3 acceptance (from SPEC §2, §5, §7, §8)

Presentation mode with frames as ordered slides, interruptible camera transitions, presenter notes, laser pointer, hide-UI and mobile swipe · rounds (immutable snapshot, previews, history, side-by-side compare, "changed since last viewed") · share links (hashed 32-byte token, argon2id password, rate-limited unlock with backoff, expiry, revoke, view/react/comment permissions, board or frame scope, welcome note, download toggle, watermark, credits, blind votes) · visitor flow password → name → viewer with signed httpOnly cookie and a guard on every call · phone-first client review (pick/reject/more-like-this, pinned comments, per-frame approval with confirmation) · owner feedback panel, badges, per-direction totals, resolve/reply, web push and in-app badge, link analytics · exports (PNG/JPG/WebP at 1×/2×/4× or exact px, SVG, multi-page PDF deck with cover/palette/credits, ZIP with credits.csv and palette files, `.atelier` backup + import, JSON Canvas) in a worker with progress and cancel · version history with non-destructive restore · migration `0003` with RLS tests · share page < 200 KB gz, LCP < 2.5 s on throttled 4G · all tests and CI green.

Deferred by design: connector routing, mind maps, tables, timers, nested boards (Phase 4); live co-editing, AI features, E2EE boards (Later).
