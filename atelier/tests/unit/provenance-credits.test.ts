import { describe, expect, it } from "vitest";
import { BoardDoc } from "@/lib/engine/doc/board-doc";
import { defaultsFor } from "@/lib/engine/model/defaults";
import type { Provenance } from "@/lib/engine/model/types";
import { creditsCsv, creditsRows, csvCell } from "@/lib/engine/provenance/credits";

const A1 = "6f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const A2 = "7f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const A3 = "8f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f";
const prov = (o: Partial<Provenance>): Provenance => ({ sourceUrl: null, credit: "", licence: "", capturedAt: null, ...o });

function board() {
  const doc = new BoardDoc();
  const img = (assetId: string, provenance: Provenance | null, title = "") =>
    doc.create({ ...defaultsFor("image"), assetId, w: 100, h: 100, provenance, title });
  return { doc, img };
}

describe("creditsRows", () => {
  it("lists images and videos that carry provenance, one row per asset", () => {
    const { doc, img } = board();
    img(A1, prov({ sourceUrl: "https://a.example.com/x", credit: "Jane", licence: "CC0", capturedAt: "2026-11-12" }), "Harbour");
    img(A1, prov({ credit: "Duplicate use of the same asset" }));
    img(A2, null);
    doc.create({ ...defaultsFor("video"), assetId: A3, w: 100, h: 100, provenance: prov({ credit: "Film Co" }) });
    const rows = creditsRows(doc);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ source: "https://a.example.com/x", credit: "Jane", licence: "CC0", capturedAt: "2026-11-12" });
    expect(rows[0]!.file).toContain("Harbour");
    expect(rows[1]).toMatchObject({ credit: "Film Co", source: "", licence: "", capturedAt: "" });
  });
  it("can include images without provenance so gaps are visible", () => {
    const { doc, img } = board();
    img(A1, null);
    expect(creditsRows(doc)).toEqual([]);
    expect(creditsRows(doc, { includeUncredited: true })).toHaveLength(1);
  });
  it("names files with the supplied hook and keeps names unique", () => {
    const { doc, img } = board();
    img(A1, prov({ credit: "a" }), "Same");
    img(A2, prov({ credit: "b" }), "Same");
    const rows = creditsRows(doc);
    expect(new Set(rows.map((r) => r.file)).size).toBe(2);
    const hooked = creditsRows(doc, { fileFor: (o) => `${o.assetId}.jpg` });
    expect(hooked.map((r) => r.file)).toEqual([`${A1}.jpg`, `${A2}.jpg`]);
  });
  it("skips rows whose fields are all blank", () => {
    const { doc, img } = board();
    img(A1, prov({}));
    expect(creditsRows(doc)).toEqual([]);
  });
});

describe("csvCell", () => {
  it("quotes cells with commas, quotes and line breaks (RFC 4180)", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell("cr\rx")).toBe('"cr\rx"'); // a CR inside is quoted; only a leading one is neutralised
  });
  it("neutralises spreadsheet formulas with a single leading quote", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1+1")).toBe("'+1+1");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("\rcmd")).toBe("\"'\rcmd\"");
    expect(csvCell("a=b")).toBe("a=b");
  });
});

describe("creditsCsv", () => {
  it("writes a header and CRLF line endings", () => {
    const csv = creditsCsv([{ file: "a.jpg", source: "https://x.com/a?b=1,2", credit: "Jane, Doe", licence: "CC0", capturedAt: "2026-11-12" }]);
    expect(csv).toBe('file,source,credit,licence,captured\r\na.jpg,"https://x.com/a?b=1,2","Jane, Doe",CC0,2026-11-12\r\n');
  });
  it("is just a header for no rows, and can carry a BOM", () => {
    expect(creditsCsv([])).toBe("file,source,credit,licence,captured\r\n");
    expect(creditsCsv([], { bom: true }).charCodeAt(0)).toBe(0xfeff);
  });
  it("hardens every column", () => {
    const csv = creditsCsv([{ file: "=1", source: "+2", credit: "-3", licence: "@4", capturedAt: "" }]);
    expect(csv.split("\r\n")[1]).toBe("'=1,'+2,'-3,'@4,");
  });
});
