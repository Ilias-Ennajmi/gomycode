# Miro: complete feature inventory, as of Nov 2026, for planning a competing canvas or moodboard app

Research date: 2026-11-12.

## How this was researched, and how far to trust it

- **Blocked sources.** WebFetch could not reach any outside host in this session (DNS failed for miro.com, help.miro.com, releasebot.io, banani.co, gend.co and others). Nothing in this report comes from reading a page directly.
- **What was used instead.** Every sourced fact comes from WebSearch result summaries of help.miro.com, miro.com, community.miro.com, developers.miro.com and third-party write-ups. URLs are cited inline.
- **Facts from prior knowledge.** Facts marked **[K]** come from my own knowledge of Miro up to 2025–2026. Searches in this session did not confirm them. Check them in the product before relying on them.
- **Facts marked [?].** These are uncertain, or the sources disagree.
- **Context: change of owner.** Bending Spoons agreed on 10 Sep 2026 to buy Miro for $1.355B. A later Business Wire repost says the deal has completed. No changes to plans or pricing had been announced as of the Sept 2026 reviews. Sources: https://www.verdict.co.uk/bending-spoons-miro-acquisition/ , https://finviz.com/news/407788/bending-spoons-completes-the-acquisition-of-miro , https://tooldirectory.ai/tools/miro
- **Context: Miro's positioning.** Miro now sells itself as an **"AI Innovation Workspace"**. It launched as the Intelligent Canvas in July 2024, was renamed the Innovation Workspace at Canvas 24 (Oct 2024), and became the AI Innovation Workspace at Canvas 25 (Oct 2025). Canvas 26 (May–Jul 2026) followed. Most new development is in AI: Sidekicks, Flows, MCP and Connectors.

---

## 1. Canvas and navigation

| Feature | Detail | Source |
|---|---|---|
| Infinite canvas | Boards are unbounded. There is a hard cap of **100,000 objects per board**. Performance starts to degrade from about **1,000 objects**, and Miro recommends staying **under 5,000**. Heavy items (high-resolution images, PDFs, pen strokes, tables) slow a board earlier. Miro no longer documents a cap on concurrent users. | https://help.miro.com/hc/articles/360013588560 |
| Zoom | Bottom-right "Canvas controls": zoom in and out, a % dropdown (full screen, show/hide minimap, fit to screen), fit to screen, minimap and full screen. Ctrl/Cmd +/− zooms in and out. Official shortcuts: **Alt+1** zooms to fit, **Alt+2** zooms to the selected item (Windows). Some third-party lists give Cmd/Ctrl+1. The zoom range is roughly 1%–400% [K?]. Ctrl/Cmd+scroll or pinch also zooms [K]. | https://help.miro.com/hc/articles/360017731053 , https://miro.com/shortcuts/ |
| Pan | Drag with the right mouse button. Use the scroll wheel or trackpad. **H** selects the Hand tool. Hold **Space** and drag [K]. Navigation settings let you choose Mouse, Trackpad or Auto-switch behaviour [K]. | https://help.miro.com/hc/articles/360017731053 , https://miro.com/shortcuts/ |
| Minimap | Toggled with **M** or from the controls. You can drag inside it to navigate. | same |
| Grid | Board settings offer a background grid: dot grid, lines or none [K]. **Snap to grid** is tied to the dot grid (Settings → Background grid → Dot grid). Users report snapping that is inconsistent. | https://community.miro.com/ideas/snap-to-grid-205/index2.html , https://community.miro.com/ideas/snap-to-grid-feedback-29563 |
| Snapping and smart guides | Relative snapping and alignment guides show while dragging, including equal-spacing hints [K]. Holding Ctrl (Option on Mac) while moving skips guides and snapping. The mobile app's settings can turn grid and snapping on or off. | https://community.miro.com/inspiration-and-connection-67/shout-outs-to-relative-snapping-alignment-5218 , https://help.miro.com/hc/articles/360017572834 |
| Board background colour | Main menu → Board → Background colour. | https://community.miro.com/product-news-31/change-the-backgrounds-colors-of-your-boards-13884 |
| Dark mode | **Not available on web or desktop**; users keep requesting it. The **mobile app** has a dark mode. | https://community.miro.com/ideas?page=4 , https://help.miro.com/hc/articles/360017572834 |
| Frames | Containers that act as slides, export pages and areas for organising the board. Presets are **ratios, not fixed sizes**: Custom, 16:9, 4:3, 1:1, A4 (portrait or landscape), Letter 8.5×11, plus phone, tablet and desktop sizes [K partly]. Users have asked for A0–A5 presets. Exact sizes can be set through the SDK or by typing W/H [K]. Each frame has a background colour, a name and a link. Frames can export as an image, become PDF pages, or be presented. Frames **cannot be reordered in z-order** (a long-standing complaint). | https://community.miro.com/ideas/more-default-frame-sizes-15943 , https://community.miro.com/ask-the-community-45/why-does-the-a4-frame-size-vary-in-size-210 , https://community.miro.com/wish-list-32/bring-frame-to-front-or-back-4512 |
| Frames panel | The board's outline: a list of frames with thumbnails that you can rename, reorder (this sets presentation order), present from, and use to jump around the board [K]. It cannot be reordered by touch on tablets. | https://help.miro.com/hc/articles/360017731633 |
| Hide frames | A facilitator can hide frame content from participants and reveal it later [K]. | — |
| Layers / z-order | **There is no layers panel.** Order follows creation order. Only **Bring to front** and **Send to back** exist (context menu ⋯, or **PgUp/PgDn**); there is no one-step-at-a-time forward or back. Grouping interferes with ordering; the workaround is to double-click into the group to isolate it. | https://community.miro.com/ideas/layers-93/index3.html , https://community.miro.com/ask-the-community-45/objects-are-automatically-grouping-when-placed-together-and-cannot-be-ungrouped-15389 , https://keyshortcuts.net/miro-shortcuts |
| Lock | Lock and unlock objects: **Ctrl/Cmd+Shift+L** (one source says Ctrl+L). Locked objects can still be sent to front or back from the right-click menu, but the keyboard shortcut does not work on them. | https://hkeys.app/apps/miro/windows , https://keyshortcuts.net/miro-shortcuts |
| Group | **Ctrl/Cmd+G** groups and **Ctrl/Cmd+Shift+G** ungroups. Nested groups behave badly: ungrouping flattens everything. | same , https://community.miro.com/ask-the-community-45/grouping-and-locking-is-confusing-2616 |
| Presentation mode | Use the **Present** button at top right. Frames are the slides, in the order of the Frames panel. Controls sit bottom-left, bottom-right and top-right. You can **hand off** control to a co-presenter. **Presenter notes** open in a separate window that only the presenter sees. **Interactive Presentation Mode** lets the audience interact (add stickies, react) while you present. Legacy smooth panning transitions were removed, and users want them back. **No built-in laser pointer** was confirmed; it is a 2023 feature request. | https://help.miro.com/hc/articles/34307373858450-Presentation-mode , https://help.miro.com/hc/en-us/articles/8512850754962-Interactive-Presentation-Mode , https://community.miro.com/ideas/laser-pointer-11720 , https://community.miro.com/ideas/please-bring-back-legacy-smooth-transitions-panning-in-presentation-mode-28391 |
| Link to object | Copy a link to any object or frame (⋯ → Copy link). The URL opens the board zoomed to that item. Internal links break when a board is copied. | https://directors.help.designity.com/en/articles/10295889-how-do-i-share-a-link-to-a-specific-area-in-a-miro-board , https://community.miro.com/ask-the-community-45/internal-links-breaks-when-making-a-copy-of-the-miro-board-28074 |
| Accessibility | Keyboard navigation of board objects, toolbars and panels (Tab moves between toolbars). **Single-key shortcuts can be turned off** for assistive technology. VoiceOver works on mobile. | https://help.miro.com/hc/articles/11997028019858 , https://medium.com/miro-engineering/miro-accessibility-introducing-keyboard-navigation-for-board-objects-dba41d0c4903 |

---

## 2. Creation tools

### 2.1 Toolbar layout
- **Left creation toolbar [K]:**
  - Select (V)
  - Templates
  - **Create with AI** (a separate icon at the top)
  - Text (T)
  - Sticky note (N)
  - Shapes and lines (S)
  - Connection line (L)
  - Pen (P)
  - Comment (C)
  - Frame (F)
  - Upload
  - "+ More apps": Cards, Kanban, Mind map, Tables, Docs, Slides, Code, Timer, Voting, Emoji and stickers, Embed, Images and Icons, and others
- The toolbar can be customised: you pin and unpin tools [K].
- Source for Create with AI: https://help.miro.com/hc/articles/28782102127890

### 2.2 Sticky notes
- **Colours: 16 fixed colours.** You cannot set custom sticky colours. Source: https://help.miro.com/hc/articles/360017572054
- **Shape:** square or rectangle, switched from a context-menu icon. New stickies default to square (users dislike this). The size option is in the context menu. Users want to set a default size. Sources: https://community.miro.com/ideas/customize-option-for-default-settings-like-sticky-shape-size-font-size-etc-28749 , https://community.miro.com/ideas/set-default-sticky-note-size-233
- **Auto font size:** a toggle in the context menu. Text shrinks to fit as you type. With it off, the size stays fixed and overflowing text is hidden.
- **Text limit:** about 3,000 characters per sticky.
- **Fonts:** sticky notes support only **2 font styles**. Formatting is limited: bold, italic, underline, strikethrough, links, lists, alignment [K]. Free text colour on stickies is a long-standing request. Sources: https://help.miro.com/hc/articles/360017572114 , https://community.miro.com/ideas/free-text-formatting-for-stickies-font-colour-250
- **Tags:** up to **8 tags per sticky**. Tags are coloured and searchable, and the board can be filtered by tag.
- **Show author:** a per-sticky author label, off by default. It cannot be enforced across the board.
- **Bulk creation:**
  - **Bulk mode** in the sticky tool: each typed line becomes a sticky (some users report the line splitting fails).
  - **Paste spreadsheet cells**, then choose "paste as sticky notes": one cell becomes one sticky. Google Sheets cell colours carry over. Excel colours work only if the range is a table.
  - Select many stickies to change colour, size or tags in bulk.
- **Reactions / emoji on stickies [K].**
- **Private mode** applies to stickies (see §5).
- **AI:** generate, cluster (by keyword or sentiment) and summarise stickies, or turn them into a Doc. Source: https://help.miro.com/hc/en-us/articles/28781881506834-Miro-AI-with-Sticky-notes
- **Mobile:** scan paper post-its and convert them into digital stickies. Source: https://apps.apple.com/app/id1180074773

### 2.3 Text
- **Options while editing:** font, colour, opacity, alignment, font size, highlight, bold (Ctrl+B), italic (Ctrl+I), underline, strikethrough [K].
- **Links:** select text and paste a URL to link it.
- **Lists:** type "-" or "1." then a space, or use the context menu.
- **One font per object:** the font applies to the whole object, so you cannot mix fonts within one object. Users have long asked for mixed sizes in one box.
- **Fonts:** Arial, IBM Plex Sans/Serif/Mono, Noto Sans, Roboto, PT Sans, Georgia, Times New Roman, and others. Hand-drawn and display fonts such as Caveat are also offered [K]. Bold and italic support varies by font.
- **Pasted formatting:** formatting from other apps is **not kept** on paste, except bulleted and numbered lists.
- Sources: https://help.miro.com/hc/articles/360017572094 , https://help.miro.com/hc/articles/360017572114-Fonts

### 2.4 Shapes and diagramming
**Free on all plans:**
- Basic shapes [K]: rectangle, rounded rectangle, circle/oval, triangle, rhombus, parallelogram, trapezoid, pentagon, hexagon, octagon, star, cross, arrows, callout or speech bubble, cloud, cylinder.
- Flowchart shapes.
- Connectors.

**Shape properties [K]:** fill, opacity, border (colour, width, solid/dashed/dotted), text inside the shape, switching to another shape.

**Diagramming panel → "Manage shapes" / "More shapes":** enable shape packs, then drag or click shapes onto the board.

**Paid shape packs (Business, Enterprise, Education; Starter is unclear):**
- BPMN 2.0
- UML
- ERD / Data flow
- AWS, Azure, Google Cloud
- Kubernetes, Cisco, Salesforce
- Wireframe/UI [K]
- **Electrical Engineering** and **Process Engineering** (added Jan 2026)
- **Custom shape packs** can be uploaded on paid plans.
- **Swimlanes** come with the Flowchart, BPMN and UML packs.
- Sources: https://miro.com/online-diagram-and-map-maker/ , https://community.miro.com/product-news-31/aws-azure-and-cisco-shapes-moved-to-diagramming-library-6586 , https://community.miro.com/product-news-31/what-s-new-what-we-launched-in-january-2026-27457

**Other diagramming features:**
- AI diagram generation: see §7.
- Image or sketch to editable diagram (AI, limited availability).
- Import from Visio, Lucid and draw.io: see §6.

### 2.5 Connectors (lines and arrows)
- **Shapes:** straight, elbowed (orthogonal, now with **rounded elbows**) and curved. Source: https://developers.miro.com/changelog/2022-11-07 , https://community.miro.com/ideas/connection-lines-with-rounded-elbows-6116
- **End caps** (official enum): `none`, `stealth` (the default), `arrow`, `triangle`, `filled_triangle`, `diamond`, `filled_diamond`, `oval`, `filled_oval`, plus the ERD caps `erd_one`, `erd_many`, `erd_only_one`, `erd_zero_or_one`, `erd_one_or_many`, `erd_zero_or_many`. Source: https://engineering.miro.com/docs/api/miro/create-connector
- **Style:** colour, width, normal/dashed/dotted stroke, opacity [K].
- **Captions (labels):** several per connector. Each has its own position along the line (0–100%) and vertical alignment. Font size ranges 10–288 (default 14). Sources: https://developers.miro.com/changelog/2023-01-10-changelog , https://miroapp.github.io/api-clients/python/miro_api/models/caption.html
- **Attachment:** connectors snap to anchor points on a shape's edges or attach anywhere on the shape ("snapTo" auto/top/right/bottom/left in the API). Connectors follow the shape when it moves. Hovering a shape shows "+" handles that quick-create a connected shape [K].
- **No default connector type**, which is a top user complaint. Auto-routing is limited: elbows re-route but do not avoid obstacles [K?]. Line jumps over crossing lines are unconfirmed. Source: https://community.miro.com/ideas/set-default-connection-type-15598

### 2.6 Pen, highlighter, eraser, lasso, smart drawing
- **Pen:** 3 presets. Double-click a preset to edit its colour and thickness. Presets cannot be deleted. Palm rejection and Apple Pencil are supported.
- **Highlighter:** 3 presets.
- **Smart drawing:** turns strokes into shapes, stickies and lines. One stroke makes one object. It works best at 100% zoom, and it is the way to draw straight lines.
- **Eraser:** erases pen strokes only. To delete a smart object, scribble over at least 50% of it.
- **Precision eraser:** erases part of a stroke.
- **Lasso:** select objects freehand.
- **Not supported:** handwriting-to-text.
- **Shortcuts:** P opens the pen tray, E the eraser.
- Sources: https://help.miro.com/hc/articles/360017730573 , https://community.miro.com/product-news-31/pen-tool-updates-palm-rejection-highlighter-lasso-tool-and-drawing-presets-2536

### 2.7 Images
- **Ways to add:** upload, drag-drop, paste from the clipboard, Upload via URL, Google Drive, Dropbox, Box, OneDrive.
- **Formats:** bmp, gif, svg (rendered as a flat image), jpeg/jpg, png, psd, heic/heif, pdf.
- **Limits:** **30 MB per file, 32 MP, 8192×4096 px**. Third-party apps exist to get around the size limit. Sources: https://help.miro.com/hc/articles/360017731613 , https://help.miro.com/hc/articles/360017731013 , https://miro.com/marketplace/large-image-upload/
- **Crop:** crop to shapes such as rectangle, circle, square and others from a dropdown. **Bulk crop and resize** works on many images at once. There is **no freeform mask**; the workaround is to group an image with a shape or with a PNG mask. Sources: https://help.miro.com/hc/en-us/articles/16631693545490 , https://community.miro.com/product-news-31/crop-and-resize-images-in-bulk-13237 , https://community.miro.com/ideas/create-a-mask-with-a-shape-739
- **Replace image:** keeps the position, but often breaks the existing crop or centring.
- **Images and Icons app:** search Unsplash photos and Font Awesome icons, then swap them. It replaced the Iconfinder integration. Unsplash may need admin approval. Source: https://community.miro.com/product-news-31/new-ways-to-search-and-replace-images-and-icons-15592
- **AI:** remove background (1 credit, all plans), alt-text suggestions (free), image to diagram. Source: https://help.miro.com/hc/articles/28782052833170
- **Other:** flip, rotate, lock aspect ratio, opacity [K]. There are **no filters or adjustments** (brightness, contrast, saturation), no blend modes, and no border or shadow styles [K]. Copy/paste style does not work on images. Source: https://community.miro.com/ideas/add-copy-paste-style-support-for-images-borders-shadows-etc-26917
- **Rendering:** images are shown at lower detail when zoomed out and sharpen as you zoom in (users see this as blur). Bitmaps are compressed on upload; Miro-native objects stay vector. Copying an image between boards can lower its resolution. Sources: https://community.miro.com/ask-the-community-45/blurry-images-1794 , https://help.miro.com/hc/articles/360017572754 , https://community.miro.com/ask-the-community-45/images-lose-resolution-when-copying-from-a-miro-board-and-pasting-into-a-new-board-17952

### 2.8 Files and documents
- **Upload:** PDF, spreadsheets (xls, xlsx, csv, ods), and per localised help pages doc/docx/odt/rtf and ppt/pptx/odp.
- **PDFs:** each page is shown and can be browsed. PDFs render as images and blur when exported. Uploading PDFs from mobile is not supported. PowerPoint uploads are capped at 30 MB too, and users want that raised. Sources: https://help.miro.com/hc/ja/articles/360017731613 , https://community.miro.com/ideas/please-increase-powerpoint-ppt-upload-file-limit-15813
- **Video files:** MP4, MOV and WebM **up to 150 MB**, inside Prototypes (Jan 2026). Source: https://community.miro.com/product-news-31/what-s-new-what-we-launched-in-january-2026-27457

### 2.9 Embeds and link previews
- **Pasting a URL** creates a link card (title, favicon, image) or an **embed** (an interactive iframe) for supported services. The display can switch between link, preview and embed [K].
- **Supported services:** YouTube, Vimeo, Figma, Google Docs, Google Sheets, Google Slides, Box, Loom, Spotify, Airtable, CodePen and others [K partly]. A preview appears **only for listed services and only when the media is public**. Converting an embed back to a link preview is a feature request. Sources: https://help.miro.com/hc/articles/360017730993 , https://community.miro.com/ideas/convert-embed-to-link-preview-9135 , https://developers.miro.com/docs/embed-2
- **Embedding Miro elsewhere:** Miro boards and Slides embed in Confluence, Coda, Notion and others ("Live Embed"). Source: https://miro.com/blog/what-we-launched-may-2025

### 2.10 Cards and Kanban
- **Cards:** title, description, assignee (one only; more than one is requested), due date, tags, and custom fields [K]. Shortcut **D**. Source: https://developers.miro.com/docs/card-1
- **App cards:** Jira, Azure DevOps, Asana, Rally, Trello, Salesforce. Jira cards sync both ways. Sources: https://help.miro.com/hc/articles/4408910669714 , https://help.miro.com/hc/en-us/articles/33772179950482-Jira-cards-in-Tables-and-Timelines-FAQ
- **Kanban:** since Nov 2025, Kanban is a **view of Tables**, next to the Table and Timeline views over the same data. Columns come from a **single-select field**. Swimlanes come from grouping. You can sort and filter. The older Columns widget is legacy. Sources: https://miro.com/blog/whats-new-november-2025/ , https://help.miro.com/hc/articles/29188841316114 , https://help.miro.com/hc/articles/360022846473

### 2.11 Tables and Timeline
- **Tables:** a structured database object on the canvas with text, tags, colours and custom fields (text, single-select, number, date, people and others [K partly]).
- **Views:** Table, **Timeline** (Gantt-like) and Kanban.
- **Other features:** table version history (restore as a copy or replace the current version), **structure locking** (Mar 2026), **Jira issue import** (Apr 2026), and Jira fields that sync both ways (Title, Description, Due date; Status and Assignee are in beta).
- **AI:** generate tables at 5 credits.
- Sources: https://community.miro.com/product-news-31/miro-tables-is-live-for-all-users-share-your-questions-and-feedback-here-21082 , https://help.miro.com/hc/en-us/articles/32602293118226-Tables-history , https://miro.com/blog/whats-new-april-2026/

### 2.12 Mind maps
- **Keys:** Tab adds a child node and Enter adds a sibling, per community; some users want the two swapped.
- **Layout:** branches to the right, left or both sides; collapse and expand branches; style nodes [K].
- **Limitations:** paste style does not work between mind map nodes. Keyboard navigation inside a map is limited.
- **AI:** generate a mind map from a prompt.
- Sources: https://community.miro.com/ideas/shortcut-key-for-adding-new-child-and-sibling-nodes-3081 , https://community.miro.com/ask-the-community-45/solved-paste-style-missing-on-mind-map-nodes-15728

### 2.13 Docs, Slides, Prototypes, Code
- **Docs (Miro Docs):** rich documents on the canvas made of blocks. Cmd+D duplicates a block and Ctrl/Cmd+E formats inline code. Slash commands are assumed [K?]. AI can turn stickies into a Doc. Source: https://help.miro.com/hc/en-us/articles/20164660410898-Docs-in-Miro
- **Slides (Miro Slides, 2025):**
  - A deck container on the canvas.
  - Focus mode edits one slide at a time.
  - Presenter notes; slides can be reordered.
  - **Lanes** group slides into sections (May 2025).
  - Embeds in other boards, Confluence, Coda and Notion (June 2025).
  - **AI Slides:** 5 credits per slide (Feb 2026).
  - Sources: https://miro.com/blog/what-we-launched-may-2025 , https://help.miro.com/hc/articles/25542531289234
- **Prototypes:** a paid add-on for Starter, Business and Enterprise.
  - Multi-screen flows with hotspots.
  - Mobile frame presets.
  - Video upload.
  - Screenshot to prototype (Mar 2026).
  - Figma import and handoff to Figma.
  - AI at 5 credits per screen.
  - Source: https://www.gend.co/blog/miro-prototypes
- **Code block:** syntax highlighting for about 15 languages (plain text plus 14). Change the language, font size and line numbers. Brackets and indentation close automatically, and editor hotkeys work. Users have requested PHP, YAML, XML and Kotlin. Sources: https://medium.com/miro-engineering/why-we-developed-a-code-block-widget-in-miro-f6c5ec23085c , https://community.miro.com/product-news-31/write-code-in-miro-and-ship-better-quality-software-10544

### 2.14 Emoji, stickers and GIFs
- A built-in **Stickers and emoji app** with three tabs: Stickers, Emojis and GIFs.
- **Interactive stickers** change appearance when clicked, for example to show agreement.
- GIFs, clips and stickers come through the **KLIPY** marketplace app.
- Sources: https://help.miro.com/hc/en-us/articles/360016026559-Emojis , https://miro.com/marketplace/klipy/

### 2.15 Templates
- Miro's own template library, plus **Miroverse**, a community gallery of thousands of templates. Miroverse took in 227 new templates in Aug 2026 and about 100 in Sep 2026, many of them AI or Flows templates.
- **Custom team templates** are a paid feature.
- More than 80 templates have Sidekicks and Flows built in.
- Sources: https://help.miro.com/hc/articles/360012972300 , https://miro.com/blog/miroverse-august-2026/ , https://miro.com/blog/miroverse-september-2026/ , https://miro.com/blog/2025-recap/

### 2.16 Comments
- Comments are pins on the board or attached to objects. **@mentions** work for users and groups and send notifications; @mentions in text objects do not notify.
- Threads support replies. You can **pin** threads open, **resolve** them, and filter to show resolved ones.
- The Comments/Activity panel opens from the top-right collaboration toolbar. You can **follow** all threads on a board or a single thread.
- **Who can mention:** guests can mention only people invited directly to the board. Visitors cannot mention anyone.
- On mobile, tap and hold to comment.
- Shortcut **C**.
- Source: https://help.miro.com/hc/en-us/articles/360017730873-Comments

---

## 3. Editing

| Feature | Detail | Source |
|---|---|---|
| Copy, cut, paste, duplicate | Ctrl/Cmd+C, X, V and **Ctrl/Cmd+D** (duplicate). Alt or Option-drag duplicates [K]. | https://miro.com/shortcuts/ |
| Paste behaviour | Pasting spreadsheet cells creates stickies (or a table [K]). An image on the clipboard pastes as an image. A URL pastes as a link card or embed. Text pastes as a text object or sticky [K]. Formatting from outside apps is stripped, except lists. | https://help.miro.com/hc/articles/360017572054 , https://help.miro.com/hc/articles/360017572094 |
| Copy and paste style | **Ctrl/Cmd+Alt/Option+C** copies style and **Ctrl/Cmd+Alt/Option+V** pastes it; both are also in the right-click menu. Works on shapes, text and stickies. **Does not work on images or between mind map nodes. Size is not copied.** There have been regression bugs. | https://community.miro.com/ask-the-community-45/resolved-copy-paste-formatting-ctrl-alt-c-v-no-longer-working-11621 , https://community.miro.com/wish-list-32/match-size-paste-size-mechanism-would-be-useful-727 |
| Copy as image | Copies the selected objects to the clipboard as an image. A known issue: whatever is behind the objects is captured too. | https://help.miro.com/hc/articles/4413451973266 , https://community.miro.com/ask-the-community-45/resolved-copy-as-image-is-not-working-10051 |
| Multi-select | Shift-click, drag a marquee, Ctrl/Cmd+A, or the lasso [K]. | — |
| Align and distribute | Context menu: align left, centre, right, top, middle, bottom; distribute horizontally or vertically. **Grouped objects and objects inside tables cannot be aligned.** | https://help.miro.com/hc/articles/360017730973-Structuring-Board-Content , https://supademo.com/blog/how-to-align-objects-in-miro |
| Auto layout / tidy up | **Auto layout** arranges the selection into rows within a width, with a spacing slider. **Create cluster** puts stickies in a neat grid. The old Grid mode is gone. Smart alignment is unconfirmed. | https://community.miro.com/changelog-discussion-31/auto-layout-and-other-ux-improvements-1225 |
| Resize, rotate, flip | Corner and edge handles; Shift keeps proportions [K]. Rotate by handle or by exact degrees [K]. Flip horizontal and vertical for images and shapes [K]. W/H can be typed into fields [K]. Arrow keys nudge (users want finer nudging). | https://community.miro.com/ideas/greater-zoom-and-or-smaller-object-nudges-8049 |
| Undo and redo | Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z or Ctrl+Y [K]. | — |
| Activity history | **Board → History → Activity**: a change log kept for **90 days** that can restore recently deleted objects to their original place. Viewers and commenters cannot see it. | https://help.miro.com/hc/articles/360017730913 |
| Version history | **History → Versions:** snapshots taken automatically (hourly and at the end of each session, per a 2021 post). Restore a whole version. **Paid plans only.** You cannot make a version manually (requested). Free-plan versions are not available after an upgrade. | https://community.miro.com/product-news-31/board-history-now-available-on-team-business-consultant-enterprise-and-education-plans-5294 , https://community.miro.com/ideas/version-history-1563 |
| Find | **Ctrl/Cmd+F** on a board finds text in objects, highlights matches and dims everything else. Filter by category (stickies, tags and others). | https://help.miro.com/hc/articles/360018109534 |
| Find and replace | **Not built in.** Available through the marketplace app "Super Search", which also supports regex. | same , https://us.miro.com/marketplace/super-search/ |
| Link objects | Link any object to another object, frame, board or URL [K]. | — |

### 3.1 Keyboard shortcuts

The official list opens with **F1**, or from ? → Help and resources → Keyboard shortcuts. Shortcuts **cannot be customised**. Sources: https://miro.com/shortcuts/ , https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys

**Tools (single keys)**

| Key | Tool |
|---|---|
| V | Select |
| H | Hand |
| T | Text |
| N | Sticky note |
| S | Shapes |
| R | Rectangle |
| O | Oval |
| L | Connection line |
| P | Pen |
| E | Eraser |
| C | Comment |
| F | Frame |
| D | Card |
| M | Minimap |

**Editing**

| Shortcut | Action |
|---|---|
| Ctrl/Cmd+D | Duplicate |
| Ctrl/Cmd+G | Group |
| Ctrl/Cmd+Shift+G | Ungroup |
| Ctrl/Cmd+Shift+L | Lock or unlock (one source gives Ctrl+L) |
| PgUp / PgDn | Bring to front / send to back |
| Ctrl/Cmd+Alt+C, Ctrl/Cmd+Alt+V | Copy style, paste style |
| Ctrl/Cmd+B, Ctrl/Cmd+I | Bold, italic |
| Ctrl/Cmd+K | Link [K] |
| Enter | Edit the selected object |
| Esc | Stop editing |

**View**

| Shortcut | Action |
|---|---|
| Ctrl/Cmd + / − | Zoom in and out |
| Alt+1 | Zoom to fit |
| Alt+2 | Zoom to selection |
| Ctrl/Cmd+F | Find |

There is no shortcut for mind maps or for individual tools inside the pen tray (both requested).

---

## 4. Organisation

- **Hierarchy:** Organisation → Teams → **Spaces** (formerly Projects) → Boards. There are **no true folders**. "Sections" (sub-folders inside Spaces) were promised in the community but their status is unclear. Sources: https://help.miro.com/hc/articles/360017571294 , https://community.miro.com/ask-the-community-45/folders-18713
- **Dashboard:** Recent (across teams), **Starred**, Shared with me, the board list (sort by last opened or modified, filter by owner) and Spaces. Users report that Starred and Recent now show only the current organisation's boards. Source: https://help.miro.com/hc/articles/360017571294
- **Search:**
  - All plans: dashboard search on titles.
  - Starter, Business, Enterprise and Education: full-text search over widgets, comments and stickies.
  - Business and Enterprise: search across all teams.
  - Free: filter by owner only.
  - Sources: https://help.miro.com/hc/en-us/articles/360012140959-Search-in-Miro , https://community.miro.com/product-news-31/introducing-advanced-dashboard-search-capabilities-15303
- **Templates:** see §2.15. A board can be saved as a custom template (paid).
- **Board backups:**
  - Format: **.rtb**, which is proprietary (it contains canvas JSON).
  - Who can save one: owners, co-owners, and Enterprise Content Admins.
  - **Maximum backup size: 1 GB.** Up to **200 MB** can be restored in the UI (Create new → Import → Import backup); larger files need Support.
  - **Restoring needs a paid plan.**
  - Other tools (Lucid and so on) cannot read .rtb.
  - Sources: https://help.miro.com/hc/articles/360017572774 , https://community.lucid.co/product-questions-3/how-to-restore-a-miro-board-backup-file-rtb-and-import-into-lucid-11065
- **Board actions [K]:** duplicate board, move to another Space or team, change owner, archive or delete (trash, restorable for a period), board description, board thumbnail/cover.

---

## 5. Collaboration

| Feature | Detail | Source |
|---|---|---|
| Real-time multiplayer | Live cursors with name labels; the board settings can hide collaborators' cursors. An avatar stack in the top-right shows who is on the board. Name labels appear on objects someone is editing (users asked to be able to hide these). | https://help.miro.com/hc/articles/360017572834 , https://community.miro.com/ideas/hide-avatar-name-label-that-appears-when-someone-is-editing-moving-an-object-2279 |
| Attention management | **Follow** a collaborator. **Bring to me** pulls one collaborator to your view; **Bring everyone to me** pulls everyone. People follow until they choose to exit. Facilitators can also lock the board or hide cursors [K]. | https://help.miro.com/hc/articles/360012753200 |
| Voting | A voting session with a set number of votes per person [K], anonymous or not, and a time limit. You can add minutes or end at any time. Participants can see who has finished. Results appear in a panel. **Team members with edit rights** start sessions; anyone on the board can vote. Not on Free. | https://help.miro.com/hc/articles/9794413310482 |
| Timer | A countdown everyone shares. Pause, add time, and choose royalty-free background music. Not on Free [?]. | https://help.miro.com/hc/articles/360017572274 |
| Reactions | Emoji reactions on objects. Live screen reactions float across everyone's view from the collaboration toolbar [K]. | https://miro.com/workshops/ |
| Private mode | New and edited stickies are hidden from others until private mode ends, which reveals them all. The facilitator can let anyone end it ("Allow anyone to turn off"); otherwise only board owners and Enterprise Company Admins can. Metadata such as "created by" is **not** hidden. | https://community.miro.com/product-news-31/avoid-group-bias-with-private-mode-on-sticky-notes-13060 , https://community.miro.com/ask-the-community-45/private-mode-does-not-hide-the-created-by-and-last-modified-by-information-24356 |
| Anonymous mode | Hides identities during collaboration (2023). | https://community.miro.com/product-news-31/you-wanted-anonymous-mode-we-built-it-14495 |
| Miro Engage (2026) | Live polls, Q&A and word clouds; a 2×2 matrix and quizzes are planned. Participants join **with a QR code and no account**, and responses land on the board. In beta in Jan 2026; generally available by May 2026. | https://miro.com/blog/whats-new-january-2026/ , https://miro.com/blog/whats-new-may-2026/ |
| Video and audio | **Built-in video chat** on the board with screen sharing; historically up to 25 participants. Recordings are saved to the Library. There are apps for **Zoom**, Microsoft Teams (embedded in channels, calendar and meetings) and Webex. | https://community.miro.com/ask-the-community-45/multiple-boards-live-with-video-and-up-to-80-guests-1618 , https://miro.com/blog/miro-app-for-zoom/ , https://help.miro.com/hc/en-us/articles/360012756459 |
| Talktrack | An async **board recorder**: it records your movements on the board, not your screen, with your camera bubble on top. Shows who watched. Lives in the Library. Free users get **5 Talktracks**; Starter and above are unlimited. Downloading a recording was not possible earlier. | https://help.miro.com/hc/articles/7825622973330 , https://miro.com/talktrack |
| Board chat | A chat panel on the board [K]. | — |
| Notifications | For comments and mentions, sent by email, in the app or to Slack and Teams [K partly]. | https://help.miro.com/hc/articles/360017730873 |
| Sharing roles | Invite by email as **Owner, Co-owner, Editor, Commenter or Viewer** [K]. Team access settings control who in the team can see the board. | https://help.miro.com/hc/en-us/articles/360017572194-Board-access-rights |
| Public link | "Anyone with the link": no access, **Can view, Can comment or Can edit**. Edit access through a public link was unavailable on Free in the past. | https://help.miro.com/hc/articles/360012524559 |
| Password protection | For public links, on paid plans (Team, Business, Consultant and Education when it launched). | https://community.miro.com/changelog-discussion-31/password-protection-for-public-boards-now-available-on-team-business-consultant-and-education-plans-2009 |
| Link expiry | The help article has a "Public link expiration" section, but its content was not confirmed. It is likely set by an admin or on Enterprise [?]. Requested in the community. | https://community.miro.com/wish-list-32/public-link-expiration-and-password-enforcement-2954 |
| Visitors | People without an account who open a public link. Free, unlimited on paid plans [K]. They can edit if the link allows it (anonymous guest editors). Enterprise admins can block public sharing. | https://help.miro.com/hc/articles/360017730813 , https://community.miro.com/changelog-discussion-31/anonymous-guest-editors-400 |
| Guests | Invited by email to a specific board, without being team members. **Not on Free; Business and above.** | https://help.miro.com/hc/articles/4403634496402 |
| Embed | Embed a board as an iframe or Live Embed in other tools. The board must be public, which needs a paid plan. | https://help.sana.ai/en/articles/7417-the-embed-card |
| Board access requests | Users without access can request it, and the owner approves [K]. | — |
| Enterprise controls | **Enterprise Guard** add-on: automated data classification (labels can be imported from Microsoft Purview), rules on sharing and copying, audit logs (30–365 days, Audit Log API, SIEM). Also SCIM, SSO (Business and above), and Company Admin and Security Admin roles. | https://miro.com/products/enterprise-guard/ , https://www.gend.co/blog/miro-enterprise-guard |

---

## 6. Import and export

### 6.1 Export
- **Board, area or frame as an image:** Small, Medium or Large, or **Vector** (saved as **PDF or SVG**, which keeps quality on big boards). The sizes available depend on the plan; **Free gets low quality only**.
- **PDF:** each frame becomes a page. Choose "Small file size" (no embedded links) or "Best quality".
- **CSV:** sticky, card and table text. Not supported in Opera, old Edge, or on tablet and mobile.
- **Exporting part of a board:** board menu ⋯ → Save as image, then select an area. For a frame: frame menu → Export as image.
- **Copy as image** to the clipboard.
- **Board backup** (.rtb).
- **Known problems:** uploaded PDFs export as blurry pictures even in vector mode. Very large boards fail; export frames separately. Exported frames can show a white edge line. SVG export can include a grey background rectangle. Transparent PNG export is requested.
- **Mobile app:** cannot export.
- **Not confirmed:** a native PPTX or Google Slides export [?].
- Sources: https://help.miro.com/hc/en-us/articles/360017572754-Board-export , https://help.miro.com/hc/en-us/articles/360020567820-Board-export-issues , https://community.miro.com/ask-the-community-45/grey-rectangle-in-background-when-exporting-as-svg-27811

### 6.2 Import
- **Files:** images, PDF, Office and OpenDocument files, CSV and spreadsheets (as stickies or a table), video (inside Prototypes).
- **Cloud storage:** Google Drive, Dropbox (not in the iPad app), Box, OneDrive.
- **Dashboard → Import from other tools:** Mural, Lucidspark, Lucidchart (PDF or VSDX), **Visio (VSDX)**, **draw.io**, Jamboard, FigJam. Diagrams can be **bulk imported**, one board per file. Imports always go to a **new** board, and changes sync one way only. Sources: https://help.miro.com/hc/en-us/articles/18656338276626-Import-content-from-other-tools-to-Miro , https://help.miro.com/hc/en-us/articles/32657459157778-Bulk-import-diagrams-to-Miro
- **Jira:** import issues as cards or into Tables (Apr 2026). **Asana, Azure DevOps** cards. Trello through an app.
- **Markdown import** (Apr 2026). Source: https://miro.com/blog/whats-new-april-2026/
- **Figma:** files go into Prototypes. Screenshots convert to prototypes.
- **Web URL to content:** Flows can fetch the content behind a URL (Feb–Mar 2026).
- Mermaid and PlantUML work through community apps or the MCP [K?].

### 6.3 Integrations and platform
- **Marketplace:** 250+ apps, with collections for Microsoft 365, Google Workspace and Atlassian. Source: https://miro.com/marketplace/
- **Known integrations:**
  - Atlassian: Jira (cards, two-way sync, Tables and Timeline), Confluence embed.
  - Microsoft: Teams.
  - Video: Zoom, Webex.
  - Work management: Asana, Azure DevOps/Azure Cards, Rally, Trello, Salesforce.
  - Design: Figma (embed, import, prototype handoff).
  - Cloud storage: Google Drive, Dropbox, Box, OneDrive.
  - Chat: Slack (notifications and link unfurls [K]).
  - Images and icons: Unsplash, Font Awesome, KLIPY, Picsart (background removal and upscaling).
  - Docs and wikis: Notion and Coda (embedding Slides).
  - Data: Microsoft Purview.
  - Sources: https://help.miro.com/hc/articles/4408910669714 , https://miro.com/marketplace/picsart/
- **2026 Connectors:** Slack, Atlassian, Granola, GitHub and others, bringing outside context into Sidekicks and Flows (May 2026). Source: https://miro.com/blog/whats-new-may-2026/
- **Developer platform:** REST API (boards, items, connectors, frames, tags and more), Web SDK (in-board apps), Live Embed, and webhooks [K].
- **Official hosted MCP server:**
  - OAuth 2.1; respects board permissions.
  - Works on every plan, including Free.
  - About 56 tools; the canvas is read and written as **SVG** (`canvas_read_as_svg`, `canvas_create_from_svg`, `canvas_update_from_svg` applied as diffs).
  - Covers boards, frames, comments, shapes, code blocks, tables and prototypes.
  - Native Miro connector inside **ChatGPT, Claude and Microsoft Copilot** (Canvas 26).
  - Sources: https://docs.scalekit.com/agentkit/connectors/miromcp/ , https://miro.com/newsroom/miro-takes-aim-at-the-gap-between-ai-potential-and-organizational-reality

---

## 7. AI features (Miro AI)

### 7.1 Credits
- **Allowance:** Free gets **10 per team per month** (some sources say 25). Starter gets **25 per member per month**, Business **50 per member per month**, Enterprise **100 per licence per month** (or a pooled 2,500+ in some sources).
- **Cost per action:**

| Action | Credits |
|---|---|
| Most actions (text, stickies, remove background) | 1 |
| Sidekick message | 2 |
| AI image | 3 |
| Tables | 5 |
| Slides | 5 per slide |
| Prototypes | 5 per screen |
| Alt text | Free |
| Failed generation | Free |

- An **AI credits add-on** raises the limit but adds no features.
- Sources: https://help.miro.com/hc/en-us/articles/19756209116178-Miro-AI-Credits-and-AI-Add-On , https://miro.com/ai/diagram-ai/

### 7.2 Features
| Feature | What it does | Source |
|---|---|---|
| **Create with AI** (left toolbar) | Generates content from a prompt as diagrams, mind maps, stickies, docs, tables, slides, prototypes or images. | https://help.miro.com/hc/articles/28782102127890 |
| Diagram and mind map generation | Mind maps, flowcharts, ER diagrams, UML sequence and UML class diagrams. The prompt can set the style. The output is native and editable. One credit per diagram. | same , https://miro.com/ai/mind-map-ai/ |
| Sticky note AI | Generates ideas as stickies, **clusters** them by keyword or sentiment, **summarises** them, and turns them into a Doc. | https://help.miro.com/hc/en-us/articles/28781881506834 |
| Image AI | **Remove background** (all plans), alt-text suggestions, image or sketch to editable diagram (limited availability), AI image generation (3 credits). Generation inside Miro is only partly confirmed. | https://help.miro.com/hc/articles/28782052833170 |
| Docs, Tables, Slides | Generate a doc, a table or a slide deck from the board or a prompt. **AI Slides** launched Feb 2026. | https://www.gend.co/blog/miro-february-2026-updates |
| Prototypes AI | Prompt to a multi-screen prototype. **Screenshot to prototype** (Mar 2026). Figma import and handoff. | https://miro.com/blog/whats-new-march-2026/ |
| **Sidekicks** (Canvas 25, Oct 2025) | Conversational AI agents that read **everything already on the canvas** (multimodal). Role-based ones exist (research, planning, diagramming and others). **Custom Sidekicks** need Business, or Enterprise with the AI Workflows add-on. **May 2026:** agentic in private beta, breaking goals into steps and asking clarifying questions. They also gained persistent **memory**, **two-way voice chat**, and the ability to generate whole boards from one prompt. | https://help.miro.com/hc/articles/29902701849618 , https://miro.com/blog/whats-new-may-2026/ |
| **Flows** (Canvas 25) | Visual multi-step AI workflows built from chained blocks on the canvas, e.g. feedback → insights → PRD → prototype. Mar 2026 added PDF input, **web URL fetch** and **table structure locking**. May 2026 added **Connectors** to outside tools, with steps that wait for human approval. | https://miro.com/whats-new/ , https://releasebot.io/updates/miro |
| AI Workflows | The packaged Sidekicks and Flows. Out of beta Jan 2026. **Included in Business; a paid add-on for Enterprise.** | https://miro.com/newsroom/miro-launches-ai-workflows/ , https://miro.com/pricing |
| Miro Insights | Brings in feedback from CRM, support tickets and other tools, then AI turns it into insights and recommendations on what to build (part of "Miro for Product Acceleration"). | https://miro.com/blog/canvas-25-top-ten-product-highlights/ |
| Custom Blueprints | Reusable AI or Flows patterns (Feb 2026). | https://www.gend.co/blog/miro-february-2026-updates |
| Earlier AI (2023–24) | "Miro Assist", AI action shortcuts, intelligent templates, and intelligent widgets [K partly]. | https://www.uctoday.com/?p=74253 |
| Mobile AI | Miro AI and Sidekicks are available in the mobile app. | https://help.miro.com/hc/articles/360017572834 |
| Enterprise AI controls | Admins can turn AI on or off and choose data and model settings [K]. | — |

---

## 8. Platforms

- **Web:** Chrome, Edge, Firefox and Safari; this is the main platform.
- **Desktop apps:** Mac and Windows, both Electron wrappers [K]. **No Linux app.** Some features, such as the timer, have bugs in the desktop app.
- **Tablet apps:**
  - iPad needs iPadOS 15+ and Windows tablets need Windows 10 1607+. Android tablets are also supported.
  - Apple Pencil and palm rejection work.
  - Limitations: no Dropbox plugin, and frames or toolbar tools cannot be reordered by touch.
  - Source: https://help.miro.com/hc/articles/360017731633
- **Phone apps:** iOS 16+ and Android 7+.
  - **Available on phones:** create, view and edit boards; stickies; comments; scan paper post-its; Miro AI and Sidekicks; settings for cursors, grid, snapping and resolved comments; dark mode; VoiceOver.
  - **Not available on phones:** templates, board export, presentation mode, video chat, voting, starred boards, changing the subscription, PDF upload, CSV export.
  - In a mobile browser you can view boards and add comments (tap and hold).
  - Source: https://help.miro.com/hc/articles/360017572834
- **Offline:** **none.** Miro is cloud-only and there are no plans for offline. It is a long-running top request in the community. Source: https://community.miro.com/ideas/offline-mode-925
- **Enterprise app:** a separate "Miro Enterprise" iOS app exists. Source: https://apps.apple.com/us/app/-/id6503446121

---

## 9. Pricing (2026)

Sources disagree; check miro.com/pricing, which this session could not fetch.

| Plan | Price | Main limits and features |
|---|---|---|
| **Free** | $0, unlimited members | **3 editable boards** (older boards become view-only), templates, core tools, basic attention management, 10 AI credits per team per month, **low-quality export only**, **no guests**, no version history, no private boards [K], no backup restore, 5 Talktracks, no voting or timer (per older help), search filters by owner only. |
| **Starter** | **$8** per member per month billed yearly, **$10** billed monthly | **Unlimited and private boards**, high-quality and vector export, custom templates, unlimited visitors with **visitor editing**, timer, voting, Talktrack, version history, board backups, password-protected links, 25 AI credits per member, full-text search, Prototypes add-on available. |
| **Business** | **$20** per member per month yearly, **$25** monthly (older sources: $16 and $20) | Everything in Starter, plus **guests**, **SSO**, cross-team search, advanced diagramming shape packs, unlimited private workspaces [K], 50 AI credits per member, **AI Workflows (Sidekicks and Flows) included**, custom Sidekicks, Prototypes. |
| **Enterprise** | Custom pricing; about **30 members minimum** | Everything in Business, plus **SCIM**, enterprise admin, data residency [K], audit logs, **Enterprise Guard** (add-on), **AI Workflows** (add-on), 100 AI credits per licence (or pooled), the ability to restrict public sharing, and Content Admins. |
| Education / Consultant | Free or discounted | Education gets the paid shape packs. |

Sources: https://saascrmreview.com/miro-pricing/ , https://www.usecarly.com/blog/miro-pricing/ , https://www.aimadefor.com/blog/miro-pricing-2026/ , https://www.8frame.co/blog/miro-pricing-2026 , https://usagepricing.com/blueprint/miro

---

## 10. Using Miro for moodboards

**How designers work in Miro [mostly K, plus templates]:**
- **Templates:** Miro offers moodboard templates (https://www.miro.com/templates/mood-board/ , https://miro.com/moodboard/ux-ui-mood-boards/) and colour palette templates and an extractor (https://miro.com/templates/color-palette-extractor/ , https://www.miro.com/miroverse/miro-color-palettes/).
- **Typical workflow:**
  - Make one **frame** per moodboard or direction.
  - Bring in images by drag-drop from the browser, pasting screenshots, Unsplash search, cloud storage, or "Upload via URL".
  - Crop to shapes.
  - Arrange with Auto layout, clusters or align/distribute.
  - Add swatches as shapes with a hex label.
  - Add type samples as text objects.
  - Annotate with stickies, comments and stickers.
  - Gather feedback by **voting**, **reactions**, comments, Talktrack and presentation mode.
  - Export the frame to PDF or PNG, or share a view link.
- **Colour picking:**
  - The colour picker has a **custom colour editor** that takes HEX and has an **eyedropper** to sample anything on the board, including images.
  - Custom colours are saved to a **personal palette that applies across all the user's boards**.
  - There is **no** automatic palette extraction from an image on the canvas. A separate web tool at miro.com/tools/color-picker does extraction (HEX, RGB, HSB, HSL).
  - Palettes cannot be exported or imported (requested).
  - The "Colour Palettes for Miro" marketplace app drops swatches onto the board.
  - Sources: https://help.miro.com/hc/articles/25286391619986/ , https://www.guideflow.com/tutorial/how-to-add-a-new-color-to-your-palette-using-the-color-picker-on-a-miro-board , https://community.miro.com/ideas/color-palette-management-1358 , https://app.miro.com/marketplace/colour-palettes-for-miro

**Image limits that matter for moodboards:**
- Files are capped at 30 MB, 32 MP and 8192×4096.
- Images blur when zoomed out because of level-of-detail rendering. Bitmaps are compressed. Images can lose resolution when copied between boards.
- Masks are limited to preset crop shapes; there is no custom mask, so you have to overlay a PNG.
- There are no image adjustments, filters, blend modes, borders or shadows.
- Copy/paste style does not work on images.
- Replacing an image breaks its crop.
- There is no masonry or grid auto-layout for images; this is requested at https://community.miro.com/ideas/enhanced-alignment-tools-rows-and-grids-for-images-10767.
- There is no web clipper or browser extension built for moodboarding. Talktrack has a Chrome extension; a clipper is unconfirmed [?].
- GIFs are supported (they animate [K]). Video embeds come from YouTube or Vimeo links.
- Background removal uses AI (1 credit) or the Picsart app.

---

## 11. Gaps and pain points: where a new product could do better

1. **No layers panel**, only bring to front and send to back, and **frames cannot be reordered in z-order**.
2. **No find and replace**; you need a third-party app.
3. **No offline mode**, **no dark mode** on web or desktop, **no Linux app**.
4. **Weak image tools:** preset-shape crops only, no masks, no adjustments, the 32 MP / 30 MB cap, blur from level-of-detail rendering, and replacing an image breaks its crop.
5. **Sticky notes are rigid:** 16 fixed colours, square by default, only 2 fonts, one font per object, and no default size.
6. **No way to set a default connector style.** Connector routing is basic.
7. **Style paste does not include size** and does not work on images or mind map nodes. There are no reusable style presets.
8. **Frame presets are ratios**, so true print sizes such as A-series are imprecise.
9. **Organisation is shallow:** no folders, and starred and recent views are scoped to one organisation.
10. **Export problems:** PDFs embedded in the board export blurry, big boards fail, and transparent PNG and PPTX export are missing.
11. **No manual version snapshots**, and **version history is paid-only**.
12. **Groups:** nested groups break when ungrouped, and grouped objects cannot be aligned.
13. **Presentation:** no laser pointer, smooth transitions were removed, and there is no dual-monitor presenter view.
14. **Mobile:** presenting, voting, templates and export are all missing.
15. **Free plan:** the 3 editable boards limit is the main complaint. The Bending Spoons acquisition makes future pricing uncertain.
16. **Tables:** structured column types are limited, and some Jira fields sync only in beta.

---

## Appendix: main Miro help and product URLs, for re-checking once the hosts are allowed
- Shortcuts: https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys , https://miro.com/shortcuts/
- Navigation: https://help.miro.com/hc/articles/360017731053
- Stickies: https://help.miro.com/hc/articles/360017572054
- Images: https://help.miro.com/hc/en-us/articles/16631693545490
- Upload: https://help.miro.com/hc/articles/360017731013 and formats: https://help.miro.com/hc/articles/360017731613
- Export: https://help.miro.com/hc/en-us/articles/360017572754-Board-export
- Backup: https://help.miro.com/hc/articles/360017572774
- History: https://help.miro.com/hc/articles/360017730913
- Sharing: https://help.miro.com/hc/articles/360012524559 , https://help.miro.com/hc/en-us/articles/360017572194-Board-access-rights
- Presentation: https://help.miro.com/hc/articles/34307373858450-Presentation-mode
- AI credits: https://help.miro.com/hc/en-us/articles/19756209116178
- Board limits: https://help.miro.com/hc/articles/360013588560
- Monthly "What's New" posts: https://miro.com/blog/updates/whats-new/ (Jan–May 2026 posts were found; no Aug–Oct 2026 product posts were indexed)
