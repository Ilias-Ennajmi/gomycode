# 02 — What users hate (and love) about Miro, 2023–2026

Research date: 2026-11-12. Goal: inform a Miro-like infinite-canvas whiteboard / moodboard app.

## Method and evidence caveats (read first)

- **Direct page fetches were blocked** by this session's network proxy for: `www.g2.com`, `www.capterra.com`, `www.trustradius.com`, `www.trustpilot.com`, `news.ycombinator.com`. Everything below comes from **search-engine snippets** of those pages plus the Miro Community forum (community.miro.com), Miro help center, aggregators and press. Quotes are short snippet-level excerpts; verify before publishing externally.
- **Reddit:** searches scoped to Reddit (r/miro, r/UXDesign, r/ProductManagement etc.) returned no Reddit threads via the search tool. Reddit sentiment is therefore **not directly represented**; the Miro Community forum (thousands of user threads, 2020–2026) is the main proxy for granular complaints, and is arguably better for specific UX bugs.
- **Frequency signal:** G2 AI summary lists "slow loading" and "slow performance" with *hundreds* of mentions each; Trustpilot TrustScore ~1.9–2.0/5 from ~134–144 reviews (dominated by billing). App Store mirror shows 4.7/5 (26K ratings) — i.e., mobile complaints are real but concentrated among heavy/iPad users.
- **Big context event:** Bending Spoons agreed to acquire Miro on 2026-09-10 for $1.355B EV (~90% below 2022 $17.5B peak), close expected Q4 2026. Commentators note Bending Spoons' reputation for headcount cuts and price rises (Evernote, WeTransfer, Vimeo). This is a **switching-window opportunity**. Sources: https://www.reworked.co/collaboration-productivity/bending-spoons-acquires-miro-for-136b/ , https://ro.am/rwn/bending-spoons-buys-miro , https://miro.com/blog/miro-bending-spoons/ , HN thread https://news.ycombinator.com/item?id=49643848 (commenters: "a bit bloated, but it was ok"; speculation about cost cuts / maintenance mode).

Severity scale: S1 = blocks work / costs money; S2 = daily friction; S3 = annoyance. Frequency: H/M/L relative to the corpus.

---

## 1. Ranked pain points

### #1 Performance: lag, slow load, RAM, on large and image-heavy boards — Freq H, Sev S1
**What goes wrong**
- Boards slow down sharply as object count grows (>~2,000 elements), with images, embedded PDFs, web embeds, and many concurrent editors. Startup/load is slow even for small boards.
- A large board can use **1–3 GB RAM** (G2 reviewer).
- Images show **low-res placeholders** until you zoom in "WAY too much"; images sometimes "never finish loading"; blur after zoom in Safari (Miro engineer filed a WebKit bug).
- App-update regressions ("the second the update finished, the entire application became so slow it's practically unusable", May 2025).
- Miro's official advice is essentially "split your board, downscale images, delete heavy files" — i.e., the user does the engineering.

**Quotes**
- "very slow with many images, web embeds, etc." — G2 (via snippet) https://g2.com/products/miro/reviews_and_filters?page=2
- "can get a bit laggy with dozens of people on" — G2 https://www.g2.com/products/miro/
- "Miro needs to get at least 10x faster in start up" (vs Excalidraw ~1s) — https://community.miro.com/ideas/i-wish-miro-loaded-faster-for-personal-use-16235
- ">2000 elements, many images" board crawling; reinstall fixed it — https://community.miro.com/ask-the-community-45/miro-boards-are-laggy-any-fixes-19156
- Update regression: https://community.miro.com/ask-the-community-45/extreme-lag-since-latest-update-for-intel-mac-19436
- Low-res until deep zoom: https://community.miro.com/ask-the-community-45/help-blurry-ppt-pdf-and-png-images-on-miro-board-when-zooming-in-and-sometimes-not-4012 ; images never load: https://community.miro.com/ask-the-community-45/known-bug-images-never-finish-loading-7315
- 50-person sessions: https://community.miro.com/ask-the-community-45/performance-issues-when-collaborating-with-50-people-5897
- "Miro really slowed my laptop as the board was quite large" — https://www.trustradius.com/reviews/miro-2022-02-08-12-10-30
- G2 discussion "What makes a Miro board less responsive: images, frame count or number of collaborators?" https://www.g2.com/discussions/what-makes-a-miro-board-less-responsive-images-frame-count-or-the-number-of-collaborators

**Who it hurts:** facilitators (live workshops with 30–100 people), teams with long-lived "project" boards, moodboard/design users (image-heavy), anyone on older laptops/iPads.

**How we fix it**
- WebGL/WebGPU renderer with spatial index (R-tree/quadtree) + viewport culling; render only visible tiles; LOD for text (render as blocks when tiny).
- **Image pipeline:** on upload generate a mip pyramid (e.g., 256/512/1024/2048/original) in AVIF/WebP; serve the tier matching on-screen pixel size × DPR; progressive load with blurhash placeholder; never block interaction on image decode (decode in workers / `createImageBitmap`). Keep originals untouched for export.
- Lazy-hydrate embeds (PDF pages rendered as tiled raster at needed zoom; iframes only on click).
- CRDT (Yjs/Automerge) with incremental sync and per-region subscription so a 50-person session doesn't broadcast everything.
- Publish a perf budget and a built-in "board health" panel (object count, heaviest images, one-click "optimize images").
- Target: open a 5k-object/500-image board in <2 s to first interactive; 60fps pan on M1/mid Windows laptop.

---

### #2 Billing traps: surprise seats for guests, auto-renew, hard cancellation, no-human support — Freq H (Trustpilot), Sev S1
**What goes wrong**
- Sharing a board with a guest/collaborator can **auto-provision a paid seat**; users report being charged for viewers and for "11 yearly licences" without warning.
- Guest/visitor/member rules differ per plan and are confusing; heavy guests can be converted to billable.
- Cancellation flows fail ("Outstanding invoice payment has failed"), refund route hard to find, support unreachable on low tiers.
- Business plan price rose ~25% in early 2026 ($16→$20/member/mo annual; $20→$25 monthly).

**Quotes**
- Trustpilot (TrustScore 2/5, 144 reviews): $90+ charge for a collaborator who only needed view access; "automatically added guests as team members and charged for a full license"; "you cannot reach a real person" — https://uk.trustpilot.com/review/miro.com , https://ie.trustpilot.com/review/www.miro.com?page=2
- "no straightforward way to cancel this subscription"; "customer support is non existent unless you pay" — https://nl-be.trustpilot.com/review/www.miro.com
- "how do I stop board sharing from adding billable seats" — https://community.miro.com/developer-platform-and-apis-57/paid-subscription-does-not-lift-the-mcp-100-call-limit-and-how-do-i-stop-board-sharing-from-adding-billable-seats-29444
- 15 paid seats + ~20 internal read-only guests → policy-violation emails — https://community.latenode.com/t/miro-suddenly-enforcing-guest-restrictions-to-force-upgrades/39197
- Cancellation failures — https://community.miro.com/ask-the-community-45/subscription-cancellation-problem-25278 , https://community.miro.com/ask-the-community-45/charging-when-suscription-has-been-cancelled-27112 ; Paddle podcast "Miro cancellation flow not as good as product" https://www.paddle.com/studios/shows/churning-point/miro-cancellation-flow-not-as-good-as-product
- Price change tracking — https://pricingsaas.com/companies/miro/diffs/2026Q1 ; "outrageous" $48 yearly hike — https://community.miro.com/ask-the-community-45/price-increase-20156

**Who it hurts:** team admins, agencies/freelancers sharing with clients, small teams.

**How we fix it**
- **Viewers and commenters are always free and unlimited.** Bill only for editors who *create* content, and never add a seat without an explicit admin confirmation dialog showing the price delta.
- Optional "guest editor" passes (time-boxed, e.g., 30-day free editing for external collaborators on one board).
- One-click cancel in settings, prorated refunds, pre-renewal email 7 days ahead, plain-language pricing page with a calculator.
- Pricing promise / price-lock for early adopters (explicit counter-positioning vs post-acquisition Miro).

---

### #3 Free plan too restrictive (3 boards) + core safety features paywalled — Freq H, Sev S1/S2
**What goes wrong**
- Free plan = 3 editable boards, team-wide ("even if it was just you or 100 people… only 3 editable boards"). In Sept 2026 users report it tightened further to **3 boards total** (creating a 4th fails).
- Buggy enforcement: boards locked to view-only with only 1–2 boards.
- **Version history** is paid-only and only captures versions *after* upgrade → people who lose work on Free can't get it back by paying.
- Full-text search across boards historically Enterprise-only; export resolution limited on Free.

**Quotes**
- "free plan won't let me create a 4th board, I thought boards were unlimited" (2026) — https://community.miro.com/ask-the-community-45/free-plan-won-t-let-me-create-a-4th-board-i-thought-boards-were-unlimited-28959
- "maxxed out the free limit when I only have one board" — https://community.miro.com/ask-the-community-45/incorrectly-locking-boards-because-it-says-i-ve-maxxed-out-the-free-limit-when-i-only-have-one-board-28368
- "Three boards just aren't enough for an active team" — Nuclino alternatives roundup https://www.nuclino.com/alternatives/miro-alternative
- Lost content on Free, no rollback — https://community.miro.com/ask-the-community-45/lost-board-content-free-plan-25830 ; "Miro diagram feature destroyed my board" https://community.miro.com/ask-the-community-45/miro-diagram-feature-destroyed-my-board-24910 ; can't restore pre-upgrade versions https://community.miro.com/ask-the-community-45/may-i-get-an-access-to-board-history-versions-which-were-created-before-buying-business-upgrade-7156
- Education plan still capped — https://community.miro.com/ask-the-community-45/education-plan-approved-but-still-limited-to-3-editable-boards-29376

**Who it hurts:** solo designers, students/educators, freelancers evaluating, anyone who loses work.

**How we fix it**
- Free tier limited by **storage / collaborator count, not board count** (e.g., unlimited boards, 1–2 GB assets).
- **Version history + undo-able destructive actions for everyone** (at least 30 days on free). Local-first architecture makes this cheap (CRDT history).
- Data safety is never a paywall: export to open format (JSON + assets zip) on free.

---

### #4 Cluttered UI, feature overload, steep learning curve (esp. one-off workshop guests) — Freq H, Sev S2
**What goes wrong**
- Too many tools/panels/AI entry points; settings hard to find; menus unintuitive; "awkward cursor tools".
- First-time participants in workshops struggle with navigation and get lost on the infinite canvas; facilitators spend session time teaching the tool.
- Facilitators want to lock down tool palettes to introduce one tool at a time.

**Quotes**
- "UI completely cluttered… struggled to find settings" — G2 https://g2.com/products/miro/reviews?page=4
- "can sometimes feel overwhelming due to the large number of features" — https://www.trustradius.com/reviews/miro-2023-05-02-11-48-56 ; "Great features but, in my opinion, poor design" (2026) https://www.trustradius.com/reviews/miro-2026-03-06-17-06-00
- "by far the most difficult part of the workshop is getting them over that first hurdle"; infinite canvas "genuinely overwhelming for… one-off 'workshop' users"; want to "lock half the features" — https://community.miro.com/best-practices-discussions-48/what-are-your-top-tips-for-rapidly-and-smoothly-onboarding-new-participants-in-a-live-workshop-1154
- "Miro Academy is too complicated" — https://community.miro.com/ask-the-community-45/miro-academy-is-too-complicated-5224
- Excalidraw recommended "for anyone who finds Miro far more than they need" — https://www.nuclino.com/alternatives/miro-alternative

**Who it hurts:** guests/viewers, workshop participants, casual users, facilitators.

**How we fix it**
- Minimal default toolbar (select, hand, sticky, text, shape, image, connector, pen) with progressive disclosure; "more" drawer.
- **Facilitator "guest mode" presets**: host chooses which tools guests see (e.g., stickies + vote only), canvas bounds, and a "you are here / return to start" button.
- Command palette (Cmd-K) for power users instead of more chrome.
- 30-second interactive first-run on the guest's first visit, skippable, no account needed.

---

### #5 Guest/viewer access friction (forced sign-in, redirects) — Freq M-H, Sev S1 for client work
**What goes wrong**
- Viewers asked to sign up/sign in even with "anyone with link"; browser-specific redirects (Edge), password screens show "Sign up" and confuse clients; regression in 2023 forcing visitor login broke workflows; guest downloads required sign-in.

**Quotes**
- "Why can't people open my public boards without signing in" — https://community.miro.com/ask-the-community-45/why-can-t-people-open-my-public-boards-without-signing-in-792
- "visitors (aka anyone with the link) being asked to sign in as of July 1" — https://community.miro.com/ask-the-community-45/investigating-visitors-aka-anyone-with-the-link-being-asked-to-sign-in-as-of-july-1-28564
- "boards unable to be shared with non-Miro users without being prompted for log in" — https://community.miro.com/ask-the-community-45/boards-unable-to-be-shared-with-non-miro-users-without-being-prompted-for-log-in-13069
- "I've run into trouble getting editable access for non-users" — Capterra snippet https://www.capterra.com/p/128955/Miro/reviews/?page=11

**Who it hurts:** clients, stakeholders, workshop guests, agencies/freelancers.

**How we fix it**
- Link share = opens instantly, no account, ever, for view/comment; optional name prompt for comments. Editing via link optionally anonymous ("Guest Fox").
- Password/expiry/watermark options without sign-up prompts; no "Sign up" CTA on shared views (or a tiny footer only).
- Lightweight read-only viewer bundle that loads fast on mobile.

---

### #6 Mobile & iPad app weak (crashes, Pencil lag, palm rejection, "web wrapper") — Freq M, Sev S2 (S1 for tablet-first users)
**What goes wrong**
- iPad app freezes on loading screen, constant reloads when others edit, WebView memory limits (Miro's own help says toolbars disappear due to WebView memory limit).
- Apple Pencil: strokes lag, disappear after lift, input stops when hand rests (bad palm rejection); no Procreate-style gestures (two-finger tap undo).
- Android tablets crash when keyboard opens. Magic Keyboard / Cmd-C/V unreliable.

**Quotes**
- "spend more time restarting Miro than I am actually working"; "feels like just a wrapper for their web app"; wants "two-finger tap to undo as found in procreate" — https://www.trustradius.com/reviews/miro-2023-09-26-14-31-32 , https://justuseapp.com/en/app/1180074773/miro-online-whiteboard-canvas/reviews
- "the lines lag behind the pencil unless I draw very slowly" — https://community.miro.com/ask-the-community-45/laggy-on-m1-ipad-8466
- "writing disappears immediately after lifting pen" — https://community.miro.com/ask-the-community-45/apple-pencil-pro-issue-writing-disappears-immediately-after-lifting-pen-in-miro-20377
- Pen tool freezes on new iPad (2026) — https://community.miro.com/ask-the-community-45/bug-writing-on-new-ipad-both-apple-pencil-and-logi-pen-freeze-on-writing-with-pen-tool-28785
- "fix bugs / improve performance on the iPad app" idea — https://community.miro.com/ideas/fix-bugs-improve-performance-on-the-ipad-app-28665 ; "Miro on iPad: key areas for enhancement" https://community.miro.com/ideas/miro-on-ipad-key-areas-for-enhancement-14824
- Android tablet crash on keyboard — https://community.miro.com/ask-the-community-45/miro-crashes-on-android-tablet-14795
- WebView memory limit — https://help.miro.com/hc/articles/360021113559
- "weak mobile app" — https://storyflow.so/blog/best-concept-art-board-tools-2026

**Who it hurts:** mobile users, iPad sketchers/designers, facilitators on tablets, viewers on phones.

**How we fix it**
- PWA first with a **pointer-events pipeline tuned for Pencil** (coalesced + predicted events, `pointerType==='pen'` → draw, touch → pan when pen active = palm rejection), low-latency ink layer (separate canvas, desynchronized context).
- Gestures: two-finger tap undo, three-finger redo, pinch zoom, two-finger pan.
- Phone: explicit "view & comment" mode optimized for small screens (frame-by-frame navigation, comment pins) rather than full editor.
- Memory caps via the image pyramid (#1) so tablets don't hit WebView limits.

---

### #7 Export quality (blurry PDFs/PNGs, size limits, hangs) — Freq M, Sev S2 (S1 for designers/print)
**What goes wrong**
- "Small file size" PDF is too low-res; "Best quality" is huge or never finishes; embedded PDFs are rasterized ("exported as pictures… pixel blur"); September 2024 regression lowered imported-PDF resolution; "Copy as image" capped ~1000px; whole-board export unreadable; Miro advises exporting frame by frame and stitching externally; Free plan export restricted; emojis vanish in best-quality PDF.

**Quotes**
- "'small file size' has insufficient image quality… 'best quality' creates a PDF that is huge" — https://community.miro.com/developer-platform-and-apis-57/best-quality-pdf-exports-are-low-res-16806
- "pdf documents will be exported as pictures and can be displayed with pixel blur" (staff) — https://community.miro.com/ask-the-community-45/pdf-embedded-in-board-is-low-quality-when-exported-from-frame-4724
- "the resolution has dropped significantly" (Sept 2024) — https://community.miro.com/ideas/bring-back-the-previous-pdf-import-resolution-before-september-2024-update-18697
- "Copy as Image now lowers the resolution to ~1000px" — https://community.miro.com/ask-the-community-45/copy-as-image-resolution-issues-18996
- "printing text is soft not crisp" — https://community.miro.com/ask-the-community-45/printing-text-is-soft-not-crisp-8483 ; best quality never completes https://community.miro.com/ask-the-community-45/export-to-pdf-best-quality-does-not-work-14432
- Official: divide into frames and export each — https://help.miro.com/hc/articles/360020567820-Board-export-issues

**Who it hurts:** designers delivering moodboards, consultants sending workshop outputs, educators printing.

**How we fix it**
- **True vector PDF/SVG export** (text as text with embedded fonts, shapes as vectors, images at original resolution, embedded PDFs passed through as vector pages).
- PNG export with explicit DPI/scale (1×–4×) and transparent background; per-frame batch export to multi-page PDF; "export selection".
- Server-side export worker (headless renderer) so large exports don't crash the tab; progress + email link.
- "Copy as image" at selectable scale; copy as SVG.

---

### #8 Connectors/arrows and snapping fight the user — Freq M, Sev S2
**What goes wrong**
- Lines auto-snap/connect to nearby objects/images when you just want to draw; no persistent off switch (only hold Cmd/Ctrl). Shift-for-straight fails once snapped. Kinked arrows. Autorouting "worst-in-class", no jump crossings. Connectors break or re-point after copy/move/drag-drop of images; line weights randomly shrink; connectors move "from one day to the next".
- Objects snapping to grid/alignment unexpectedly (a 2024 change made objects snap during movement); frames jumping.

**Quotes**
- "I just came to rage about arrows" — https://community.miro.com/ask-the-community-45/i-just-came-to-rage-about-arrows-5465
- "be able to turn off the automatic connection lines" — https://community.miro.com/ideas/be-able-to-turn-off-the-automatic-connection-lines-6787 ; "disable autosnap of lines and arrows to images" (2026) https://community.miro.com/ideas/disable-autosnap-of-lines-and-arrows-to-images-27435
- "unkink kinked arrows" — https://community.miro.com/ideas/unkink-kinked-arrows-9957 ; autorouting idea https://community.miro.com/ideas/autorouting-of-connectors-9758
- "when an image is drag dropped all arrows and end points… got broken" — https://community.miro.com/ask-the-community-45/bug-report-when-an-image-is-drag-dropped-all-arrows-and-end-points-on-the-diagram-got-broken-17176
- "connector lines move from one day to the next" — https://community.miro.com/ask-the-community-45/connector-lines-move-from-one-day-to-the-next-23733
- "everything is snapping to the grid" — https://community.miro.com/ask-the-community-45/everything-is-snapping-to-the-grid-16470 ; "frames jumping or moving unexpectedly" https://community.miro.com/ask-the-community-45/frames-jumping-or-moving-unexpectedly-how-do-you-handle-it-25403

**Who it hurts:** diagrammers, PMs, facilitators; moodboard users annotating images (arrows snapping onto images).

**How we fix it**
- Snapping toggles in a visible place (toolbar magnet icon, persisted per user): object snap, grid snap, connector-attach, each separately; Alt/Cmd temporarily inverts.
- Connector attach only when releasing over an explicit anchor dot/edge highlight (clear affordance), never just "near".
- Orthogonal router with obstacle avoidance (e.g., libavoid-style) + manual waypoints that persist; straight/elbow/curve modes; line jumps optional.
- Deterministic connector geometry stored in document (no client-side re-layout drift).

---

### #9 Text: limited formatting, sticky auto-size chaos, fonts — Freq M, Sev S2
**What goes wrong**
- No line-spacing control (thread open since 2020, still active 2025), no mixed sizes/fonts within one text box, bullets limited outside text objects.
- Sticky-note auto font size: inconsistent sizes across notes created at different zooms; text cut off; words split mid-word; font field shows stale value after resize; users want a fixed default.
- Custom fonts only via Brand Center (Business+/beta, max 10 fonts); boards moved to another org revert to Open Sans; limited font library.

**Quotes**
- Line spacing — https://community.miro.com/ideas/line-spacing-adjustments-2739 ; "why we are moving to figma for this" — https://community.miro.com/ideas/we-need-custom-fonts-and-better-text-control-hot-diggedy-damn-11919
- "multiple font sizes/fonts in a single text box" — https://community.miro.com/ideas/multiple-font-sizes-fonts-in-a-single-text-box-7817 ; rich text editor https://community.miro.com/ideas/a-text-object-with-rich-text-editor-25203
- "words split in odd places" — https://community.miro.com/ask-the-community-45/sticky-note-text-wrapping-9981 ; text cut off https://community.miro.com/ask-the-community-45/text-is-being-cut-off-on-post-its-and-inside-shapes-17172 ; "why are font sizes inconsistent in sticky notes" https://community.miro.com/ask-the-community-45/why-are-font-sizes-inconsistent-in-sticky-notes-781 ; "keep the text as large as possible" https://community.miro.com/ideas/keep-the-text-as-large-as-possible-13232
- Custom fonts — https://community.miro.com/ideas/add-custom-typeface-font-64 ; "since they don't allow custom fonts using Miro to present to clients often is a no-go" (presentation thread, see #12)

**Who it hurts:** designers (brand typography), facilitators (readability of stickies at a glance), anyone making docs on the board.

**How we fix it**
- Proper rich-text engine (ProseMirror/Lexical-style) inside every text-bearing object: per-run font/size/weight/colour, line-height, paragraph spacing, lists, links, headings.
- Sticky font modes: **Auto-fit (uniform across selection)**, **Fixed size**, user default; "equalize font size" action for a selection; never split words.
- Full Google Fonts + upload custom fonts on all paid tiers; fonts travel with board export.

---

### #10 Navigation: trackpad/mouse zoom-pan modes confusing, no sensitivity control — Freq M, Sev S2
**What goes wrong**
- "Auto-switch" between mouse/trackpad mis-detects and flips between scroll-to-pan and scroll-to-zoom mid-session; no zoom sensitivity setting (too aggressive on Linux); pinch-zoom stops working on macOS; scroll-to-pan with a mouse requires choosing "Trackpad" mode.

**Quotes**
- "randomly going from zooming to scrolling with my mouse wheel" — https://community.miro.com/ask-the-community-45/i-m-randomly-going-from-zooming-to-scrolling-with-my-mouse-wheel-what-s-going-on-19067
- "is there any way to make Miro follow conventional scrolling controls" — https://community.miro.com/ask-the-community-45/is-there-any-way-to-make-miro-follow-conventional-scrolling-controls-26336
- "zoom and panning oversensitive with trackpad" — https://community.miro.com/ask-the-community-45/zoom-and-panning-oversensitive-with-trackpad-1411 ; zoom sensitivity request (2026) https://community.miro.com/ideas/request-usability-issues-zoom-sensitivity-mouse-navigation-default-text-styles-29215
- "anyone else finding the navigation modes confusing" — https://community.miro.com/ask-the-community-45/anyone-else-finding-the-navigation-modes-confusing-3944

**Who it hurts:** everyone, worst for new guests and Linux/Windows mouse users.

**How we fix it**
- Follow Figma conventions by default: trackpad two-finger = pan, pinch = zoom; mouse wheel = pan vertical, Shift+wheel = horizontal, Ctrl/Cmd+wheel = zoom. Detect device per-event using `deltaMode`/delta magnitude heuristics, but **let user pin a mode** in a one-click toggle.
- Zoom sensitivity slider; zoom-to-cursor; smooth inertia; "zoom to fit / selection / 100%" shortcuts.

---

### #11 Board organisation & search — Freq M, Sev S2 (S1 at org scale)
**What goes wrong**
- No nested folders; Spaces + one level of Sections only, sections invisible on main dashboard; a 300-person team: "impossible to organize the boards so people can find them"; board-name length limits.
- Full-text search across boards historically Enterprise-only; dashboard search misses words present on boards; in-board find has no replace (third-party apps fill gap); can't search image names.

**Quotes**
- "folders/directories in projects" (long-running) — https://community.miro.com/ideas/folders-directories-in-projects-395 ; nested sections "2 levels minimum" https://community.miro.com/ideas/support-for-nested-sections-within-a-space-2-levels-minimum-23171 ; sections on dashboard (Jan 2026) https://community.miro.com/ideas/view-sections-in-the-main-dashboard-subfolders-within-a-space-23614
- "only the Enterprise plan customers can search for any text across all boards" — https://community.miro.com/ask-the-community-45/search-board-content-9452
- "can't sometimes find text I search for using the advanced search" — https://community.miro.com/ask-the-community-45/can-t-sometime-find-text-i-search-for-using-the-advanced-search-on-the-dashboard-20919
- Find & replace idea — https://community.miro.com/ideas/find-replace-text-422/index3.html ; unable to search image names https://community.miro.com/developer-platform-and-apis-57/unable-to-search-image-names-8510
- "nearly impossible to search across many boards when used as documentation" — AWS Marketplace reviews https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-wky5ywoz3bxay?page=61

**Who it hurts:** teams, PMs, researchers with repositories, agencies with many client boards.

**How we fix it**
- Nested folders (unlimited depth) + tags + favourites + "recent"; boards can live in multiple collections (tags) without duplication.
- Global full-text search (all tiers) across text, sticky content, comments, image filenames, alt text, OCR on images and PDFs; result opens board and **jumps/zooms to the object** with term highlighted.
- In-board find & replace; filter by type/author/colour/tag.
- Optional semantic/visual search ("find images similar to this") — strong for moodboards.

---

### #12 Presentation mode & presenting to clients — Freq M, Sev S2 (S1 for client-facing designers)
**What goes wrong**
- Frames don't fill screen; grey background, frame titles and toolbars visible; smooth panning transitions removed; "You are presenting" banner; video playback in fullscreen buggy; AI sidekick popping up during client presentations; no custom fonts → off-brand.

**Quotes**
- "full screen no longer maximizes my frames (as slide) with a clean, black background and no toolbars" — https://community.miro.com/ask-the-community-45/full-screen-mode-no-longer-available-12366
- "please bring back legacy smooth transitions/panning" (2026) — https://community.miro.com/ideas/please-bring-back-legacy-smooth-transitions-panning-in-presentation-mode-28391
- "a client just declined my request to present in Miro"; "prevents me from recommending this to my clients" — https://community.miro.com/ask-the-community-45/presentation-mode-full-screen-frames-not-displaying-correctly-6012
- Sidekick popping up "every single time… genuinely risky when I'm presenting to clients" — https://community.miro.com/ask-the-community-45/turn-off-sidekick-27002
- Hide toolbars request — https://community.miro.com/ideas/setting-to-hide-toolbars-in-presentation-mode-15656

**Who it hurts:** designers/agencies, consultants, facilitators, educators.

**How we fix it**
- Clean presentation: frames as slides, letterboxed on chosen background colour, zero chrome, smooth (toggleable) camera transitions, Prezi-style zoom paths, speaker notes, presenter view on second screen, follow-me for remote viewers.
- **Client share link "Present / Review" mode** (see moodboard section).
- Global "quiet mode": no AI popups, tips, or upsell banners while presenting or sharing.

---

### #13 No offline mode — Freq M (long-standing), Sev S1 for travellers/secure orgs
**What goes wrong**
- Desktop app is not functional offline; Miro help said offline "not on our radar" given cloud architecture; moderator (June 2024) confirmed none. Blocks adoption at some companies.

**Quotes**
- Offline mode idea (9+ pages) — https://community.miro.com/ideas/offline-mode-925
- "having trouble pitching Miro at our company because offline connectivity is a requirement" — https://community.miro.com/ideas/offline-mode-925/index2.html
- "desktop app is not functional offline" — https://community.miro.com/ask-the-community-45/how-to-access-miro-boards-offline-in-airplane-mode-878
- "working offline is not well-supported" — AWS Marketplace reviews (above)

**Who it hurts:** solo designers, travellers, field researchers, regulated orgs.

**How we fix it**
- **Local-first architecture** (CRDT doc + IndexedDB/OPFS asset cache) → full offline editing of recent/starred boards, automatic merge on reconnect, clear sync status indicator. This is also our perf and version-history foundation — a strong differentiator.

---

### #14 Copy/paste between boards and apps is unreliable — Freq M-L, Sev S2
**What goes wrong**
- Images (only images) fail to paste between boards; text loses colour/size; some connectors break; "objects are on a different server instance and couldn't be pasted"; images lose resolution on cross-board paste; desktop app vs browser differences.

**Quotes**
- "can't copy images and only images from one board to another" — https://community.miro.com/ask-the-community-45/can-t-copy-images-and-only-images-from-one-board-to-another-12172
- "copy and paste seems to be completely broken in this app" — https://community.miro.com/ask-the-community-45/copy-and-paste-seems-to-be-completely-broken-in-this-app-27738
- "some objects are on a different server instance and couldn't be pasted" — https://community.miro.com/ask-the-community-45/copy-paste-error-some-objects-are-on-a-different-server-instance-and-couldn-t-be-pasted-7856
- "images lose resolution when copying from a Miro board and pasting into a new board" — https://community.miro.com/ask-the-community-45/images-lose-resolution-when-copying-from-a-miro-board-and-pasting-into-a-new-board-17952
- Copy/paste problems between boards (2026) — https://community.miro.com/ask-the-community-45/copy-paste-problems-between-boards-29330

**How we fix it**
- Clipboard payload = self-contained JSON (with content-addressed asset hashes) + HTML + PNG fallbacks; assets are deduped globally so cross-board paste is instant and lossless. Paste from Figma/Google Docs/web keeps formatting where possible; paste URL → rich link/image.

---

### #15 Images/moodboard tooling is basic (see section 3) — Freq M among designers, Sev S2

### #16 AI pushed into the UI; privacy ambiguity — Freq L-M (rising), Sev S2/S3
**What goes wrong**
- Sidekicks/AI prompts pop up unrequested; no obvious global "turn off all AI" switch for Starter users. Policy: Miro says it doesn't train on customer data, but since 2025-02-03 collects Free-plan AI interaction data (admin can disable); AI runs on Azure; separate AI addendum confuses users with sensitive boards.

**Quotes/sources**
- "switch off all AI features" (Jan 2026) — https://community.miro.com/ask-the-community-45/switch-off-all-ai-features-27140
- Sidekick pop-ups — https://community.miro.com/ask-the-community-45/turn-off-sidekick-27002
- Free-plan AI data collection, Azure — https://help.miro.com/hc/en-us/articles/11277533556626-Miro-AI-Admin-security ; policy analysis https://conductatlas.com/platform/miro/miro-privacy-policy/ai-feature-training-data-use/
- Trustpilot: AI features "haven't been quite useful" — https://uk.trustpilot.com/review/miro.com

**How we fix it**
- AI is opt-in, invoked (Cmd-K / right-click), never ambient; one switch at workspace and user level; plain-language "we never train on your boards" commitment; per-board "no AI" flag for sensitive content; option for EU data residency.

### #17 Version history & data loss — merged into #3 (paywall) but note: users also report features (diagramming/auto-layout) **rearranging/destroying boards** with no free rollback. Fix: universal undo history + time-travel slider + per-object history.

### #18 Ownership uncertainty (Bending Spoons) — emerging, Sev S2 for buyers
Fear of price hikes / cuts post-acquisition. Fix: market data portability (open format export, Miro import tool) and pricing commitments.

---

## 2. What users LOVE about Miro (keep these)

1. **Real-time multiplayer that "just works"** — live cursors, instant sync across time zones; G2 AI summary: users "consistently praise Miro for its ease of use and real-time collaboration". https://www.g2.com/products/miro/reviews_and_filters
2. **Infinite canvas** — freedom of space, new team members pick it up quickly (G2, Lead Quality Engineer). https://g2.com/products/miro/reviews?page=4
3. **Huge template library** (7,000+ incl. Miroverse community templates) — "biggest time-saver"; retros, journey maps, story maps, workshops. https://hackceleration.com/labs/review/miro
4. **Basic tools are easy** — sticky notes, shapes, drag-and-drop; "basic features are easy to learn". Stickies + navigation are the core.
5. **Facilitation toolkit** — timer, voting, private mode, follow-me/bring everyone to me, attention management, locking objects, frames as agenda.
6. **All-in-one breadth** — diagrams, retros, mind maps, planning, docs on one surface ("a bit bloated, but it was ok" — HN).
7. **Integrations** — Jira, Confluence, Slack, Teams, Zoom, Google Drive, Figma embeds; AWS/Azure diagram libs.
8. **Comments on objects/frames** + @mentions.
9. **Cross-platform availability** (web, desktop, iPad, Android) — even if quality varies.
10. **Frames** as structural unit for presenting/exporting.

Takeaway: we must match the *core loop* (instant multiplayer, sticky/shape/text/connector, frames, comments, templates, facilitation basics) before differentiating.

---

## 3. Moodboard / designer-specific complaints

| Problem | Evidence | Our fix |
|---|---|---|
| **Image resolution/blur on canvas** — low-res placeholders until deep zoom; aliasing when zoomed out; blur after zoom (Safari); images lose resolution on copy | https://community.miro.com/ask-the-community-45/image-aliasing-5555 ; https://community.miro.com/ask-the-community-45/blurry-images-1794 ; https://community.miro.com/ask-the-community-45/blurred-image-27727 (Apr 2026) | Mip-pyramid + DPR-aware tier selection, high-quality downscaling (Lanczos on server, trilinear mipmaps in GPU), never serve a lower tier than on-screen pixels once loaded. |
| **32 MP / 8192×4096 upload limits**, and conversely huge phone photos bloat boards | https://community.miro.com/ideas/automatically-reduce-the-resolution-of-images-over-32-megapixels-1599 ; https://community.miro.com/ideas/idea-support-larger-image-uploads-on-miro-boards-25336 ; marketplace app exists just for >8192px https://pm-tools.miro.com/marketplace/large-image-upload | Accept large originals (store original, render tiles/pyramid), so both "too big" and "too heavy" disappear. |
| **Colour accuracy / compression** — staff admitted "slight compression or changing of colors" | https://community.miro.com/ask-the-community-45/uploading-photos-color-accuracy-3609 | Preserve ICC profiles; convert to sRGB/Display-P3 correctly for display; keep original bytes for download/export. |
| **Cropping limited** — preset masks (circle, square, landscape, portrait, wide) + rectangular freehand; no rounded-rect, custom shape masks, or non-destructive re-crop via API; crop not respected for some viewers | https://community.miro.com/ideas/create-a-mask-with-a-shape-739 ; https://community.miro.com/ideas/new-image-features-freehand-crop-and-drawing-tools-15046 ; https://community.miro.com/developer-platform-and-apis-57/images-render-incorrectly-for-viewers-original-size-and-uncropped-versions-28731 ; https://community.miro.com/developer-platform-and-apis-57/crop-api-28449 | Non-destructive crop with aspect presets, corner radius, any-shape mask (drag image into shape), double-click to re-crop, crop data in document model (consistent for all clients, API-accessible). |
| **No image editing** — no basic adjustments, background removal, flip etc. | https://community.miro.com/ideas/image-editing-reimagined-7591 ; https://community.miro.com/ask-the-community-45/advanced-image-editing-functionality-15671 | Lightweight non-destructive adjustments (exposure, contrast, saturation, B&W, flip/rotate, opacity), one-click background removal (on-device model). |
| **Layout tools weak** — no masonry/mosaic; image array leaves "massive spaces… tiny thumbnails"; requests for row/grid alignment for images; sticky "clean up" | https://community.miro.com/ask-the-community-45/adding-multiple-images-auto-array-creates-wide-spaces-3020 ; https://community.miro.com/ideas/enhanced-alignment-tools-rows-and-grids-for-images-10767 ; https://community.miro.com/ideas/clean-up-stickies-10584 ; https://community.miro.com/ask-the-community-45/resize-multiple-images-to-be-the-same-size-5101 | "Arrange" menu: masonry (by column count / gutter), justified rows (equal height), grid, collage; match width/height; equalize spacing with exact gutter value; Figma-style auto-layout containers; smart drop of N images into a tidy grid. |
| **Colour palettes** — no palette extraction from images; custom palette list gets long; forced "Brand colors" default; palette-generation requests (Coolors-like) | https://community.miro.com/ideas/color-palette-management-1358 ; https://community.miro.com/ask-the-community-45/the-old-colors-are-gone-20705 ; https://community.miro.com/ideas/observations-and-opportunities-on-styles-brand-center-and-color-15555 ; Miro's palette tool lives on a separate marketing page https://miro.com/tools/color-picker/ | Right-click image → "Extract palette" (k-means 5–8 swatches as editable swatch objects with HEX/RGB/OKLCH labels); board-level palettes; eyedropper anywhere; copy-hex on click; palette export (ASE, CSS vars, JSON). |
| **Fonts/typography** — custom fonts only via Brand Center; text controls weak (see #9) | https://community.miro.com/ideas/upload-custom-custom-brand-fonts-8258 | Google Fonts + uploads; type specimens as objects. |
| **Presenting moodboards to clients** — chrome-heavy presentation, client login prompts, AI popups, no clean background, can't use brand fonts → "client just declined my request to present in Miro" | See #5, #12 | **Client Review link**: chrome-free, no login, branded (logo/colours), frame-by-frame or free-pan, per-image reactions/approve/"favourite", pinned comments, optional password/expiry, download-originals toggle. |
| **Aesthetics** — Miro is "functional" vs Milanote "aesthetic"; designers choose Milanote/PureRef for moodboards, Miro for workshops | https://fabric.so/comparison/miro-vs-milanote ; https://mockflow.com/blog/miro-vs-milanote ; https://storyflow.so/blog/best-concept-art-board-tools-2026 ; https://www.cgchannel.com/2026/08/artdeck-is-a-new-alternative-to-pureref-that-supports-video/ | Calm visual design, no default drop shadows/frame titles (users asked to turn these off: https://community.miro.com/ideas/global-switch-to-turn-off-frame-borders-shadows-and-titles-frames-without-shadow-1600), dark canvas option, borderless image-first mode. |
| **Reference workflows (PureRef-style)** — always-on-top, quick drop of many images, flip, grayscale view, GIF/video | PureRef/ArtDeck sources above | Desktop wrapper "pin board on top" mini-view; grayscale/flip view toggles for value studies; video/GIF on canvas with lazy playback. |
| **Capture** — getting images from web/Pinterest | (moodboard templates rely on drag/upload/integrations: https://miro.com/moodboard/how-to-make-a-moodboard/) | Browser extension to send images (with source URL attribution) to a board; paste URL → fetch og:image; Pinterest/Are.na/Dribbble import. |

---

## 4. Summary table: top pain points → our fix

| Rank | Pain point | Sev | Main victims | Our fix (one line) |
|---|---|---|---|---|
| 1 | Lag/slow load on large & image-heavy boards | S1 | facilitators, designers, teams | GPU renderer + culling + image mip-pyramid + region-scoped CRDT sync; perf budget & board-health panel |
| 2 | Surprise guest seats, auto-renew, hard cancel, no support | S1 | admins, agencies | Free unlimited viewers/commenters; confirm before any billable seat; 1-click cancel; humane support |
| 3 | Free plan 3-board cap; version history paywalled | S1 | solo, students, freelancers | Limit by storage not boards; free 30-day history; free open-format export |
| 4 | Cluttered UI / learning curve | S2 | guests, casual users | Minimal toolbar, progressive disclosure, facilitator tool presets, Cmd-K |
| 5 | Guest login friction | S1 (client work) | clients, workshop guests | No-account view/comment/edit links; no sign-up CTAs on shares |
| 6 | Weak iPad/mobile | S2 | tablet & phone users | Pencil-grade ink pipeline, palm rejection, gestures; phone review mode |
| 7 | Blurry/limited export | S2 | designers, consultants | True vector PDF/SVG, DPI-selectable PNG, server-side batch export |
| 8 | Connector & snapping fights | S2 | diagrammers | Visible snap toggles, explicit anchors, real orthogonal router, stable geometry |
| 9 | Text formatting / sticky auto-size / fonts | S2 | designers, facilitators | Rich text everywhere, uniform/fixed sticky font modes, Google + custom fonts |
| 10 | Zoom/pan mode confusion | S2 | everyone | Figma-like defaults, pin-able mode, sensitivity slider |
| 11 | No folders / weak cross-board search | S2 | teams | Nested folders + tags, global full-text + OCR search on all plans, jump-to-object |
| 12 | Presentation mode | S2 | designers, consultants | Chrome-free slides from frames, smooth transitions, presenter view, client review link |
| 13 | No offline | S1 (some) | travellers, regulated orgs | Local-first CRDT with offline editing & merge |
| 14 | Copy/paste between boards | S2 | power users | Self-contained clipboard payload with content-addressed assets |
| 15 | Basic image/moodboard tooling | S2 | designers | Masonry/justified layouts, non-destructive crop/mask, palette extraction, adjustments |
| 16 | AI forced / privacy | S2-S3 | privacy-conscious, presenters | Opt-in AI, global off switch, no-training pledge |

## Source index (main hubs)
- Miro Community forum (primary granular evidence): https://community.miro.com/
- G2 (blocked; snippets): https://www.g2.com/products/miro/reviews
- Capterra (blocked; snippets): https://www.capterra.com/p/128955/Miro/reviews/
- TrustRadius (blocked; snippets): https://www.trustradius.com/reviews/miro-2026-03-06-17-06-00
- Trustpilot (blocked; snippets): https://uk.trustpilot.com/review/miro.com
- AWS Marketplace reviews: https://aws.amazon.com/marketplace/reviews/reviews-list/prodview-wky5ywoz3bxay
- App reviews: https://justuseapp.com/en/app/1180074773/miro-online-whiteboard-canvas/reviews ; https://www.onclarity.com/leaderboard/insight/miro (aggregator, weak)
- Pricing trackers: https://pricingsaas.com/companies/miro
- Acquisition: https://www.reworked.co/collaboration-productivity/bending-spoons-acquires-miro-for-136b/
- Alternatives context: https://tldraw.dev/blog/product/miro-vs-tldraw ; https://www.nuclino.com/alternatives/miro-alternative ; https://fabric.so/comparison/miro-vs-milanote
