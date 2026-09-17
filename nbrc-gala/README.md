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
| 358–559px | 2 x 2 + full-width closer | 2 x 2 | stacked rows |
| 560–1099px | 2 x 2 + full-width closer | 4 up | 3 columns |
| >= 1100px | 5 cards in one row | 4 up | 3 columns |

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

## Video

Section 01 holds an Instagram reel behind a click-to-play facade. The iframe is
injected only on click, so no third-party frame, script or cookie loads for
visitors who never press play — verified: the page contacts no Instagram host
before the click. The facade is 4:5; the playing frame is 15:32, sized for the
reel plus Instagram's embed chrome. A link beside it opens the reel on
Instagram as a fallback.

The embed only works while the reel is public.

## Accessibility

All text was measured against its real painted background. Three fixes came out
of it, and they deviate from the handoff tokens on purpose:

- `--muted` darkened from `#8A8175` to `#726B5F` — the original is 3.5:1 on
  cream, under the 4.5:1 minimum for the small labels it is used on.
- `--red-on-dark` (`#F2616E`) added for red text on the ink panels; brand red
  is only 2.9:1 there.
- Text on the red stat card raised from 78% to 92% white (3.9:1 -> 5.0:1).

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

1. **Logo files.** See `assets/README.md`. Until the two PNGs are added, the
   hero falls back to a text wordmark.
2. **Dress code wording** is written from the site's own language ("soirée
   habillée"). Replace with the exact wording if there is one.
3. **"Rekza"** spelling to confirm.
