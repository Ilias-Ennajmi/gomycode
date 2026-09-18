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

Section 01 holds `assets/homepage-video.mp4` (480x854, 44s, H.264 + AAC,
faststart) behind a click-to-play facade. The `<video>` element is created only
on click, so the 6 MB file is never fetched for visitors who scroll past —
verified: no mp4 request before the click. Self-hosted, so no third party is
involved at all. Playback is inline (`playsinline`), and if the browser blocks
autoplay with sound the script retries muted so the click always plays.

## Typography

- Headlines and titles: **Raleway**
- Body, labels and UI: **Inter**

Both via Google Fonts. Inter replaced Open Sans: the two humanist sans read
flat together, and Inter's tighter, more even spacing is cleaner at the 9–13px
label sizes this page leans on, which lets Raleway carry the headings. Lato was
the other candidate but Google serves it at only three weights (400/700/900)
and this design uses 500/600/800.

Note: "Runway" was requested but is not published on Google Fonts; Raleway is
the closest available match. To use the real Runway, the licensed font files
need to be self-hosted in `assets/`.

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
- The logo is a tall vertical lockup (2382x3368). The handoff's 76px hero
  height left its type unreadable, so it is scaled to 130/160/180px by
  breakpoint, and 40px in the footer.

## Outstanding

1. **Font.** Raleway stands in for Runway — see Typography above.
2. **Dress code wording** is written from the site's own language ("soirée
   habillée"). Replace with the exact wording if there is one.
3. **"Rekza"** spelling to confirm.
