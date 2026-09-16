# NBRC Gala — Landing Page

Single-page invitation/RSVP site for the NBRC Casablanca 2nd anniversary gala
(Sat 12 December 2026, 20h00, Hôtel Marriott — Av. des FAR).

Rebuilt from the design handoff as a plain static site: no framework, no build
step. Open `index.html` directly, or serve the folder with any static server.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Markup and inline SVG icons |
| `styles.css` | Design tokens and all layout |
| `script.js` | Scroll reveal, countdown, logo fallback |
| `assets/` | Logo files (see `assets/README.md`) |

## Deployment

Deployed to Vercel as the project `nbrc-gala`:

- https://nbrc-gala.vercel.app

It is a static deployment — the files above are uploaded as-is, with no build.

## Responsive behaviour

| Width | Programme | Stats | Steps |
| --- | --- | --- | --- |
| < 358px | 1 col | 2 x 2 | stacked rows |
| 358–559px | 2 x 2 | 2 x 2 | stacked rows |
| 560–1099px | 2 x 2 | 4 up | 3 columns |
| >= 1100px | 5 tracks, wide card spans 2 | 4 up | 3 columns |

Text is centre-aligned below 900px so the page reads down a single spine;
from 900px it returns to the handoff's left-aligned cards and story copy.

## Motion

- Sections cascade in on scroll, with staggered children.
- Sticky nav gains an elevated state plus a scroll-progress line.
- Hero drifts and eases out on scroll (full opacity held through the first
  quarter so the headline is not washed out while still on screen).
- Countdown animates only the digit that changes.
- Section rules draw in on reveal.

All of it is driven by one rAF-throttled scroll handler. `prefers-reduced-motion`
disables every animation and shows all content immediately.

## Notes

- **Countdown timezone.** The target is `Date.UTC(2026, 11, 12, 19, 0, 0)` —
  20:00 Africa/Casablanca (UTC+1 in December). The design reference used
  `new Date(2026, 11, 12, 20, 0, 0)`, which resolves to 20:00 in *the viewer's*
  timezone; anchoring to UTC means everyone counts down to the same moment.
- **Scroll reveal** is scoped to a `.js` class set in `<head>`, so the page
  stays fully readable with JavaScript disabled.
- **Verified** free of horizontal scroll, overflow and clipped text at 320,
  360, 375, 390, 414, 560, 768, 900, 1100, 1280 and 1440px, with reduced-motion
  and no-JavaScript paths checked separately.
- Photo areas are deliberate placeholders at 4:5. No stock photography was
  substituted.

## Outstanding

1. **Tally form URL.** The CTA button still points at the placeholder
   `https://tally.so/r/REPLACE_WITH_FORM_ID`. Swap it in `index.html` before
   sending the link to members.
2. **Logo files.** See `assets/README.md`. Until the two PNGs are added, the
   hero falls back to a text wordmark.
