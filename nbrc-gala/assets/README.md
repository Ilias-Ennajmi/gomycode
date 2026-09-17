# Assets — NBRC Gala

- `nbrc-logo-trimmed.png` — NBRC Run Club Casablanca logo, 2382x3368.
  Used in the hero (130–180px tall) and the footer (40px).
- `homepage-video.mp4` — 480x854, 44s, H.264 + AAC. Played inline in section 01
  behind a click-to-play facade.

If the logo ever fails to load, `script.js` swaps the hero image for a text
wordmark and hides the footer one, so the page never shows a broken-image icon.

## Replacing the video

Keep the same filename, or update `data-video-src` in `index.html` and the
`aspect-ratio` on `.media-frame` in `styles.css` if the new file's dimensions
differ from 480x854.
