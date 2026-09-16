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

## Notes

- **Countdown timezone.** The target is `Date.UTC(2026, 11, 12, 19, 0, 0)` —
  20:00 Africa/Casablanca (UTC+1 in December). The design reference used
  `new Date(2026, 11, 12, 20, 0, 0)`, which resolves to 20:00 in *the viewer's*
  timezone; anchoring to UTC means everyone counts down to the same moment.
- **Scroll reveal** is scoped to a `.js` class set in `<head>`, so the page
  stays fully readable with JavaScript disabled.
- **Responsive** layout verified free of horizontal scroll, overflow and
  clipped text from 320px to 1440px.
- Photo areas are deliberate placeholders at 4:5. No stock photography was
  substituted.

## Outstanding

1. **Tally form URL.** The CTA button still points at the placeholder
   `https://tally.so/r/REPLACE_WITH_FORM_ID`. Swap it in `index.html` before
   sending the link to members.
2. **Logo files.** See `assets/README.md`. Until the two PNGs are added, the
   hero falls back to a text wordmark.
