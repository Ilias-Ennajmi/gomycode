import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import type { PaletteSwatch } from "@/lib/engine/model/types";
import {
  exportPalette,
  PALETTE_FORMATS,
  slugifyColorName,
  toASE,
  toCssVariables,
  toPaletteJson,
  toProcreateSwatches,
  toTailwindConfig,
  toTailwindTokens,
  type NamedColor,
} from "@/lib/engine/export/palette-formats";

// ---- golden files -------------------------------------------------------------------------------------------------
// Re-generate with UPDATE_GOLDEN=1 npx vitest run tests/unit/palette-formats.test.ts, then READ the diff: a golden file
// is only worth anything if a person has looked at it.
const GOLDEN = join(__dirname, "golden", "palette");
function golden(name: string, actual: Uint8Array | string): void {
  const file = join(GOLDEN, name);
  const bytes = typeof actual === "string" ? Buffer.from(actual, "utf8") : Buffer.from(actual);
  if (process.env.UPDATE_GOLDEN === "1" || !existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  const expected = readFileSync(file);
  expect(bytes.equals(expected), `${name} differs from its golden file`).toBe(true);
}

const SAMPLE: NamedColor[] = [
  { hex: "#E8DCC8", name: "Warm Sand", weight: 0.4 },
  { hex: "#2f4a6d", name: "Harbour Blue", weight: 0.35 },
  { hex: "#ff0000", name: "Red", weight: 0.25 },
];

// ---- a tiny independent ASE decoder --------------------------------------------------------------------------------
type AseBlock = { type: number; length: number; name: string; model?: string; values?: number[]; colorType?: number };
function decodeAse(b: Uint8Array): { version: [number, number]; count: number; blocks: AseBlock[] } {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  expect(String.fromCharCode(...b.slice(0, 4))).toBe("ASEF");
  const version: [number, number] = [v.getUint16(4), v.getUint16(6)];
  const count = v.getUint32(8);
  const blocks: AseBlock[] = [];
  let p = 12;
  const readName = (at: number): { name: string; end: number } => {
    const len = v.getUint16(at); // UTF-16 units including the terminating NUL
    let name = "";
    for (let i = 0; i < len - 1; i++) name += String.fromCharCode(v.getUint16(at + 2 + i * 2));
    expect(v.getUint16(at + 2 + (len - 1) * 2)).toBe(0);
    return { name, end: at + 2 + len * 2 };
  };
  for (let i = 0; i < count; i++) {
    const type = v.getUint16(p);
    const length = v.getUint32(p + 2);
    const body = p + 6;
    const block: AseBlock = { type, length, name: "" };
    if (type === 0xc001 || type === 0x0001) {
      const { name, end } = readName(body);
      block.name = name;
      if (type === 0x0001) {
        block.model = String.fromCharCode(...b.slice(end, end + 4));
        block.values = [v.getFloat32(end + 4), v.getFloat32(end + 8), v.getFloat32(end + 12)];
        block.colorType = v.getUint16(end + 16);
        expect(end + 18).toBe(body + length);
      } else {
        expect(end).toBe(body + length);
      }
    } else {
      expect(length).toBe(0);
    }
    blocks.push(block);
    p = body + length;
  }
  expect(p).toBe(b.length);
  return { version, count, blocks };
}

describe("slugifyColorName", () => {
  it("makes [a-z0-9-] slugs and suffixes duplicates", () => {
    const used = new Set<string>();
    expect(slugifyColorName("Warm Sand", "#e8dcc8", used)).toBe("warm-sand");
    expect(slugifyColorName("Warm Sand", "#e8dcc8", used)).toBe("warm-sand-2");
    expect(slugifyColorName("warm sand", "#000000", used)).toBe("warm-sand-3");
  });
  it("falls back to swatch-{hex6} for empty and non-latin names", () => {
    const used = new Set<string>();
    expect(slugifyColorName("🔥", "#ff0000", used)).toBe("swatch-ff0000");
    expect(slugifyColorName("", "#00ff00", used)).toBe("swatch-00ff00");
    expect(slugifyColorName("夕焼け", "#ff8800", used)).toBe("swatch-ff8800");
    expect(slugifyColorName("🔥", "#ff0000", used)).toBe("swatch-ff0000-2");
  });
  it("folds accents and trims dashes", () => {
    expect(slugifyColorName("  Crème  brûlée!! ", "#fff", new Set())).toBe("creme-brulee");
    expect(slugifyColorName("---a---b---", "#fff", new Set())).toBe("a-b");
  });
  it("caps the length", () => {
    expect(slugifyColorName("a".repeat(500), "#fff", new Set()).length).toBeLessThanOrEqual(40);
  });
  it("never lets a hostile name reach CSS", () => {
    const slug = slugifyColorName("}</style>; * { display:none }", "#123456", new Set());
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).not.toMatch(/[{};<>*]/);
  });
  it("does not clash with a suffixed slug it handed out earlier", () => {
    const used = new Set<string>();
    expect(slugifyColorName("a", "#000", used)).toBe("a");
    expect(slugifyColorName("a-2", "#000", used)).toBe("a-2");
    expect(slugifyColorName("a", "#000", used)).toBe("a-3");
  });
});

describe("toASE", () => {
  it("starts with ASEF 1.0 and counts its blocks", () => {
    const b = toASE(SAMPLE);
    expect([...b.slice(0, 8)]).toEqual([0x41, 0x53, 0x45, 0x46, 0x00, 0x01, 0x00, 0x00]);
    const d = decodeAse(b);
    expect(d.version).toEqual([1, 0]);
    expect(d.count).toBe(3);
    expect(decodeAse(toASE(SAMPLE, "Harbour")).count).toBe(5);
  });

  it("writes a colour block byte for byte (Red #ff0000)", () => {
    const b = toASE([{ hex: "#ff0000", name: "Red" }]);
    const block = [...b.slice(12)];
    expect(block).toEqual([
      0x00, 0x01, // block type: colour
      0x00, 0x00, 0x00, 0x1c, // block length: 2 (name length) + 8 (name) + 4 (model) + 12 (floats) + 2 (type) = 28
      0x00, 0x04, // name length in UTF-16 units including the NUL
      0x00, 0x52, 0x00, 0x65, 0x00, 0x64, 0x00, 0x00, // "Red\0"
      0x52, 0x47, 0x42, 0x20, // "RGB "
      0x3f, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // 1.0, 0.0, 0.0 as float32 BE
      0x00, 0x02, // colour type: normal
    ]);
    expect(block.length).toBe(6 + 0x1c);
  });

  it("round-trips names (unicode too), colours and the optional group", () => {
    const d = decodeAse(toASE([{ hex: "#e8dcc8", name: "Crème 夕焼け" }, { hex: "#2f4a6d", name: "Harbour" }], "My board"));
    expect(d.blocks.map((x) => x.type)).toEqual([0xc001, 0x0001, 0x0001, 0xc002]);
    expect(d.blocks[0].name).toBe("My board");
    expect(d.blocks[1]).toMatchObject({ name: "Crème 夕焼け", model: "RGB ", colorType: 2 });
    expect(d.blocks[1].values!.map((x) => Math.round(x * 255))).toEqual([0xe8, 0xdc, 0xc8]);
    expect(d.blocks[2].values!.map((x) => Math.round(x * 255))).toEqual([0x2f, 0x4a, 0x6d]);
  });

  it("encodes astral characters as surrogate pairs", () => {
    const d = decodeAse(toASE([{ hex: "#ff0000", name: "🔥" }]));
    expect(d.blocks[0].name).toBe(String.fromCharCode(0xd83d, 0xdd25));
  });

  it("skips invalid hex entries and suffixes duplicate names", () => {
    const d = decodeAse(toASE([{ hex: "nope", name: "Bad" }, { hex: "#fff", name: "White" }, { hex: "#eee", name: "white" }, { hex: "#12345", name: "Short" }]));
    expect(d.blocks.map((x) => x.name)).toEqual(["White", "white 2"]);
    expect(d.blocks[0].values).toEqual([1, 1, 1]);
  });

  it("names an unnamed colour after its hex", () => {
    expect(decodeAse(toASE([{ hex: "#e8dcc8", name: "  " }])).blocks[0].name).toBe("#E8DCC8");
  });

  it("caps long names and strips path separators and control characters", () => {
    const d = decodeAse(toASE([{ hex: "#000", name: "a/b\\c\u0000d‮e" + "x".repeat(200) }]));
    expect(d.blocks[0].name).not.toMatch(/[/\\\u0000‮]/);
    expect(d.blocks[0].name.length).toBeLessThanOrEqual(64);
  });

  it("an empty palette is a valid, empty ASE file", () => {
    const b = toASE([]);
    expect(b.length).toBe(12);
    expect(decodeAse(b).count).toBe(0);
  });

  it("handles 64 colours", () => {
    const many = Array.from({ length: 64 }, (_, i) => ({ hex: "#" + (i * 4).toString(16).padStart(2, "0").repeat(3), name: `c${i}` }));
    const d = decodeAse(toASE(many));
    expect(d.count).toBe(64);
    expect(d.blocks[63].name).toBe("c63");
  });

  it("matches its golden file", () => {
    golden("sample.ase", toASE(SAMPLE, "Harbour"));
  });
});

describe("toProcreateSwatches", () => {
  const unzip = (bytes: Uint8Array) => {
    const files = unzipSync(bytes);
    expect(Object.keys(files)).toEqual(["Swatches.json"]);
    return JSON.parse(strFromU8(files["Swatches.json"])) as { name: string; swatches: ({ hue: number; saturation: number; brightness: number; alpha: number; colorSpace: number; origin: number } | null)[] }[];
  };

  it("is a zip holding Swatches.json with 30 slots, padded with null", () => {
    const [palette, ...rest] = unzip(toProcreateSwatches(SAMPLE, "Harbour"));
    expect(rest).toHaveLength(0);
    expect(palette.name).toBe("Harbour");
    expect(palette.swatches).toHaveLength(30);
    expect(palette.swatches.slice(3).every((s) => s === null)).toBe(true);
    expect(palette.swatches.slice(0, 3).every((s) => s !== null)).toBe(true);
  });

  it("converts to HSB in 0..1", () => {
    const [palette] = unzip(toProcreateSwatches([{ hex: "#ff0000", name: "r" }, { hex: "#00ff00", name: "g" }, { hex: "#000000", name: "k" }, { hex: "#808080", name: "grey" }], "x"));
    expect(palette.swatches[0]).toEqual({ hue: 0, saturation: 1, brightness: 1, alpha: 1, colorSpace: 0, origin: 0 });
    expect(palette.swatches[1]!.hue).toBeCloseTo(1 / 3, 4);
    expect(palette.swatches[1]).toMatchObject({ saturation: 1, brightness: 1 });
    expect(palette.swatches[2]).toMatchObject({ saturation: 0, brightness: 0 });
    expect(palette.swatches[3]!.brightness).toBeCloseTo(128 / 255, 4);
    expect(palette.swatches[3]!.saturation).toBe(0);
  });

  it("splits more than 30 colours into several palettes", () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ hex: "#" + i.toString(16).padStart(2, "0") + "0000", name: `c${i}` }));
    const palettes = unzip(toProcreateSwatches(many, "Big"));
    expect(palettes.map((p) => p.name)).toEqual(["Big", "Big 2"]);
    expect(palettes.every((p) => p.swatches.length === 30)).toBe(true);
    expect(palettes[0].swatches.every((s) => s !== null)).toBe(true);
    expect(palettes[1].swatches.filter((s) => s !== null)).toHaveLength(1);
    expect(unzip(toProcreateSwatches(Array.from({ length: 64 }, () => ({ hex: "#123456", name: "" })), "n"))).toHaveLength(3);
  });

  it("an empty palette is one empty palette; invalid hex is skipped; the name is cleaned", () => {
    const [empty] = unzip(toProcreateSwatches([], "Empty"));
    expect(empty.swatches.every((s) => s === null)).toBe(true);
    const [p] = unzip(toProcreateSwatches([{ hex: "zzz", name: "x" }, { hex: "#fff", name: "y" }], "a/b\\c"));
    expect(p.swatches.filter((s) => s !== null)).toHaveLength(1);
    expect(p.name).not.toMatch(/[/\\]/);
  });

  it("is deterministic and matches its golden files", () => {
    const a = toProcreateSwatches(SAMPLE, "Harbour");
    const b = toProcreateSwatches(SAMPLE, "Harbour");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    golden("sample.swatches", a);
    golden("sample-swatches.json", strFromU8(unzipSync(a)["Swatches.json"]));
  });
});

describe("toCssVariables", () => {
  it("writes custom properties in :root", () => {
    expect(toCssVariables([{ hex: "#E8DCC8", name: "Warm Sand" }])).toBe(":root {\n  --color-warm-sand: #e8dcc8;\n}\n");
  });
  it("takes a prefix and a selector, sanitised", () => {
    expect(toCssVariables([{ hex: "#fff", name: "w" }], { prefix: "Brand Kit", selector: ".theme-dark" })).toBe(".theme-dark {\n  --brand-kit-w: #ffffff;\n}\n");
    expect(toCssVariables([{ hex: "#fff", name: "w" }], { prefix: "x;}", selector: "} body { display:none" })).toBe(":root {\n  --x-w: #ffffff;\n}\n");
    expect(toCssVariables([{ hex: "#fff", name: "w" }], { prefix: "", selector: "" })).toBe(":root {\n  --color-w: #ffffff;\n}\n");
  });
  it("cannot be injected through a colour name", () => {
    const css = toCssVariables([{ hex: "#123456", name: "}</style>; * { display:none }" }, { hex: "#654321", name: "ok" }]);
    expect(css.match(/\{/g)).toHaveLength(1);
    expect(css.match(/\}/g)).toHaveLength(1);
    // Every line is a custom property made of [a-z0-9-] and a plain hex colour, whatever the name said.
    for (const line of css.split("\n").slice(1, -2)) expect(line).toMatch(/^ {2}--color-[a-z0-9-]+: #[0-9a-f]{6};$/);
  });
  it("an empty palette is an empty but valid block; invalid hex is skipped; duplicates get suffixes", () => {
    expect(toCssVariables([])).toBe(":root {\n}\n");
    expect(toCssVariables([{ hex: "bad", name: "x" }, { hex: "#000", name: "a" }, { hex: "#111", name: "a" }])).toBe(":root {\n  --color-a: #000000;\n  --color-a-2: #111111;\n}\n");
  });
  it("matches its golden file", () => golden("sample.css", toCssVariables(SAMPLE)));
});

describe("toTailwindTokens", () => {
  it("is a Tailwind v4 @theme block", () => {
    expect(toTailwindTokens([{ hex: "#e8dcc8", name: "Sand" }])).toBe("@theme {\n  --color-sand: #e8dcc8;\n}\n");
  });
  it("empty and unsafe names", () => {
    expect(toTailwindTokens([])).toBe("@theme {\n}\n");
    expect(toTailwindTokens([{ hex: "#123456", name: "} @import 'x'; {" }])).toMatch(/^@theme \{\n {2}--color-[a-z0-9-]+: #123456;\n\}\n$/);
  });
  it("matches its golden file", () => golden("sample-tailwind.css", toTailwindTokens(SAMPLE)));
});

describe("toTailwindConfig", () => {
  const evalConfig = (src: string) => new Function(`${src.replace("export default config;", "return config;")}`)() as { theme: { extend: { colors: Record<string, string> } } };
  it("is a config object that evaluates to the colours", () => {
    const src = toTailwindConfig(SAMPLE);
    expect(src).toContain("export default");
    const obj = evalConfig(src);
    expect(obj.theme.extend.colors).toEqual({ "warm-sand": "#e8dcc8", "harbour-blue": "#2f4a6d", red: "#ff0000" });
  });
  it("is valid with no colours and with hostile names", () => {
    expect(evalConfig(toTailwindConfig([])).theme.extend.colors).toEqual({});
    const hostile = evalConfig(toTailwindConfig([{ hex: "#123456", name: '"}); alert(1); ({"' }]));
    expect(Object.values(hostile.theme.extend.colors)).toEqual(["#123456"]);
  });
  it("matches its golden file", () => golden("sample-tailwind.config.js", toTailwindConfig(SAMPLE)));
});

describe("toPaletteJson", () => {
  const meta = { boardTitle: "Harbour mood", exportedAt: "2026-11-12T10:00:00.000Z" };
  it("round-trips", () => {
    const parsed = JSON.parse(toPaletteJson(SAMPLE, meta));
    expect(parsed).toEqual({
      version: 1,
      board: "Harbour mood",
      exportedAt: "2026-11-12T10:00:00.000Z",
      colors: [
        { name: "Warm Sand", slug: "warm-sand", hex: "#e8dcc8", rgb: [232, 220, 200], oklch: "oklch(0.90 0.03 81)", weight: 0.4 },
        { name: "Harbour Blue", slug: "harbour-blue", hex: "#2f4a6d", rgb: [47, 74, 109], oklch: "oklch(0.40 0.07 255)", weight: 0.35 },
        { name: "Red", slug: "red", hex: "#ff0000", rgb: [255, 0, 0], oklch: "oklch(0.63 0.26 29)", weight: 0.25 },
      ],
    });
  });
  it("weight is null when unknown; invalid colours are skipped; an empty palette is valid", () => {
    expect(JSON.parse(toPaletteJson([{ hex: "#000", name: "k" }, { hex: "x", name: "bad" }], meta)).colors).toMatchObject([{ slug: "k", weight: null }]);
    expect(JSON.parse(toPaletteJson([], meta)).colors).toEqual([]);
  });
  it("matches its golden file", () => golden("sample.json", toPaletteJson(SAMPLE, meta)));
});

describe("exportPalette", () => {
  const opts = { name: "Harbour mood", exportedAt: "2026-11-12T10:00:00.000Z" };
  it("lists every format once", () => {
    expect(PALETTE_FORMATS.map((f) => f.id)).toEqual(["ase", "procreate", "css", "tailwind", "tailwind-config", "json"]);
  });
  it("returns filename, mime and bytes per format, with counts", () => {
    const out = Object.fromEntries(PALETTE_FORMATS.map((f) => [f.id, exportPalette(f.id, SAMPLE, opts)]));
    expect(out.ase.filename).toBe("Harbour mood.ase");
    expect(out.ase.bytes).toBeInstanceOf(Uint8Array);
    expect(out.procreate.filename).toBe("Harbour mood.swatches");
    expect(out.procreate.bytes).toBeInstanceOf(Uint8Array);
    expect(out.css).toMatchObject({ filename: "Harbour mood-colors.css", mime: "text/css" });
    expect(out.tailwind).toMatchObject({ filename: "Harbour mood-theme.css", mime: "text/css" });
    expect(out["tailwind-config"].filename).toBe("Harbour mood-tailwind.config.js");
    expect(out.json).toMatchObject({ filename: "Harbour mood.json", mime: "application/json" });
    expect(typeof out.json.bytes).toBe("string");
    for (const r of Object.values(out)) expect(r).toMatchObject({ count: 3, skipped: 0 });
  });
  it("accepts palette swatches as they are (weight, locked)", () => {
    const swatches: PaletteSwatch[] = [{ hex: "#ff0000", name: "Signal", weight: 0.5, locked: true }];
    const r = exportPalette("css", swatches, opts);
    expect(r.bytes).toBe(":root {\n  --color-signal: #ff0000;\n}\n");
  });
  it("reports skipped invalid colours", () => {
    const r = exportPalette("css", [{ hex: "#ff0000", name: "a" }, { hex: "red", name: "b" }, { hex: "", name: "c" }, { hex: "#12", name: "d" }], opts);
    expect(r).toMatchObject({ count: 1, skipped: 3 });
  });
  it("makes a safe file name (no separators, capped, unicode kept) and falls back to 'palette'", () => {
    expect(exportPalette("json", [], { ...opts, name: "../../etc/passwd" }).filename).not.toMatch(/[/\\]/);
    expect(exportPalette("json", [], { ...opts, name: "夕焼け ✨" }).filename).toBe("夕焼け ✨.json");
    expect(exportPalette("json", [], { ...opts, name: "n".repeat(500) }).filename.length).toBeLessThanOrEqual(80);
    expect(exportPalette("json", [], { ...opts, name: "  " }).filename).toBe("palette.json");
    expect(exportPalette("json", [], { ...opts, name: "..." }).filename).toBe("palette.json");
    expect(exportPalette("json", [], { exportedAt: opts.exportedAt }).filename).toBe("palette.json");
  });
  it("handles the empty palette and 64 swatches in every format", () => {
    const sixtyFour = Array.from({ length: 64 }, (_, i) => ({ hex: "#" + ((i * 4) << 16 | (255 - i * 4) << 8 | 7).toString(16).padStart(6, "0"), name: "Swatch" }));
    for (const f of PALETTE_FORMATS) {
      expect(exportPalette(f.id, [], opts)).toMatchObject({ count: 0, skipped: 0 });
      const r = exportPalette(f.id, sixtyFour, opts);
      expect(r.count).toBe(64);
      expect(r.bytes.length).toBeGreaterThan(0);
    }
    const css = exportPalette("css", sixtyFour, opts).bytes as string;
    expect(new Set(css.match(/--[a-z0-9-]+/g)).size).toBe(64); // duplicates all got distinct names
  });
  it("a single swatch works", () => {
    expect(exportPalette("tailwind", [{ hex: "#e8dcc8", name: "Sand" }], opts).bytes).toBe("@theme {\n  --color-sand: #e8dcc8;\n}\n");
  });
});
