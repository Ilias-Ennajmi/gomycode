# Giveaway Winner Picker

A self-contained, single-page web app for running giveaway draws with a slot-machine-style
name animation, sequential multi-winner rounds, sound effects, confetti, and video/image
export of the whole session. No build step, no dependencies.

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

1. **Setup screen** — paste account names (one per line or comma-separated), choose how
   many winners to pick, and optionally allow the same name to win more than once.
2. Click **Start Giveaway** — recording begins immediately and a slot-machine reel spins
   through the names, decelerating with a bounce before locking on a winner.
3. For multiple winners, the app **automatically continues** to the next round (removing
   already-picked names unless duplicates are allowed) until all winners are picked.
4. A **final results screen** lists every winner. Recording stops here, and you can:
   - **Download Video** — the full session (every round + final screen) as a `.webm` file.
   - **Download Final Screen** — a PNG snapshot of the winners screen, for sharing.
   - **New Giveaway** — reset and run another draw (your name list is remembered).

## Notes

- Recording uses `canvas.captureStream()` + `MediaRecorder`, so it works entirely client-side
  with no server or external service.
- If the browser doesn't support `MediaRecorder`, video download is disabled automatically
  but the image download and the live animation still work.
- Name list is saved to `localStorage` between sessions for convenience.
