# Assets — NBRC Gala

- `nbrc-logo-trimmed.png` — NBRC Run Club Casablanca logo, 2382x3368.
  Used in the hero (130–180px tall) and the footer (40px).
- `homepage-video.mp4` — 480x854, 44s, H.264 + AAC. Played inline in section 01
  behind a click-to-play facade.
- `homepage-video-poster.jpg` — a real event photo (480x854, centre-cropped
  to match the video's own dimensions exactly, so the post-click `<video>`
  frame never letterboxes it). Doubles as the facade's thumbnail image
  before the viewer presses play, and as the `<video poster>` shown while
  it buffers after the click — so there is never a blank or grey box, only
  ever this still or the playing video.
- `planet-sport-logo.png` — Planet Sport logo, 863x296, transparent
  background. Used in its own "Organisé par" section right after the final
  CTA panel, sized 40-56px tall (not a quiet footer credit).
- `social-share.jpg` — 1200x630 link-preview card (Open Graph / Twitter
  Card), built from the same video-poster photo and the page's own type and
  colour. Without this, sharing the link in WhatsApp or elsewhere showed a
  bare text card with no image.

If any logo fails to load, `script.js` swaps it for text instead of a
broken-image icon: the hero and Planet Sport logos fall back to a wordmark,
the footer NBRC logo just hides (its "NBRC Casablanca" label already sits
next to it).

## Replacing the video

Keep the same filename, or update `data-video-src` in `index.html` and the
`aspect-ratio` on `.media-frame` in `styles.css` if the new file's dimensions
differ from 480x854. If you do, also regenerate the poster from the new file
and update `data-video-poster` / the facade `<img>` to match.
