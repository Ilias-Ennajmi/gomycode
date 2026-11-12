// Builds the Atelier "Selection" logo system as clean SVGs (glyphs converted to outlines).
const opentype = require('opentype.js');
const fs = require('fs');
const path = require('path');
const [F, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const pf = (w, s) => opentype.loadSync(`${F}/fontsource-playfair-display-5.3.0/package/files/playfair-display-latin-${w}-${s}.woff`);
const italic = pf(400, 'italic'), italicMed = pf(500, 'italic'), italicBold = pf(700, 'italic'), roman = pf(400, 'normal');

const C = { ink: '#141414', paper: '#F5F2EC', blue: '#2F4A6D', blueOnDark: '#8FA8CC' };
const r = (n) => Math.round(n * 100) / 100;

// Glyph path fitted to a target height, placed so its bbox centre lands at (cx, cy).
function glyph(font, ch, height, cx, cy, dx = 0) {
  const probe = font.getPath(ch, 0, 0, 1000).getBoundingBox();
  const size = (1000 * height) / (probe.y2 - probe.y1);
  const p = font.getPath(ch, 0, 0, size);
  const b = p.getBoundingBox();
  const t = `translate(${r(cx - (b.x1 + b.x2) / 2 + dx)},${r(cy - (b.y1 + b.y2) / 2)})`;
  return { d: p.toPathData(2), t };
}

// The mark: selection box (side B) with 4 handles, rotate stem and dot, italic "a" inside.
// Origin = top-left of the selection box.
function markGroup({ B = 96, stroke, fill, dot, aFont = italic, weight = 1 }) {
  const sw = r(B * 0.018 * weight), hs = r(B * 0.094 * Math.sqrt(weight)), stem = B * 0.13, dr = r(B * 0.055);
  const a = glyph(aFont, 'a', B * 0.6, B / 2, B / 2 + B * 0.01, -B * 0.015);
  const h = (x, y) => `<rect x="${r(x - hs / 2)}" y="${r(y - hs / 2)}" width="${hs}" height="${hs}" fill="${stroke}"/>`;
  return `<rect x="0" y="0" width="${B}" height="${B}" fill="none" stroke="${stroke}" stroke-width="${sw}"/>` +
    `<line x1="${B / 2}" y1="0" x2="${B / 2}" y2="${r(-stem)}" stroke="${stroke}" stroke-width="${sw}"/>` +
    `<circle cx="${B / 2}" cy="${r(-stem - dr)}" r="${dr}" fill="${dot}"/>` +
    h(0, 0) + h(B, 0) + h(0, B) + h(B, B) +
    `<path transform="${a.t}" d="${a.d}" fill="${fill}"/>`;
}
const B = 96, pad = B * 0.07, top = B * 0.13 + B * 0.11 + pad; // room for stem + dot
const markW = B + pad * 2, markH = top + B + pad;
const svg = (w, h, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
const markAt = (x, y, o) => `<g transform="translate(${r(x)},${r(y)})">${markGroup(o)}</g>`;

const variants = {
  light: { stroke: C.ink, fill: C.ink, dot: C.blue },
  dark: { stroke: C.paper, fill: C.paper, dot: C.blueOnDark },
  mono: { stroke: C.ink, fill: C.ink, dot: C.ink },
};
for (const [k, v] of Object.entries(variants)) {
  fs.writeFileSync(path.join(OUT, `atelier-mark-${k}.svg`), svg(markW, markH, markAt(pad, top, v), 'Atelier'));
}

// Horizontal lockup: mark + "Atelier" wordmark (cap height = 0.62 × box), optically centred on the box.
function lockup(v) {
  const capH = B * 0.62;
  const probe = roman.getPath('A', 0, 0, 1000).getBoundingBox();
  const size = (1000 * capH) / (probe.y2 - probe.y1);
  const p = roman.getPath('Atelier', 0, 0, size, { kerning: true });
  const b = p.getBoundingBox();
  const gap = B * 0.3;
  const x0 = pad + B + gap;
  const baseline = top + B / 2 + capH / 2; // centre caps on the box
  const word = `<path transform="translate(${r(x0 - b.x1)},${r(baseline)})" d="${p.toPathData(2)}" fill="${v.fill}"/>`;
  const w = x0 + (b.x2 - b.x1) + pad;
  return svg(w, markH, markAt(pad, top, v) + word, 'Atelier');
}
fs.writeFileSync(path.join(OUT, 'atelier-lockup-light.svg'), lockup(variants.light));
fs.writeFileSync(path.join(OUT, 'atelier-lockup-dark.svg'), lockup(variants.dark));

// App icon 1024: maskable (full-bleed) and rounded display version. Mark inside the 80% safe zone.
function appIcon(rounded) {
  const S = 1024, Bi = S * 0.5;
  const groupH = Bi * (0.13 + 0.11) + Bi; // stem+dot+box
  const x = (S - Bi) / 2, y = (S - groupH) / 2 + Bi * 0.24;
  const bg = rounded ? `<rect width="${S}" height="${S}" rx="${S * 0.225}" fill="${C.ink}"/>` : `<rect width="${S}" height="${S}" fill="${C.ink}"/>`;
  return svg(S, S, bg + markAt(x, y, { ...variants.dark, B: Bi, weight: 1.9, aFont: italicMed }), 'Atelier');
}
fs.writeFileSync(path.join(OUT, 'atelier-app-icon.svg'), appIcon(true));
fs.writeFileSync(path.join(OUT, 'atelier-app-icon-maskable.svg'), appIcon(false));

// Favicon (32 grid): simplified — bold italic "a" + blue dot, no box (too fine at 16 px).
{
  const S = 32;
  const a = glyph(italicBold, 'a', 15.5, 14, 18.5);
  const body = `<rect width="${S}" height="${S}" rx="7" fill="${C.ink}"/><path transform="${a.t}" d="${a.d}" fill="${C.paper}"/><circle cx="25" cy="7" r="2.75" fill="${C.blueOnDark}"/>`;
  fs.writeFileSync(path.join(OUT, 'favicon.svg'), svg(S, S, body, 'Atelier'));
}
console.log(fs.readdirSync(OUT).join('\n'));
