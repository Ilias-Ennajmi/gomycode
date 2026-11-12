/*
 * Palette exports as pure functions: Adobe Swatch Exchange (.ase), Procreate (.swatches), CSS custom properties, Tailwind
 * v4 @theme tokens and a Tailwind config object, and JSON. Each takes coloured, named swatches and returns bytes or text;
 * nothing here touches the DOM (lib/download.ts saves the result).
 *
 * Every function skips entries whose hex is not a colour (exportPalette counts them), gives unnamed colours their hex as a
 * name, and gives duplicate names a numeric suffix. Names are cleaned (no path separators, control or bidi characters,
 * 64-character cap, unicode kept) and slugs are [a-z0-9-] only, so a colour name can never inject markup, CSS or script.
 *
 * !! MANUAL VERIFICATION NEEDED !!  Two of these formats are third-party and can only be checked by opening the files:
 *   - ASE follows the published block layout (header "ASEF" 1.0, colour block 0x0001 with "RGB " float32, group blocks
 *     0xC001/0xC002); the unit tests decode it independently and compare golden bytes, but import it once into a desktop
 *     design app (Photoshop, Illustrator, Affinity, ...) to be sure.
 *   - Procreate's `.swatches` layout is written from memory of the format: a ZIP holding `Swatches.json`, an array of
 *     palettes { name, swatches: 30 slots }, each swatch { hue, saturation, brightness (0..1, HSB), alpha, colorSpace,
 *     origin } and null for empty slots. Procreate has no public spec: open the file in Procreate on an iPad before
 *     relying on it. If it is rejected, the JSON written here is the only thing to adjust (see toProcreateSwatches).
 */
import { strToU8, zipSync } from "fflate";
import { sanitizeFileName } from "@/lib/download";
import { formatColor, hexToRgb, rgbToHex } from "@/lib/engine/model/color";

export type NamedColor = { hex: string; name: string; weight?: number };

export type PaletteFormat = "ase" | "procreate" | "css" | "tailwind" | "tailwind-config" | "json";

export const PALETTE_FORMATS: readonly { id: PaletteFormat; label: string; extension: string }[] = [
  { id: "ase", label: "Adobe Swatch Exchange (.ase)", extension: "ase" },
  { id: "procreate", label: "Procreate (.swatches)", extension: "swatches" },
  { id: "css", label: "CSS variables", extension: "css" },
  { id: "tailwind", label: "Tailwind v4 theme", extension: "css" },
  { id: "tailwind-config", label: "Tailwind config object", extension: "js" },
  { id: "json", label: "JSON", extension: "json" },
];

const MAX_NAME = 64;
const MAX_SLUG = 40;
const PROCREATE_SLOTS = 30;

// ---- names -----------------------------------------------------------------------------------------------------------

const INVISIBLE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩﻿]/g;

/** A display name: control and bidi characters removed, path separators turned into "-", spaces collapsed, at most 64 characters. */
function cleanName(raw: unknown, max = MAX_NAME): string {
  const s = String(raw ?? "")
    .replace(INVISIBLE, "")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(s).slice(0, max).join("").trim();
}

const hex6 = (hex: string): string => {
  const rgb = hexToRgb(hex);
  return (rgb ? rgbToHex(...rgb) : "#000000").slice(1);
};

/**
 * A token-safe name for a colour: lower-case [a-z0-9-], accents folded, at most 40 characters. A name with nothing usable
 * (empty, emoji, non-latin script) becomes `swatch-{hex6}`. `used` holds the slugs already handed out in this export; a
 * repeat gets -2, -3 ... and the result is added to it.
 */
export function slugifyColorName(name: string, hex: string, used: Set<string>): string {
  let base = String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/, "");
  if (!base) base = `swatch-${hex6(hex)}`;
  let candidate = base;
  for (let n = 2; used.has(candidate); n++) candidate = `${base}-${n}`;
  used.add(candidate);
  return candidate;
}

// ---- preparation -----------------------------------------------------------------------------------------------------

type Prepared = { hex: string; rgb: [number, number, number]; name: string; slug: string; weight: number | null };

/** Valid colours only (normalised hex), with unique display names and slugs, in order; plus how many entries were dropped. */
function prepare(colors: readonly NamedColor[]): { items: Prepared[]; skipped: number } {
  const names = new Set<string>();
  const slugs = new Set<string>();
  const items: Prepared[] = [];
  let skipped = 0;
  for (const c of colors) {
    const rgb = c && typeof c === "object" ? hexToRgb(c.hex) : null;
    if (!rgb) {
      skipped++;
      continue;
    }
    const hex = rgbToHex(...rgb);
    const base = cleanName(c.name) || hex.toUpperCase();
    let name = base;
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${base} ${n}`;
    names.add(name.toLowerCase());
    const weight = typeof c.weight === "number" && Number.isFinite(c.weight) ? c.weight : null;
    items.push({ hex, rgb, name, slug: slugifyColorName(c.name, hex, slugs), weight });
  }
  return { items, skipped };
}

// ---- ASE -------------------------------------------------------------------------------------------------------------

const ASE_COLOR = 0x0001;
const ASE_GROUP_START = 0xc001;
const ASE_GROUP_END = 0xc002;
/** Colour types in ASE: 0 global, 1 spot, 2 normal. */
const ASE_NORMAL = 2;

/** Adobe Swatch Exchange: "ASEF" 1.0, a block count, optional group start/end blocks around the colour blocks. RGB only. */
export function toASE(colors: readonly NamedColor[], groupName?: string): Uint8Array {
  const { items } = prepare(colors);
  const group = groupName === undefined ? null : cleanName(groupName) || "Palette";
  const nameBytes = (s: string) => (s.length + 1) * 2;
  const colourLength = (name: string) => 2 + nameBytes(name) + 4 + 12 + 2;

  let size = 12;
  if (group !== null) size += 6 + 2 + nameBytes(group) + 6;
  for (const c of items) size += 6 + colourLength(c.name);

  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  let p = 0;
  const u16 = (n: number) => {
    v.setUint16(p, n);
    p += 2;
  };
  const u32 = (n: number) => {
    v.setUint32(p, n);
    p += 4;
  };
  const f32 = (n: number) => {
    v.setFloat32(p, n);
    p += 4;
  };
  const name = (s: string) => {
    u16(s.length + 1); // UTF-16 units including the terminating NUL
    for (let i = 0; i < s.length; i++) u16(s.charCodeAt(i));
    u16(0);
  };

  out.set([0x41, 0x53, 0x45, 0x46]); // "ASEF"
  p = 4;
  u16(1);
  u16(0);
  u32(items.length + (group !== null ? 2 : 0));
  if (group !== null) {
    u16(ASE_GROUP_START);
    u32(2 + nameBytes(group));
    name(group);
  }
  for (const c of items) {
    u16(ASE_COLOR);
    u32(colourLength(c.name));
    name(c.name);
    out.set([0x52, 0x47, 0x42, 0x20], p); // "RGB "
    p += 4;
    f32(c.rgb[0] / 255);
    f32(c.rgb[1] / 255);
    f32(c.rgb[2] / 255);
    u16(ASE_NORMAL);
  }
  if (group !== null) {
    u16(ASE_GROUP_END);
    u32(0);
  }
  return out;
}

// ---- Procreate -------------------------------------------------------------------------------------------------------

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function toHsb([r, g, b]: [number, number, number]): { hue: number; saturation: number; brightness: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  return { hue: round6(h), saturation: round6(max === 0 ? 0 : d / max), brightness: round6(max / 255) };
}

/**
 * Procreate swatches: a ZIP (deterministic bytes) holding `Swatches.json` = [{ name, swatches: 30 slots }], each slot an HSB
 * swatch or null. More than 30 colours continue in further palettes named "{name} 2", "{name} 3" ... An empty palette is one
 * palette of 30 empty slots. See the file header: the layout is from memory and needs checking in Procreate.
 */
export function toProcreateSwatches(colors: readonly NamedColor[], paletteName: string): Uint8Array {
  const { items } = prepare(colors);
  const name = cleanName(paletteName) || "Palette";
  const pages = Math.max(1, Math.ceil(items.length / PROCREATE_SLOTS));
  const palettes = Array.from({ length: pages }, (_, page) => ({
    name: page === 0 ? name : `${name} ${page + 1}`,
    swatches: Array.from({ length: PROCREATE_SLOTS }, (_, slot) => {
      const c = items[page * PROCREATE_SLOTS + slot];
      return c ? { ...toHsb(c.rgb), alpha: 1, colorSpace: 0, origin: 0 } : null;
    }),
  }));
  // A fixed modification time (local 2000-01-01, whatever the time zone) keeps the file byte-identical for the same palette.
  return zipSync({ "Swatches.json": [strToU8(JSON.stringify(palettes)), { level: 6, mtime: new Date(2000, 0, 1) }] });
}

// ---- CSS, Tailwind ---------------------------------------------------------------------------------------------------

const SAFE_SELECTOR = /^[A-Za-z0-9_\-.#:[\]="'>+~*,() ]{1,100}$/;

/** `--{prefix}-{slug}: #rrggbb;` in a block. `prefix` is reduced to [a-z0-9-] (default "color"); `selector` must look like a selector (default ":root"). */
export function toCssVariables(colors: readonly NamedColor[], o: { prefix?: string; selector?: string } = {}): string {
  const prefix = String(o.prefix ?? "color").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "color";
  const selector = typeof o.selector === "string" && SAFE_SELECTOR.test(o.selector.trim()) ? o.selector.trim() : ":root";
  const lines = prepare(colors).items.map((c) => `  --${prefix}-${c.slug}: ${c.hex};\n`);
  return `${selector} {\n${lines.join("")}}\n`;
}

/** Tailwind v4: `@theme {\n  --color-sand: #e8dcc8;\n}\n`. */
export function toTailwindTokens(colors: readonly NamedColor[]): string {
  const lines = prepare(colors).items.map((c) => `  --color-${c.slug}: ${c.hex};\n`);
  return `@theme {\n${lines.join("")}}\n`;
}

/** A Tailwind config object (v3 style, also read by v4 through `@config`) extending `theme.colors`. Keys are slugs, values hex. */
export function toTailwindConfig(colors: readonly NamedColor[]): string {
  const { items } = prepare(colors);
  const entries = items.map((c) => `        ${JSON.stringify(c.slug)}: ${JSON.stringify(c.hex)},\n`);
  return `/** @type {import('tailwindcss').Config} */\nconst config = {\n  theme: {\n    extend: {\n      colors: {\n${entries.join("")}      },\n    },\n  },\n};\n\nexport default config;\n`;
}

// ---- JSON ------------------------------------------------------------------------------------------------------------

/** `{ version: 1, board, exportedAt, colors: [{ name, slug, hex, rgb, oklch, weight }] }`, two-space indented. `weight` is null when unknown. */
export function toPaletteJson(colors: readonly NamedColor[], meta: { boardTitle: string; exportedAt: string }): string {
  const { items } = prepare(colors);
  return (
    JSON.stringify(
      {
        version: 1,
        board: cleanName(meta.boardTitle, 200),
        exportedAt: String(meta.exportedAt ?? "").slice(0, 40),
        colors: items.map((c) => ({ name: c.name, slug: c.slug, hex: c.hex, rgb: c.rgb, oklch: formatColor(c.hex, "oklch"), weight: c.weight })),
      },
      null,
      2,
    ) + "\n"
  );
}

// ---- one entry point -------------------------------------------------------------------------------------------------

export type ExportOptions = {
  /** Palette / file name (default "palette"). */
  name?: string;
  /** Board title written into the JSON (default: `name`). */
  boardTitle?: string;
  /** ISO date-time written into the JSON (default: now). */
  exportedAt?: string;
  /** CSS variable prefix and selector (css format). */
  prefix?: string;
  selector?: string;
  /** ASE group name (default: `name`). */
  groupName?: string;
};

export type ExportResult = {
  filename: string;
  mime: string;
  bytes: Uint8Array | string;
  /** Colours written. */
  count: number;
  /** Entries dropped because their hex was not a colour. */
  skipped: number;
};

/** Export swatches (a PaletteObj's `swatches` fit as they are) in one of the formats; see PALETTE_FORMATS. */
export function exportPalette(format: PaletteFormat, swatches: readonly NamedColor[], opts: ExportOptions = {}): ExportResult {
  const { items, skipped } = prepare(swatches);
  const file = sanitizeFileName(opts.name ?? "", "palette", 60);
  const exportedAt = opts.exportedAt ?? new Date().toISOString();
  const done = (suffix: string, mime: string, bytes: Uint8Array | string): ExportResult => ({ filename: file + suffix, mime, bytes, count: items.length, skipped });
  switch (format) {
    case "ase":
      return done(".ase", "application/octet-stream", toASE(swatches, opts.groupName ?? file));
    case "procreate":
      return done(".swatches", "application/octet-stream", toProcreateSwatches(swatches, opts.name || file));
    case "css":
      return done("-colors.css", "text/css", toCssVariables(swatches, { prefix: opts.prefix, selector: opts.selector }));
    case "tailwind":
      return done("-theme.css", "text/css", toTailwindTokens(swatches));
    case "tailwind-config":
      return done("-tailwind.config.js", "text/javascript", toTailwindConfig(swatches));
    case "json":
      return done(".json", "application/json", toPaletteJson(swatches, { boardTitle: opts.boardTitle ?? opts.name ?? "", exportedAt }));
  }
}
