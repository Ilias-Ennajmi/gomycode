# Planet Sport Giveaway Picker

A single-page web app for running giveaway draws with a slot-machine-style name animation,
sequential multi-winner rounds, sound effects, confetti, and video/image export of the whole
session. No build step, no JS dependencies. Bebas Neue is self-hosted (works fully offline);
Inter loads from Google Fonts, so an internet connection is needed for that font specifically
(everything else, including recording, works with no network at all).

## Run it

Just open `index.html` in a modern browser (Chrome, Edge, or Firefox recommended for best
`MediaRecorder`/canvas support).

If your browser blocks `file://` access to canvas/audio features, serve the folder instead:

```bash
npx serve giveaway-picker
# or
python3 -m http.server --directory giveaway-picker 8080
```

Then open the printed local URL.

## How it works

1. **Home screen** — set the giveaway name, date, and accent color, then click **Start New
   Giveaway**.
2. **Participants screen** — paste account names (one per line or comma-separated), choose
   how many winners to pick, and optionally allow the same name to win more than once.
3. Click **Start Giveaway** — recording begins immediately, a branded 3‑2‑1 countdown plays,
   then a slot-machine reel spins through the names, decelerating with a bounce before
   locking on a winner.
4. For multiple winners, the app **automatically continues** to the next round (removing
   already-picked names unless duplicates are allowed) until all winners are picked.
5. A **final results screen** lists every winner with a staggered entrance animation.
   Recording stops here, and you can:
   - **Download Video** — the full session (every round + final screen) as a `.webm` file.
   - **Download Final Screen** — a PNG snapshot of the winners screen, watermarked with the
     logo, giveaway name, and date, for sharing.
   - **New Giveaway** — reset and return to the home screen (your settings are remembered).

## Notes

- Recording uses `canvas.captureStream()` + `MediaRecorder` at a high bitrate, so it works
  entirely client-side with no server or external service. The app records straight to `.mp4`
  on browsers that support it natively (Safari, some Chromium builds); everywhere else it
  records a high-quality `.webm`, which plays and uploads fine everywhere (including
  Instagram/TikTok/YouTube) — it just isn't literally named `.mp4`.
- If the browser doesn't support `MediaRecorder`, video download is disabled automatically
  but the image download and the live animation still work.
- Name list is saved to `localStorage` between sessions for convenience.
