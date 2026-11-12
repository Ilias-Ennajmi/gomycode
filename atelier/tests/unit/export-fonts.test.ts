import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundledFont, canvasFont, drawnFont, EXPORT_FONT_FILES, substitutedFamilies, ttfCoverage, woffToTtf } from "@/lib/engine/export/fonts";

const file = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), "public/fonts/export", name)));

describe("bundled export fonts", () => {
  it("ships every listed file, each unwrapping to a TrueType font with Latin coverage", () => {
    for (const f of EXPORT_FONT_FILES) {
      const ttf = woffToTtf(file(f.file));
      const view = new DataView(ttf.buffer, ttf.byteOffset);
      expect(view.getUint32(0)).toBe(0x00010000); // TrueType (glyf) outlines: what jsPDF embeds
      const has = ttfCoverage(ttf);
      expect(has("A".codePointAt(0)!), f.file).toBe(true);
      expect(has("é".codePointAt(0)!), f.file).toBe(true);
      expect(has("日".codePointAt(0)!), f.file).toBe(false);
    }
  });

  it("matches the nearest bundled weight and style, and substitutes unknown families with Inter", () => {
    expect(bundledFont({ family: "Inter", weight: 500, italic: false })?.file).toBe("inter-latin-500-normal.woff");
    expect(bundledFont({ family: "inter", weight: 800, italic: false })?.weight).toBe(700);
    expect(bundledFont({ family: "Inter", weight: 500, italic: true })?.file).toBe("inter-latin-400-italic.woff");
    expect(bundledFont({ family: "Playfair Display", weight: 700, italic: true })?.italic).toBe(true);
    expect(bundledFont({ family: "Noto Sans JP", weight: 400, italic: false })).toBeNull();
    expect(drawnFont({ family: "Noto Sans JP", weight: 400, italic: false })).toEqual({ family: "Inter", substituted: true });
    expect(substitutedFamilies([{ family: "Inter", weight: 400, italic: false }, { family: "Space Grotesk", weight: 400, italic: false }, { family: "Space Grotesk", weight: 700, italic: false }])).toEqual(["Space Grotesk"]);
  });

  it("builds a canvas font string with the export family and a sans-serif fallback", () => {
    expect(canvasFont({ family: "Inter", weight: 600, italic: true, size: 20 })).toBe('italic 600 20px "AtelierExport Inter", sans-serif');
    expect(canvasFont({ family: "Weird Font", weight: 400, italic: false, size: 12 })).toContain("AtelierExport Inter");
  });

  it("rejects something that is not a WOFF file", () => {
    expect(() => woffToTtf(new Uint8Array(100))).toThrow();
  });
});
