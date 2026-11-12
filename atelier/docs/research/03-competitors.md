# 03 — Competitor analysis: infinite-canvas whiteboard / moodboard apps (state as of Nov 2026)

Goal: learn from competitors before building a Miro-like infinite canvas aimed at a graphic designer / creative director who makes a lot of visual moodboards. For each area: who does it best, what to copy, and what nobody does well yet.

## Method and reliability notes

- **Research date:** 2026-11-12. All research was done with WebSearch. **WebFetch was blocked for every host** (DNS failed in this sandbox for milanote.com, plus.excalidraw.com, tldraw.dev and figma.com), so no vendor page was read directly. Facts come from search snippets of vendor help centres and blogs, the press, and review aggregators (G2, Capterra, GetApp, toolradar, costbench).
- **Pricing is the weakest data.** Aggregators often disagree, sometimes because of annual vs monthly billing. Check prices on the vendor pages before quoting them anywhere.
- **Confidence tags used below:**
  - **[src]**: backed by a cited source.
  - **[pk]**: prior knowledge from before this session, not re-checked against a source. Treat it as likely but unverified.
  - **[?]**: the sources conflict or are unclear.

---

## Part A — Competitor profiles

### Miro (baseline)
- **Positioning:** an enterprise "AI Innovation Workspace". The Canvas 25 event (Oct 2025) launched AI **Sidekicks** (task-specific conversational agents), **Flows** (multi-step AI workflows that live on the canvas), **Miro Insights** (customer feedback pulled from CRM, calls and tickets) and **Miro Specs** (board content turned into specs for AI coding tools) [src: Miro Oct 2025 blog/newsroom]. AI runs on credits per plan, and add-on credits can be bought [src: miro.com/pricing].
- **Pricing:** Free gives 3 editable boards and unlimited viewers. Starter is about $8–10 and Business about $16–25 per member per month (annual vs monthly unclear) [src/?]. Anonymous visitors on public boards need Starter or Business [src]. Password-protected public links exist on paid team plans [src: Miro community changelog].
- **Strengths [pk]:** the broadest template and integration ecosystem, frames with presentation mode, Talktrack (recorded video walkthroughs of a board), smart diagramming, and a strong admin/enterprise layer.
- **Moodboard pain points (important for us):**
  - Image-heavy boards lag. One moodboard user with about 3,000 images and another with about 1,300 objects reported heavy lag [src: Miro community].
  - Images stay blurry or low-res until you zoom far in, and reach full quality only after "a couple of seconds" [src: Miro community, Findstack].
  - Aliasing when zoomed out [src].
  - No in-app downsampling, so users pre-shrink files with PowerToys Image Resizer and have asked for a "downsample selected images" button [src].
  - The SDK does not expose image data, so plugins cannot fix any of this [src].
- **How they think:** a horizontal platform for every team and workshop; breadth beats craft.

### FigJam (Figma)
- **Positioning:** a playful whiteboard next to Figma for design teams, cheap per seat (collab seat around $3–5 per month [?]).
- **Signature features:**
  - **Stamps** (permanent) vs **emotes** (temporary), a stamp wheel and **high-fives** [src: Figma help].
  - Cursor chat and audio [src].
  - A shared **timer with music**: max 99:59, one per file, a shared track, and each user controls their own volume [src: Figma help].
  - **Widgets** (community mini-apps) and plugins [src].
  - **Open sessions:** anyone can join for 24 h without an account, the host can end it early, the host needs a paid plan, and visitors cannot comment or use audio [src: Figma help].
  - FigJam AI: generate boards and diagrams from prompts, sort and cluster stickies, summarize. **Jambot** turns a board into a slide-deck outline [src].
- **Related Figma moves:** Figma Make (May 2025, prompt to prototype) [src]. **Figma Weave** (acquired Weavy, late 2025) is a browser **node-based AI media canvas**: put several models side by side (Flux, Ideogram, Nano-Banana, Seedream, Veo, Sora…), then **branch, remix and refine** outputs [src: Figma blog, TechCrunch, Fast Company]. Weave is still separate from Figma, with its own credits [src].
- **Complaints:** AI clustering is sometimes odd [src]. FigJam is weak as an image/moodboard tool [pk].
- **How they think:** delight and low friction (stamps, music, high-fives), and the jam is a prelude to work in Figma.

### Mural
- **Positioning:** facilitation-first workshop canvas.
- **Features:**
  - Timer, dot voting, **private mode** (people work hidden, then reveal, to reduce groupthink), **summon** (pull everyone to the facilitator's view) and laser pointer [src].
  - Outline/presentation of areas [pk].
- **Pricing:** Team+ about $9.99–12 per seat; Business about $17.99 after a Feb 2026 price rise [src/?]. Guests and visitors never take a paid seat [src]. The free tier has 3 murals and unlimited view-only visitors [src].
- **AI:** generate ideas, cluster stickies, diagrams from prompts; Mermaid "coming soon" as of mid-2026 [src].
- **How they think:** run the meeting well; the canvas exists to serve the session.

### Milanote (the moodboard benchmark)
- **Positioning:** "organize creative projects visually" for designers, writers, filmmakers and art directors. Reviewers call it the **most polished-looking** board (spacing, typography, how images sit on the canvas) [src: Fabric comparisons].
- **Signature features:**
  - **Nested boards:** a board is a card that opens into another board, like folders [src].
  - **Columns:** drag cards in and reorder them. A column cannot contain another column, but boards and docs can sit inside a column [src: help.milanote.com].
  - **Web clipper** for Chrome/Safari/Opera. Clips land in an **"Unsorted" column** to be triaged later [src].
  - Mobile apps send photos, notes and video straight to boards [src].
  - Built-in **free image search** (3M photos, powered by Pexels) for dragging stock onto the board [src].
  - **Colour swatch card** [src].
  - 100+ templates, including fashion/film/UI/photography moodboards [src].
- **Sharing (best-in-class for clients):**
  - Read-only link, with no account needed to view [src].
  - **Password** on the link [src].
  - Toggle "allow comments, reactions & drawing" (commenters need an account) [src].
  - **Welcome message** for viewers [src].
  - HTML **embed** of the board (read-only) [src].
- **Export:** PDF Standard/Large, PNG, Word, Markdown and text. PDF/PNG export is limited to a single page. **"Generate ZIP"** downloads every image and file on a board [src].
- **Pricing:** Free gives 100 cards and 10 uploads with unlimited shared boards. Pro is about $9.99/mo annual or $12.50 monthly; a Team tier exists [src/?].
- **Complaints:** no real offline mode (the biggest complaint), weak search on big projects, wishes for better export and comments, and no AI [src].
- **How they think:** opinionated, calm and print-like; structure (columns, nested boards) over freeform chaos; built for one creative person curating and presenting.

### Whimsical
- **Positioning:** fast, beautiful flowcharts, wireframes, mind maps and docs.
- **AI:** text to flowchart, mind map and editable **wireframes/wireflows**, plus a Whimsical Agent that answers questions about the workspace [src].
- **Sharing:**
  - Link access set to view, comment or edit [src].
  - **Password-protected links** on Pro [src].
  - **Anonymous (no account) commenting and editing** on Pro [src].
  - Free guests [src/?].
- **Pricing:** Pro about $10/editor/mo annual. Free gives 3 team boards, 100 AI actions and guests [src].
- **How they think:** opinionated defaults; everything snaps and aligns automatically, so output always looks clean [pk].

### Lucidspark (Lucid)
- **Facilitation:** **Breakout boards** (small groups work separately, then sync back to the main board), a facilitator panel (timer, voting, laser) [src].
- **AI:** Collaborative AI generates, expands, sorts and summarizes; a **Lucid MCP server** connects boards to ChatGPT, Claude and Copilot [src].
- **Product split:** still separate from Lucidchart (no merge planned), and users complain about switching between them [src].
- **Pricing:** about $9–10/user [?].
- **How they think:** idea → structured diagram → process, all inside one suite.

### Canva Whiteboards
- **Price:** free [src].
- **Features:**
  - **"Expand to whiteboard"** from a presentation, and the reverse: whiteboard → presentation or doc in one click [src].
  - Timer, stickies, follow collaborators, reactions [src].
  - Canva shipped 100+ Visual Suite updates in 2026 [src].
- **Strength for us:** it sits inside a design tool with brand kits, a huge stock library, background removal and Magic Studio AI [pk].
- **How they think:** the whiteboard is one surface in a design suite, and content flows between formats.

### Apple Freeform
- **Price and platforms:** free; iPhone, iPad, Mac and Vision Pro [src].
- **Apple Pencil:** drawing and handwriting. From iOS 18, handwriting is **searchable, translatable and copyable** [src].
- **Scenes (iOS 18):**
  - Save a viewport with its zoom level and jump between saved views [src].
  - Print or **export scenes to PDF**, which works as a presentation [src].
  - Snap to grid and alignment guides [src].
- **Later additions:** tables (iOS 26.2) [src]. Creator Studio (iOS 26.4) added advanced editing tools and a premium content library with AI features (subscription and usage limits) [src].
- **Sharing:** Send Copy, or Collaborate via iCloud link (anyone with the link or invited only, view or edit), up to 100 editors, Follow Along [src].
- **Limits:** collaborators need an Apple ID and a recent OS, so it is useless for clients on Windows or Android [src].
- **How they think:** a native, ink-first, zero-setup personal canvas.

### Excalidraw / Excalidraw+
- **Core app:**
  - Open source (MIT), hand-drawn rough.js style [src].
  - **End-to-end encrypted collaboration:** the key sits in the URL `#fragment`, so the server never sees it [src: Excalidraw blog/GitHub].
  - Autosaves to localStorage (local-first) [src].
  - Read-only share links [src].
  - Shape libraries [src].
  - Embeddable React component [src].
- **Excalidraw+:** about $6/user/mo [src]. Adds cloud storage, workspaces, **presentations** (frames as slides), voice and screenshare, and AI (text-to-diagram) [src/pk]. SOC 2 [src].
- **How they think:** the sketchy style lowers the stakes ("nothing is final"); privacy by default; no sign-up.

### tldraw (tldraw.com, Make Real, Computer, Fairies, tldraw offline)
- **tldraw.com:** a free whiteboard with no account needed; the flagship demo of the SDK [src].
- **Feel:**
  - **Velocity-based arrow snapping:** a fast drag binds to a shape's centre, a slow drag binds precisely, with dot/cross hint markers [src: tldraw release notes].
  - Snapping turns off during fast drags [src].
  - Rebuilt arrows [src].
  - Simplified geometry at low zoom for performance [src].
  - Commentators credit **restraint**: the "machinery never announces itself" and it feels "closer to paper" [src].
- **Experiments:**
  - **Make Real:** sketch → working HTML via an LLM (repo archived Feb 2026) [src].
  - **tldraw Computer:** node-based AI workflows on the canvas (text, image and speech, cyclic flows) [src].
  - **Fairies:** visible AI agents on the canvas with states (thinking/reviewing/working) and a coordinator that delegates [src].
- **tldraw offline (Jul 2026):** free desktop app for Mac/Win/Linux; no account or server; local `.tldraw` files; **LAN multiplayer** where the host runs the sync server; a local HTTP API so coding agents can drive it [src].
- **SDK:** since v4 (Sep 2025), production needs a license key (commercial or free hobby) [src]. Relevant if we build on it.
- **How they think:** canvas as a platform, obsessive interaction polish, AI agents as visible collaborators.

### Muse → renamed **Allume**
- **Platforms:** iPad, iPhone and Mac [src].
- **Model:** nested boards of notes, images, PDFs and links; Apple Pencil; local-first sync [src/?].
- **Pricing:** free tier limited to 100 cards per workspace; Unlimited about $9.99/mo [src/?].
- **How they think:** a spatial "thinking" tool, pen-first, nested zoom, calm and minimal [pk].

### Kosmik
- **Built-in web browser** and **PDF reader** inside the canvas: drag straight from a page or PDF onto the board, with no tab switching [src: TechCrunch].
- **Universes:** infinite canvases that link to each other or nest inside cards [src].
- **AI auto-tagging** by object, subject, **colour**, style and text in images, so you can search the library by colour or content [src].
- **Transclusion:** items dragged from someone's *published* universe stay linked and update when the author changes them [src: Kosmik newsletter].
- **Plans:** free with 3 members per universe; Pro about $11.99–16.99/mo [?]. Desktop (Mac/Win); no real mobile app [src].
- **How they think:** a "commonplace book" / knowledge canvas; content and its source live together.

### Heptabase
- **Cards are real notes** (markdown, backlinks, tags) and **one card can appear on many whiteboards** [src].
- **PDFs:** OCR'd, and highlights become linked cards (2025) [src]. AI actions on cards [src].
- **Public links:** live read-only links (Sep 2025), plus a "can chat" permission so public viewers can message the owner [src: Heptabase support/changelog].
- **Collaboration:** can-view and can-edit whiteboard collaborators [src].
- **Performance:** lags past about 100 heavy cards [src].
- **Pricing:** about $8.99–11.99/mo [?].
- **How they think:** whiteboards are views over a knowledge base, not containers.

### Eraser.io
- Docs plus canvas for engineers [src].
- **Diagram-as-code** together with AI prompt → diagram, editable either way [src].
- Integrations with GitHub, VS Code, Notion and Confluence [src].
- Pro about $10/user [src]. Not relevant to moodboards, but the **dual representation (code ⇄ canvas)** is worth noting.

### AFFiNE (edgeless mode)
- One page can switch between **doc mode** and **edgeless (whiteboard) mode** [src].
- Open source (MIT editor), local-first, self-hostable [src].
- Free for personal use; Pro about $6.75/mo [src/?].
- **How they think:** docs and canvas are the same data shown two ways.

### Notion / Obsidian Canvas
- **Obsidian Canvas:** local `.canvas` files in the **JSON Canvas** open spec (MIT, nodes and edges, z-order by array order), which Kinopio and others also use [src: obsidian.md, jsoncanvas.org].
  - *Lesson:* publish an **open, documented file format** for import/export to build trust.
- **Notion:** still no real native infinite canvas; the sources conflict [src/?].

### Microsoft Whiteboard / Loop
- Legacy (Azure-backed) whiteboards are being retired and deleted in 2026 [src].
- The standalone Windows, iOS and Android apps were deprecated (around Oct–Nov 2026) [src/?].
- Adding PDF/PPT to boards was retired early 2026 [src].
- *Lesson:* platform-risk anxiety is real. "Your boards are yours: export everything, local copy" is a selling point.

### Klaxoon (now "Klaxoon by Wrike")
- Acquired by Wrike (closed Jan 2025) [src]. In 2025 it added an AI assistant in Board and comments [src].
- **A workshop board becomes a structured Wrike project in one click** [src].
- Strong file attach and annotate on the board [src].
- **How they think:** the board is the front-end of work management.

### Conceptboard
- European/GDPR positioning, ISO 27001/27017/27018, German hosting [src/?].
- **Board approval workflow** on the Advanced tier (from €10/user/mo) [src].
- Known for **reviewing and annotating documents and images** [pk].
- *Lesson:* formal approval is a sellable feature, and it fits client moodboard sign-off.

### Ziteboard
- Zoomable tutoring whiteboard [src].
- **Anonymous whiteboard: students join with no account** [src].
- Shape recognition, built-in audio/video, math tools [src].
- White-label API [src].
- About $6.5–8/user [?].

### Moodboard-specific / collection tools

**PureRef 2.x** (Win/mac/Linux):
- Image-only; extremely fast [pk].
- **Always on top**, including "on top of a single chosen app", and **transparent to mouse** (click-through) [src: PureRef handbook].
- Images embedded in a single `.pur` file by default, or linked [src].
- Crop, flip, **grayscale toggle** (value check), rotate/scale reset [src].
- Arrange/normalize helpers [pk].
- Pay-what-you-want for personal use; per-seat commercial license [src].
- No collaboration, no cloud [pk].
- **How they think:** reference stays on top of your working app; zero UI.

**Eagle:**
- Local asset library [src].
- Browser extension (drag, batch collect, full or partial page capture) [src].
- Tags, smart folders [src/pk].
- **Filter by dominant colour** from a palette or picker [src]. Faster colour extraction (Build 22) [src].
- **AI Search (2026):** offline/local reverse-image and natural-language search; images never uploaded [src].
- Plugins, AI Action, MCP server plugin, Web API v2 [src].
- One-time licence about $34.95 [src/?].
- **How they think:** a DAM for creatives; local, private, owned.

**Cosmos.so:**
- Ad-free "calm" Pinterest alternative: **clusters** of images/video/links/notes [src].
- **AI captions and search by keyword, colour or visual similarity** [src]. Claims to find the original artist and source [src].
- Imports Pinterest boards [src].
- Premium tier [src]. Apple "25 apps for 2025" [src].
- **Criticism:** creators can't protect originals, and attribution is murky [src].

**Are.na:**
- **Blocks / Channels / Connections:** one block can live in many channels, and channels connect to each other [src].
- Free plan caps at 200 connections. Premium about $7/mo. Supporter→"Plus Plus" goes $120→150/yr from 1 Dec 2026 [src].
- Public API [src].
- **How they think:** slow, non-algorithmic, research-like collecting; the connection is the unit of value.

**Pinterest:**
- Massive discovery plus visual search [pk].
- Oct 2025 **AI boards:** auto-generated tabs that organize saved Pins, "Boards made for you", and "Styled for you" collages [src].
- Collages ("Shuffles") [src].
- **Downsides for pros:** ads, shopping push, low-res images, no layout freedom, poor client presentation [pk].

**Kive.ai:** AI captions, tags, **dominant colours and a visual-similarity index** on upload, plus an MCP endpoint for agents [src].

**Niice:** client-collaborative moodboards with read-only links, a custom layout engine and DAM features for brand teams [src].

**Figma (for moodboards) [pk]:** designers use frames, auto layout and Figma Slides for client-ready moodboards because of pixel control and type. Downsides: heavy, seat cost, and no web clipper or library.

---

## Part B — Feature matrix (~44 features)

**Legend:**
- ● strong / best-in-class
- ◐ present but basic or limited
- ○ absent
- ? unverified or conflicting

Cells are mostly prior knowledge where Part A has no [src] tag, so verify them before using any cell in marketing.

| # | Feature | Miro | FigJam | Mural | Milanote | Whimsical | Lucidspark | Canva WB | Freeform | Excalidraw(+) | tldraw | Kosmik | Heptabase | PureRef | Eagle |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Canvas** |
| 1 | Infinite canvas, smooth pan/zoom | ● | ● | ◐ | ◐ (bounded feel) | ● | ● | ◐ | ● | ● | ●● (best feel) | ● | ● | ● | ○ (grid lib) |
| 2 | Performance with 1k+ images | ◐ (lag, blur) | ◐ | ◐ | ◐ | ? | ◐ | ◐ | ◐ | ◐ | ● (LOD) | ? | ◐ (>100 cards lag) | ● | ● |
| 3 | Frames / sections | ● | ● sections | ● | ◐ columns | ● | ● | ◐ | ◐ scenes | ● frames | ● frames | ◐ | ● sections | ○ | ○ |
| 4 | Nested boards (board-in-board) | ○ | ○ | ○ | ● | ◐ folders | ○ | ○ | ○ | ○ | ◐ pages | ● | ◐ | ○ | ◐ folders |
| 5 | Columns / auto-stacking lists | ◐ (kanban) | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ◐ | ◐ | ○ | ○ |
| 6 | Smart snapping/alignment | ● | ● | ● | ◐ | ● | ● | ● | ● grid | ◐ | ● velocity | ◐ | ◐ | ◐ | n/a |
| 7 | Saved viewports / bookmarks | ◐ frames | ◐ | ● outline | ○ | ○ | ◐ | ○ | ● scenes | ◐ | ◐ | ? | ◐ | ○ | n/a |
| 8 | Freehand ink / stylus | ◐ | ◐ | ◐ | ◐ sketch | ○ | ◐ | ◐ | ● Pencil | ● | ● | ◐ | ◐ | ○ | ○ |
| **Images / moodboard** |
| 9 | Drag-drop images from web/desktop | ● | ● | ● | ● | ◐ | ◐ | ● | ● | ◐ | ● | ● | ◐ | ● | ● |
| 10 | Web clipper extension | ◐ | ○ | ○ | ● (+Unsorted inbox) | ○ | ○ | ○ | ○ | ○ | ○ | (built-in browser) | ● | ○ | ● |
| 11 | Built-in browser / PDF reader | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ● PDF | ○ | ◐ |
| 12 | Built-in stock image search | ◐ | ◐ | ◐ | ● Pexels | ○ | ○ | ● | ○ | ○ | ○ | ◐ | ○ | ○ | ○ |
| 13 | Non-destructive crop/mask | ◐ crop | ◐ | ◐ | ◐ | ○ | ◐ | ● | ◐ | ○ | ◐ | ? | ○ | ● | n/a |
| 14 | Image adjustments (grayscale, flip, opacity) | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ◐ opacity | ◐ opacity | ? | ○ | ● | ◐ |
| 15 | Auto colour palette extraction | ○ | ○ | ○ | ○ (manual swatch) | ○ | ○ | ◐ | ○ | ○ | ○ | ● (tags) | ○ | ○ | ● |
| 16 | Search by colour / visual similarity | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ | ○ | ● (AI, offline) |
| 17 | Auto-tagging / AI captions | ◐ | ○ | ○ | ○ | ○ | ○ | ◐ | ○ | ○ | ○ | ● | ◐ | ○ | ● |
| 18 | Auto-arrange images (grid/masonry/pack) | ◐ | ◐ | ◐ | ◐ | ● | ◐ | ◐ | ◐ | ○ | ◐ | ? | ◐ | ● | n/a |
| 19 | Source URL / attribution kept | ◐ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ● | ● | ○ | ● |
| 20 | Same asset reused across boards (transclusion) | ◐ (synced) | ○ | ○ | ◐ (board links) | ○ | ○ | ○ | ○ | ○ | ○ | ● | ● | ○ | ● library |
| 21 | Video / GIF on canvas | ● | ◐ | ◐ | ● | ○ | ◐ | ● | ● | ○ | ◐ | ● | ◐ | ◐ GIF | ● |
| 22 | Always-on-top / overlay window | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● | ○ |
| **Diagramming / structure** |
| 23 | Shapes + smart connectors | ● | ● | ● | ◐ lines | ● | ● | ◐ | ● | ● | ● | ◐ | ● | ○ | ○ |
| 24 | Mind map / diagram-as-code | ● | ◐ | ◐ | ○ | ● | ● | ◐ | ○ | ◐ Mermaid | ◐ | ○ | ● mindmap | ○ | ○ |
| 25 | Rich notes / docs as cards | ◐ | ◐ | ◐ | ● | ● docs | ◐ | ● | ◐ | ○ | ◐ | ● | ●● | ◐ | ◐ |
| 26 | Templates library | ●● | ● | ● | ● (100+) | ● | ● | ●● | ○ | ◐ libs | ○ | ◐ | ◐ | ○ | ○ |
| **Collaboration** |
| 27 | Realtime multiplayer + cursors | ● | ● | ● | ● | ● | ● | ● | ● (≤100) | ● E2EE | ● | ● | ● | ○ | ○ |
| 28 | Comments / threads | ● | ● | ● | ● | ● | ● | ● | ○ | ◐+ | ○ | ● | ◐ | ○ | ◐ |
| 29 | Reactions / stamps / playful | ◐ | ●● | ● | ● reactions | ◐ | ◐ | ● | ○ | ○ | ◐ | ? | ○ | ○ | ○ |
| 30 | Facilitation (timer, vote, private mode, summon, breakouts) | ● | ● timer+music | ●● | ○ | ○ | ●● breakouts | ◐ timer | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| 31 | Async video walkthrough | ● Talktrack | ○ | ◐ | ○ | ○ | ◐ | ◐ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| 32 | Formal approval workflow | ◐ | ○ | ○ | ○ | ○ | ○ | ◐ | ○ | ○ | ○ | ○ | ○ | ○ | ○ |
| **Sharing** |
| 33 | Public view link, no login | ● (paid) | ● open session 24h | ● | ● | ● | ● | ● | ◐ (Apple ID for collab) | ● | ● | ● | ● live | ○ | ○ |
| 34 | Password-protected link | ● (paid) | ○? | ? | ● | ● (Pro) | ? | ○ | ○ | ○ (E2EE key in URL) | ○ | ? | ○ | ○ | ○ |
| 35 | Anonymous comment/edit | ● visitors | ● open sessions | ● | ◐ (account to comment) | ● (Pro) | ◐ | ◐ | ○ | ● | ● | ? | ◐ "can chat" | ○ | ○ |
| 36 | Embed board in a website | ● | ● | ● | ● | ● | ● | ● | ○ | ● | ● | ● publish | ● | ○ | ○ |
| 37 | Presentation mode | ● frames | ◐ (→Slides) | ● | ○ | ◐ | ● | ●● (→deck) | ● scenes→PDF | ● (+) | ◐ | ? | ◐ | ○ | ○ |
| **Export / ownership** |
| 38 | Export PDF / PNG high-res | ● | ● | ● | ◐ (single page) | ● | ● | ●● | ● | ● SVG/PNG | ● SVG/PNG | ? | ◐ | ◐ | ● |
| 39 | Export all originals (ZIP) | ◐ | ○ | ○ | ● | ○ | ○ | ○ | ○ | ○ | ○ | ? | ○ | ◐ | ● |
| 40 | Open / local file format | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ○ | ● .excalidraw | ● .tldraw | ○ | ○ | ● .pur | ● library folder |
| **Platform** |
| 41 | Offline / local-first | ◐ | ○ | ○ | ○ (top complaint) | ○ | ○ | ○ | ● | ● | ● offline app | ◐ desktop | ● | ● | ● |
| 42 | Mobile capture / editing | ● | ◐ | ◐ | ● capture | ◐ | ◐ | ● | ●● | ◐ | ◐ | ○ | ● | ○ | ◐ |
| **AI** |
| 43 | AI (generate / cluster / summarise / agents) | ●● sidekicks, flows | ● | ● | ○ | ● | ● +MCP | ●● Magic | ◐ Creator Studio | ◐ text→diagram | ●● Make Real / Computer / Fairies | ● tagging | ● | ○ | ● local AI search + MCP |
| **Pricing** |
| 44 | Entry paid price (/user/mo, approx.) | $8–10 | $3–5 | $10–12 | $9.99–12.50 | $10 | $9–10 | free/Pro | free | $6 | free (SDK paid) | ~$12–17 | ~$9–12 | PWYW | ~$35 once |

---

## Part C — Best-in-class per feature area, and what to copy

| Area | Winner(s) | Why | Copy into our app |
|---|---|---|---|
| **Canvas feel** | **tldraw** | Velocity-aware snapping (a fast drag binds to the centre, a slow drag binds precisely, with hint glyphs); snapping off during fast drags; level-of-detail rendering; restrained UI. | Do the same: use pointer velocity to set snap and bind behaviour; budget 60 fps; simplify geometry at low zoom. Consider building on the tldraw SDK (commercial licence needed since v4) vs our own engine. |
| **Image-heavy performance** | **PureRef** (local), Eagle | Image-only engine and local files. Miro's image weakness (blur, slow loads, lag at 1–3k images) is well documented. | Tiled mipmaps per image (like map tiles); generate thumbnails/WebP/AVIF on upload while keeping the original; progressive sharpening; GPU (WebGL/WebGPU) image layer; virtualise off-screen objects. Make "3,000 images at 60 fps" a public benchmark. |
| **Structure for creatives** | **Milanote** | Nested boards, columns and an "Unsorted" inbox give order without killing freeform. | Board-as-card nesting, column containers that auto-stack, an inbox for clipped items, breadcrumb navigation. |
| **Capture** | **Milanote** clipper, **Kosmik** built-in browser, **Eagle** extension | One click with the source kept; no tab switching; batch and region capture. | Extension with right-click "save image/region/page" to a chosen board or inbox; store the source URL, page title and capture date; mobile share-sheet; paste from clipboard keeps the URL where possible. A built-in browser panel later (desktop app). |
| **Reference overlay** | **PureRef** | Always-on-top, click-through, chosen-app pinning. | Desktop companion (Tauri/Electron) "Ref mode": pin a frame or board as a floating, semi-transparent, click-through overlay above Photoshop/Figma/Procreate (Sidecar). |
| **Colour intelligence** | **Eagle**, **Kosmik**, **Kive** | Dominant colour extraction, search by colour, AI tags. | Auto-extract a 5–8 colour palette per image (k-means in a worker); a **board-level palette object** that updates live; click a swatch to highlight matching images; export ASE/ACO, Procreate `.swatches`, CSS/Tailwind tokens and Figma variables. |
| **Library / reuse** | **Are.na** (block in many channels), **Heptabase** (card on many boards), **Kosmik** (transclusion), **Eagle** (library) | Collect once, reuse everywhere. | A personal asset library behind every board; images are references, not copies; "used in 4 boards" indicator; dedupe by perceptual hash. |
| **Sharing with clients** | **Milanote** (password, welcome message, toggle for comments/reactions/drawing), **Whimsical** (password and anonymous comment on Pro), **FigJam** (24 h no-login open session), **Heptabase** (live link plus "can chat") | Low friction plus control. | Share links with: no login; optional password; **expiry date**; permission levels (view / react / comment / edit); welcome note; "can chat"/ask a question; revoke; **no account needed to comment** (name + email captcha). |
| **Presentation** | **Canva** (whiteboard ⇄ deck), **Freeform** (scenes → PDF), **Excalidraw+** / **Miro** (frames as slides), **Mural** (outline) | Present without leaving the canvas. | Ordered "Scenes" (saved viewport + zoom) with smooth camera transitions and presenter notes; export the scene list as a **designed multi-page PDF** (not Milanote's one-page PDF); "client mode" with UI hidden. |
| **Facilitation** | **Mural** (private mode, summon), **Lucidspark** (breakout boards), **FigJam** (timer + shared music) | Workshop power tools. | Lower priority for a moodboard tool. Copy cheap wins: timer with music, follow/summon, **private mode for dot-voting on images** (great for client picks). |
| **Delight** | **FigJam** | Stamps, emotes, high-fives, cursor chat. | Stamps as client feedback tokens (heart / "more like this" / "no"), which double as structured data (see Part E). |
| **Privacy / ownership** | **Excalidraw** (E2EE key in URL fragment), **tldraw offline**, **Obsidian JSON Canvas**, **AFFiNE** (local-first, MIT) | Trust, plus the MS Whiteboard deletion fear. | Local-first sync (CRDT: Yjs/Automerge); full export of the board (JSON Canvas-compatible) plus a ZIP of originals; optional E2EE "private board" mode. |
| **AI** | **Miro** (Sidekicks/Flows), **tldraw** (Fairies, Computer), **Figma Weave** (branching multi-model generation), **Eagle** (offline AI search) | Agents on the canvas; generation as a graph. | Moodboard-specific AI (see Part D); keep it **private and opt-in, with no training** (Apple and Eagle use this as a selling point); expose an MCP server like Lucid, Kive and Eagle. |
| **Mobile / ink** | **Freeform** | Pencil, searchable handwriting, free. | PWA plus Pencil support on iPad (pressure via Pointer Events); handwriting annotations on images for client markup. |
| **Export** | **Canva**, **Milanote** (ZIP of everything), **Excalidraw/tldraw** (SVG) | — | High-res PNG/PDF per frame/scene; SVG; ZIP originals with a CSV manifest (source URLs, palette); JSON Canvas. |
| **Pricing model** | **PureRef** (pay-what-you-want personal), **Eagle** (one-time), **FigJam** ($3–5 collab seat), **Mural/Miro** (free visitors) | Creatives hate per-seat for clients. | **Clients and viewers always free and unlimited**; pay per creator; generous free tier by boards, not cards (Milanote's 100-card cap is a common irritation [pk]). |

---

## Part D — Distinctive ideas worth stealing that Miro does NOT have

1. **Unsorted inbox** for clipped items (Milanote): capture now, curate later, kept off the canvas until placed.
2. **Columns** that auto-stack cards, and **nested boards as cards** (Milanote, Muse/Allume, Kosmik universes).
3. **Built-in browser and PDF reader** docked beside the canvas; drag straight from a page (Kosmik).
4. **Always-on-top, click-through reference overlay** (PureRef), including "pin over a specific app".
5. **Grayscale value-check toggle** and flip per image or for the whole canvas (PureRef). Painters and illustrators use this constantly.
6. **Single-file portable board** with embedded images (`.pur`, `.tldraw`, `.excalidraw`), plus an **open format** (JSON Canvas).
7. **Search by colour and visual similarity; AI captions** (Eagle, Kosmik, Cosmos, Kive). Eagle does it **fully offline**.
8. **Transclusion:** reuse an item from someone's published board, and it updates when the author updates it (Kosmik). Blocks living in many channels (Are.na).
9. **Velocity-aware snapping and arrow binding** (tldraw).
10. **E2EE share links with the key in the URL fragment**, so the server can't read boards (Excalidraw).
11. **Hand-drawn / sketch rendering style** that signals "draft" (Excalidraw).
12. **24-hour no-login open sessions** (FigJam). **"Can chat" on public boards**, so viewers can message the owner (Heptabase).
13. **Welcome message on shared boards** (Milanote).
14. **Shared timer with music** where each user mutes locally (FigJam).
15. **Private mode reveal** (Mural) and **breakout boards** that sync back (Lucidspark).
16. **Scenes:** named viewports exported to PDF (Freeform). **Whiteboard ⇄ presentation conversion** (Canva).
17. **Searchable/translatable handwriting** (Freeform).
18. **Branching, multi-model generation graph** on the canvas (Figma Weave, tldraw Computer). **Sketch → working prototype** (Make Real). **Visible AI agents with states** (tldraw Fairies).
19. **Doc ⇄ canvas dual view** of the same content (AFFiNE edgeless; Heptabase cards as notes). **Code ⇄ diagram** (Eraser).
20. **LAN multiplayer with no cloud** (tldraw offline).
21. **Formal board approval** (Conceptboard), and **one click from board to project** (Klaxoon → Wrike).
22. **Built-in free stock search** inside the board (Milanote/Pexels, Canva).
23. **AI auto-organised tabs** for a messy board (Pinterest Oct 2025) and **auto-collages** from saves (Pinterest).
24. **No-account anonymous whiteboard for clients/students** plus a white-label API (Ziteboard).
25. **Calm, ad-free collecting with a public profile** (Cosmos, Are.na): a portfolio-like public face for a curator.

---

## Part E — Gaps nobody fills well (opportunities)

### For moodboarding
1. **Fast, sharp image canvases at scale.** Miro blurs and lags at 1–3k images, and Heptabase lags at about 100 heavy cards; PureRef is fast but solo and offline-only. Nobody combines PureRef speed + browser collaboration + full-res-on-zoom. → Tiled mipmaps, a WebGL/WebGPU layer, a background image pipeline, and a public perf benchmark.
2. **Colour as a first-class canvas object.** Eagle and Kosmik extract colour *in a library*, and Milanote has only a *manual* swatch card. No canvas tool:
   - auto-builds a **live board palette** from the images;
   - lets you lock or rename swatches;
   - shows the % weight of each colour;
   - highlights the images that contain a swatch;
   - exports to ASE/Procreate/Figma variables.
3. **Smart image layout tools designers actually want:**
   - justified rows, masonry, "pack tightly" (PureRef-style), "normalise heights";
   - gutters as tokens;
   - "tidy selection" that keeps a grid;
   - crop-to-aspect presets (4:5, 16:9);
   - non-destructive masks and rounded corners;
   - blend/opacity, grayscale/flip.
   Whiteboards treat images as stickies.
4. **Type on moodboards.** No tool has proper **type specimen cards**: drop a font name to render it (Google/Adobe Fonts), compare pairings, and record licence and source. Creative directors moodboard type constantly [pk].
5. **Provenance and rights.** Cosmos users complain about missing originals and attribution. Few tools keep **source URL + photographer + licence + capture date** on every image, show a credit overlay in client mode, and export a credits sheet. That matters for agency work and AI-era trust.
6. **One library, many boards.** Moodboarders re-collect the same references. Eagle is a library without a collaborative canvas; Miro and Milanote are canvases without a library. → A "Collect once (Are.na/Eagle) → arrange anywhere (Milanote) → present (Canva)" pipeline in one product, with dedupe by perceptual hash.
7. **Motion references.** Video and GIF moodboards (scrub, set the poster frame, loop a range, frame-grab to image) are weak everywhere except perhaps Milanote/Kosmik playback [pk].
8. **Desktop companion + web.** No tool offers both a collaborative web canvas *and* a PureRef-style overlay or Kosmik-style built-in browser on desktop. → Tauri app with Ref mode, a global capture hotkey (screenshot a region into the inbox) and offline sync.
9. **AI that respects taste rather than replacing it:**
   - "find more like these 5" (web plus own library, by visual similarity);
   - "cluster this board by mood/colour/era";
   - "name this palette / write the art-direction rationale for the client";
   - "find the gaps" (e.g., "no warm-tone night shots");
   - "generate a missing variant" via a Weave-style branching node, clearly labelled AI;
   - on-device or no-training guarantee (Eagle and Apple show this sells).

### For client presentation and sharing (the biggest white space)
10. **Client review built for moodboards, not workshops.** Conceptboard has board-level approval and Milanote has comments/reactions, but nobody offers **per-image pick/reject/"more like this" voting by clients without an account**, with results aggregated per direction (e.g., "Direction A: 7 ♥, 2 ✕"). Combine Mural private mode (clients vote blind) + FigJam stamps as structured data + a Conceptboard approval stamp ("Direction B approved by Jane, 12 Nov").
11. **Rounds and versions.** Agencies present Round 1 → feedback → Round 2. No tool has **named snapshots per presentation round**, side-by-side compare (A/B swipe) and "what changed since the client last viewed".
12. **Branded, secure share pages:**
    - custom logo, colours and domain;
    - password + **expiry** + **download toggle** + **watermark** + disable right-click save (deterrent);
    - **view analytics** (opened when, by whom, time per scene).
    Milanote has password + welcome message; Miro has passwords; nobody has expiry, watermark and analytics together for moodboards.
13. **Canvas → polished deck → canvas.** Canva converts both ways but isn't a pro moodboard tool; Milanote's PDF export is one page; Freeform scenes → PDF is plain. → "Presentation scenes" with camera moves, presenter notes, auto-generated title/palette/credits slides, and **multi-page designed PDF export** that a CD would actually send.
14. **Guided async walkthroughs for clients.** Miro has Talktrack, but no moodboard tool lets the designer record a short voice-over tour across scenes that the client plays on a no-login link, then reacts per scene.
15. **Clients on any device.** Freeform requires an Apple ID; Milanote requires an account to comment. → Zero-account mobile web review that is excellent on a phone (swipe through scenes, tap to like, pinch to zoom at full res).
16. **Ownership guarantees.** The MS Whiteboard deletions in 2026 make "your boards are files you own" a sellable promise:
    - local-first;
    - one-click ZIP (originals + JSON Canvas + PDF);
    - optional E2EE private boards (Excalidraw-style key in the URL fragment).
17. **Pricing that matches agency reality.** Free unlimited clients/viewers/commenters; pay per creator; no card caps (Milanote's 100-card free cap and Miro's 3-board cap push people away [pk]).

---

## Part F — Suggested positioning in one line

"PureRef's speed + Milanote's taste and structure + Eagle's colour/library brain + FigJam's delight, with client review and presentation that no whiteboard has done properly: a fast moodboard canvas creative directors can **collect** in, **compose** in, and **sell** from."

---

## Sources

*(WebFetch blocked; all sources seen via search results.)*

**Miro**
- https://miro.com/blog/whats-new-october-2025/
- https://community.miro.com/general-news-2/what-s-new-what-we-launched-in-october-2025-26378
- https://www.businesswire.com/news/home/20251014500530/en/
- https://miro.com/pricing
- https://miro.com/pricing/?facet1=pdf
- https://www.gend.co/blog/miro-pricing-explained-which-plan-is-right-for-your-team-in-2025
- https://community.miro.com/changelog-discussion-31/password-protection-for-public-boards-now-available-on-team-business-consultant-and-education-plans-2009
- https://community.miro.com/ask-the-community-45/board-size-impacting-performance-4783
- https://community.miro.com/ask-the-community-45/blurry-images-1794
- https://community.miro.com/ask-the-community-45/image-aliasing-5555
- https://community.miro.com/ideas/automatically-reduce-the-resolution-of-images-over-32-megapixels-1599
- https://community.miro.com/developer-platform-and-apis-57/performance-issues-on-large-pages-tried-the-recommendations-20982
- https://findstack.com/products/miro/reviews?page=99

**FigJam / Figma**
- https://help.figma.com/hc/en-us/articles/4410786053911 (open sessions)
- https://help.figma.com/hc/en-us/articles/4402269549591 (timer and music)
- https://figma-signup.helpjuice.com/use-ai-tools-in-figjam
- https://figma-signup.helpjuice.com/generative-tools/use-jambot-in-figjam
- https://www.computerworld.com/article/3709972/whiteboarding-platform-figjam-gets-new-ai-powered-capabilities.html
- https://makerstack.co/reviews/figjam-review/
- https://www.figma.com/blog/introducing-new-figjam-prices-and-a-more-open-platform/
- https://www.vktr.com/digital-experience/figma-integrates-anthropics-claude-to-generate-diagrams-inside-figjam/
- https://www.figma.com/blog/welcome-weavy-to-figma/
- https://www.fastcompany.com/91431691/figma-weave-weavy-acquisition
- https://help.figma.com/hc/en-us/articles/35965787376919

**Mural**
- https://www.hackdesign.org/toolkit/mural/
- https://resources.rework.com/tools/design-creative/miro-vs-mural
- https://costbench.com/changelog/mural-price-increase-2026-02/
- https://costbench.com/software/diagramming/mural/free-plan

**Milanote**
- https://help.milanote.com/en/articles/4324593-sharing-a-board
- https://help.milanote.com/en/articles/9519480-password-protected-boards
- https://help.milanote.com/en/articles/9860037-read-only-board-settings
- https://help.milanote.com/en/articles/9859634-what-do-others-see-when-i-share-a-board
- https://help.milanote.com/en/articles/10684379-comments
- https://help.milanote.com/en/articles/10478526-columns
- https://help.milanote.com/en/articles/111395-exporting-your-work
- https://milanote.com/releases
- https://milanote.com/guide/moodboard
- https://milanote.com/product/moodboarding
- https://milanote.com/templates/moodboards
- https://www.macstories.net/reviews/free-form-card-based-note-taking-with-milanote/
- https://www.capterra.com/p/165790/Milanote/
- https://www.getapp.com/collaboration-software/a/milanote/
- https://fabric.so/comparison/miro-vs-milanote
- https://fabric.so/comparison/best-moodboard-app

**Whimsical**
- https://help.whimsical.com/faqs/sharing
- https://help.whimsical.com/workspaces/guests
- https://www.capterra.com/p/172789/Whimsical/
- https://tooldirectory.ai/tools/whimsical

**Lucidspark**
- https://lucidspark.com/product
- https://5.lucidspark.com/solutions/facilitation-tools
- https://thedigitalprojectmanager.com/tools/lucidspark-review/
- https://community.lucid.co/ideas/merge-lucidchart-and-lucidspark-into-one-single-intelligent-canvas-12494

**Canva**
- https://www.canva.com/whiteboards
- https://t2online.in/tech/tech-news/canva-expands-docs--sheets-and-whiteboards-with-new-tools/2007776
- https://www.techrepublic.com/article/news-canva-visual-suite-100-updates/
- https://brendacadman.com/how-to-use-canva-whiteboards/

**Apple Freeform**
- https://9to5mac.com/2025/11/04/ios-26-2-gives-freeform-app-brand-new-tables-feature/
- https://9to5mac.com/2026/03/26/ios-26-4-just-made-apple-creator-studio-even-better-heres-whats-new/
- https://ipadworker.substack.com/p/how-to-use-freeforms-new-scene-feature
- https://ios.gadgethacks.com/how-to/freeform-ios-18-features/
- https://www.igeeksblog.com/how-to-use-apple-freeform-app/
- https://support.apple.com/guide/ipad/position-items-on-a-board-ipad0b4f22b0/17/ipados

**Excalidraw**
- https://github.com/excalidraw/excalidraw/
- https://plus.excalidraw.com/blog/end-to-end-encryption
- https://plus.excalidraw.com/pricing
- https://costbench.com/software/diagramming/excalidraw/
- https://dev.to/nologintools/is-excalidraw-private-free-online-whiteboard-no-login-1gc2

**tldraw**
- https://tldraw.dev/faq
- https://tldraw.dev/pricing
- https://tldraw.dev/blog/license-update-for-the-tldraw-sdk
- https://alternativeto.net/news/2025/9/tldraw-sdk-4-0-adds-five-new-starter-kits-cli-tool-and-enforces-licensing-changes
- https://tldraw.dev/blog/release-notes-20230210
- https://tldraw.dev/sdk-features/performance
- https://webiano.digital/tldraw-feels-closer-to-paper-than-productivity-software/
- https://tldraw.dev/blog/tldraw-offline
- https://alternativeto.net/news/2026/7/tldraw-releases-free-offline-desktop-app-with-scripting-features/
- https://github.com/tldraw/tldraw-offline
- https://ai.engineer/talks/agents-on-the-canvas-in-tldraw
- https://gitnation.com/contents/agents-on-the-canvas-with-tldraw
- https://tldraw.dev/blog/announcing-tldraw-series-a

**Muse / Allume**
- https://apps.apple.com/eg/app/id1501563902
- https://toolradar.com/tools/muse

**Kosmik**
- https://techcrunch.com/2023/12/21/meet-kosmik-a-visual-canvas-with-an-in-built-pdf-reader-and-a-web-browser/
- https://kosmikapp.substack.com/p/kosmik-a-commonplace-for-human-knowledge
- https://kosmikapp.substack.com/p/kosmik-year-in-review
- https://www.cbinsights.com/company/kosmik
- https://toolradar.com/tools/kosmik/pricing
- https://kive.ai/learn/kive-vs-kosmik

**Heptabase**
- https://support.heptabase.com/en/articles/12121546-how-do-i-publish-whiteboards-with-a-public-link
- https://wiki.heptabase.com/changelog/2025
- https://vantaige.io/ai-tool/heptabase
- https://aitoolscoop.com/tool/heptabase/

**Eraser / AFFiNE / Obsidian / Notion**
- https://www.eraser.io/pricing
- https://affine.pro/pricing
- https://openalternative.co/affine
- https://obsidian.md/blog/json-canvas/
- https://jsoncanvas.org/
- https://mockflow.com/blog/notion-whiteboard

**Microsoft Whiteboard**
- https://mc.merill.net/message/MC1441775
- https://www.windowscentral.com/software-apps/you-now-have-a-bit-more-time-before-microsoft-takes-away-your-whiteboard
- https://blog-en.topedia.com/2025/12/adding-documents-in-microsoft-whiteboard-will-be-retired/
- https://m365admin.handsontek.net/?p=23773

**Klaxoon / Conceptboard / Ziteboard**
- https://www.wrike.com/newsroom/wrike-welcomes-visual-collaboration-capabilities-with-close-of-klaxoon-acquisition/
- https://klaxoon.com/about
- https://www.frenchweb.fr/wrike-klaxoon-la-plateforme-qui-reconcilie-performance-humaine-et-puissance-de-lia/461379
- https://www.trustradius.com/compare-products/conceptboard-vs-klaxoon
- https://conceptboard.com/plans
- https://www.getapp.co.uk/software/116399/conceptboard
- https://www.g2.com/products/conceptboard/reviews
- https://ziteboard.com/online-whiteboard-features
- https://ziteboard.com/pricing/
- https://ziteboard.com/white-label-online-whiteboard-api/

**PureRef**
- https://pureref.com/handbook/2.0/features/
- https://pureref.com/handbook/2.0/images/
- https://www.pureref.com/handbook/1.11/images/
- https://www.cgchannel.com/2024/05/pureref-2-0-is-out
- https://80.lv/articles/pureref-2-1-is-out-now

**Eagle**
- https://eagle.cool/blog/post/eagle-plugin-ai-search
- https://de.eagle.cool/blog/post/eagle4-build22
- https://eagle.cool/blog/post/eagle4-build21
- https://www.hackdesign.org/toolkit/eagle/
- https://webdesign.tutsplus.com/organize-design-assets-with-eagle-app--cms-36971t

**Cosmos / Are.na / Pinterest / Kive / Niice**
- https://www.cosmos.so/llms.txt
- https://www.cosmos.so/blog/the-future-of-cosmos
- https://help.cosmos.so/en/articles/11717954-cosmos-premium
- https://www.wix.com/studio/blog/cosmos-app
- https://ie.trustpilot.com/review/www.cosmos.so
- https://www.are.na/about
- https://help.are.na/docs/getting-started/premium-features
- https://www.are.na/editorial/supporter-to-plus-plus
- https://newsroom.pinterest.com/news/pinterest-boards-get-ai-powered-upgrade-for-personalized-experience/
- https://techcrunch.com/2025/10/27/pinterest-experiments-with-new-ai-powered-personalized-boards/
- https://techcrunch.com/2024/05/01/pinterest-says-its-ai-powered-collages-are-now-more-engaging-than-pins
- https://kive.ai/learn/best-ai-tools-for-moodboards
- https://storyflow.so/blog/best-concept-art-board-tools-2026
- https://www.producthunt.com/p/niice/niice-boards
- https://niice.notion.site/Read-only-board-links-1e7e09405c9c4c16b28e4c3e308364c6
