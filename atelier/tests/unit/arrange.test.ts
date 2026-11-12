import { describe, expect, it } from "vitest";
import {
  layoutGrid,
  layoutJustified,
  layoutMasonry,
  layoutPack,
  normaliseSize,
  orderByReading,
  tidy,
  type LayoutItem,
  type Placement,
} from "@/lib/engine/layout/arrange";

/** Small seeded generator: the same seed gives the same boards on every run and machine. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomItems(seed: number, n: number, opts: { min?: number; max?: number; spread?: number } = {}): LayoutItem[] {
  const r = rng(seed);
  const { min = 24, max = 380, spread = 1500 } = opts;
  return Array.from({ length: n }, (_, i) => ({
    id: `i${String(i).padStart(4, "0")}`,
    w: min + r() * (max - min),
    h: min + r() * (max - min),
    x: (r() - 0.5) * spread,
    y: (r() - 0.5) * spread,
  }));
}

const byId = (ps: Placement[]) => new Map(ps.map((p) => [p.id, p]));
const finite = (p: Placement) => [p.x, p.y, p.w, p.h].every(Number.isFinite);
const EPS = 1e-6;

/** Smallest axis separation between two rects (negative = they overlap by that much on both axes). */
function separation(a: Placement, b: Placement): number {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  return Math.max(dx, dy);
}

function expectGutterApart(ps: Placement[], gutter: number): void {
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const s = separation(ps[i], ps[j]);
      if (s < gutter - EPS) throw new Error(`${ps[i].id} and ${ps[j].id} are ${s} apart, need ${gutter}`);
    }
  }
}

function expectAspectKept(items: LayoutItem[], ps: Placement[]): void {
  const m = byId(ps);
  for (const it of items) {
    const p = m.get(it.id)!;
    expect(Math.abs(p.w / p.h - it.w / it.h)).toBeLessThan(1e-9 * Math.max(1, it.w / it.h));
  }
}

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

describe("orderByReading", () => {
  it("orders top-to-bottom then left-to-right, treating items on one visual row as a row", () => {
    const items: LayoutItem[] = [
      { id: "c", x: 300, y: 8, w: 100, h: 100 }, // slightly lower than a, still the same row
      { id: "a", x: 0, y: 0, w: 100, h: 100 },
      { id: "d", x: 0, y: 200, w: 100, h: 100 },
      { id: "b", x: 150, y: 0, w: 100, h: 100 },
    ];
    expect(orderByReading(items).map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("is independent of the input order and does not mutate it", () => {
    const items = randomItems(7, 30);
    const copy = JSON.stringify(items);
    const a = orderByReading(items).map((i) => i.id);
    const b = orderByReading([...items].reverse()).map((i) => i.id);
    expect(b).toEqual(a);
    expect(JSON.stringify(items)).toBe(copy);
  });
});

describe("layoutGrid", () => {
  it("6 equal items in 3 columns step by cell width + gutter and do not overlap", () => {
    const items: LayoutItem[] = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, x: (i % 3) * 120, y: Math.floor(i / 3) * 120, w: 100, h: 100 }));
    const ps = layoutGrid(items, { columns: 3, gutter: 20, width: 700 });
    const m = byId(ps);
    const colW = (700 - 40) / 3;
    expect(m.get("s0")!.x).toBeCloseTo(0);
    expect(m.get("s1")!.x - m.get("s0")!.x).toBeCloseTo(colW + 20);
    expect(m.get("s2")!.x - m.get("s1")!.x).toBeCloseTo(colW + 20);
    expect(m.get("s3")!.x).toBeCloseTo(m.get("s0")!.x);
    expectGutterApart(ps, 20);
    expectAspectKept(items, ps);
  });
  it("is the identity of position for the first cell: it starts at the selection's top-left", () => {
    const items: LayoutItem[] = [
      { id: "a", x: 500, y: 300, w: 100, h: 80 },
      { id: "b", x: 700, y: 310, w: 100, h: 80 },
    ];
    const ps = layoutGrid(items, { columns: 2, gutter: 10 });
    expect(byId(ps).get("a")!.x).toBeCloseTo(500);
    expect(byId(ps).get("a")!.y).toBeCloseTo(300);
  });
  it("row height is the tallest item of the row; items are top-aligned", () => {
    const items: LayoutItem[] = [
      { id: "a", x: 0, y: 0, w: 100, h: 50 },
      { id: "b", x: 200, y: 0, w: 100, h: 150 },
      { id: "c", x: 0, y: 300, w: 100, h: 100 },
    ];
    const m = byId(layoutGrid(items, { columns: 2, gutter: 10, width: 210 }));
    expect(m.get("a")!.y).toBeCloseTo(m.get("b")!.y);
    expect(m.get("c")!.y).toBeCloseTo(m.get("a")!.y + 150 + 10); // below the tallest of the first row
  });
  it("treats columns of 0 (or NaN, or a fraction) as a valid count", () => {
    const items = randomItems(3, 5);
    for (const columns of [0, -2, NaN, 2.7]) {
      const ps = layoutGrid(items, { columns, gutter: 8 });
      expect(ps.every(finite)).toBe(true);
    }
    const one = layoutGrid(items, { columns: 0, gutter: 8 });
    expect(new Set(one.map((p) => p.x)).size).toBe(1); // one column
  });
  it("property: no overlaps, aspect kept, finite, deterministic, order independent (200 boards)", () => {
    for (const seed of SEEDS) {
      const r = rng(seed * 7919);
      const items = randomItems(seed, 2 + Math.floor(r() * 38));
      const gutter = Math.floor(r() * 40);
      const columns = 1 + Math.floor(r() * 6);
      const ps = layoutGrid(items, { columns, gutter });
      expect(ps).toHaveLength(items.length);
      expect(ps.every(finite)).toBe(true);
      expectGutterApart(ps, gutter);
      expectAspectKept(items, ps);
      expect(layoutGrid(items, { columns, gutter })).toEqual(ps);
      const shuffled = [...items].sort(() => r() - 0.5);
      const again = byId(layoutGrid(shuffled, { columns, gutter }));
      for (const p of ps) expect(again.get(p.id)).toEqual(p);
    }
  });
});

describe("layoutMasonry", () => {
  it("column heights differ by at most the tallest item, and the shortest column gets the next item", () => {
    const items = randomItems(11, 40);
    const ps = layoutMasonry(items, { columns: 4, gutter: 12, width: 1200 });
    expectGutterApart(ps, 12);
    const cols = new Map<number, number>();
    for (const p of ps) cols.set(Math.round(p.x), Math.max(cols.get(Math.round(p.x)) ?? 0, p.y + p.h));
    expect(cols.size).toBe(4);
    const heights = [...cols.values()];
    const tallest = Math.max(...ps.map((p) => p.h));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(tallest + 12 + 1e-6);
  });
  it("ties go to the leftmost column", () => {
    const items: LayoutItem[] = [
      { id: "a", x: 0, y: 0, w: 100, h: 100 },
      { id: "b", x: 0, y: 200, w: 100, h: 100 },
    ];
    const m = byId(layoutMasonry(items, { columns: 2, gutter: 10, width: 210 }));
    expect(m.get("a")!.x).toBeLessThan(m.get("b")!.x);
  });
  it("property (200 boards)", () => {
    for (const seed of SEEDS) {
      const r = rng(seed * 104729);
      const items = randomItems(seed, 2 + Math.floor(r() * 38));
      const gutter = Math.floor(r() * 40);
      const columns = 1 + Math.floor(r() * 6);
      const ps = layoutMasonry(items, { columns, gutter });
      expect(ps.every(finite)).toBe(true);
      expectGutterApart(ps, gutter);
      expectAspectKept(items, ps);
      expect(layoutMasonry(items, { columns, gutter })).toEqual(ps);
      const again = byId(layoutMasonry([...items].reverse(), { columns, gutter }));
      for (const p of ps) expect(again.get(p.id)).toEqual(p);
    }
  });
});

describe("layoutJustified", () => {
  const rowsOf = (ps: Placement[]) => {
    const rows = new Map<number, Placement[]>();
    for (const p of ps) rows.set(Math.round(p.y * 1e3), [...(rows.get(Math.round(p.y * 1e3)) ?? []), p]);
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.sort((a, b) => a.x - b.x));
  };
  it("every full row ends exactly at the right edge and gaps equal the gutter", () => {
    const items = randomItems(5, 24, { min: 60, max: 300 });
    const ps = layoutJustified(items, { targetRowHeight: 140, gutter: 8, width: 900, origin: { x: 10, y: 20 } });
    const rows = rowsOf(ps);
    expect(rows.length).toBeGreaterThan(1);
    rows.slice(0, -1).forEach((row) => {
      const last = row[row.length - 1];
      expect(Math.abs(last.x + last.w - (10 + 900))).toBeLessThan(1e-6);
      expect(Math.abs(row[0].x - 10)).toBeLessThan(1e-6);
      for (let i = 1; i < row.length; i++) expect(Math.abs(row[i].x - (row[i - 1].x + row[i - 1].w) - 8)).toBeLessThan(1e-6);
    });
    for (let r = 1; r < rows.length; r++) {
      const prevBottom = rows[r - 1][0].y + rows[r - 1][0].h;
      expect(Math.abs(rows[r][0].y - prevBottom - 8)).toBeLessThan(1e-6);
    }
  });
  it("leaves the last row at the target height when filling would stretch it by more than 1.25", () => {
    const items: LayoutItem[] = [
      { id: "a", x: 0, y: 0, w: 300, h: 100 },
      { id: "b", x: 400, y: 0, w: 300, h: 100 },
      { id: "c", x: 800, y: 0, w: 300, h: 100 }, // alone on the last row: needs x1.67 to fill 500
    ];
    const ps = layoutJustified(items, { targetRowHeight: 100, gutter: 0, width: 500 });
    const c = byId(ps).get("c")!;
    expect(c.h).toBeCloseTo(100);
    expect(c.w).toBeCloseTo(300);
  });
  it("fills a last row that needs at most a 1.25 stretch", () => {
    const items: LayoutItem[] = [
      { id: "a", x: 0, y: 0, w: 300, h: 100 },
      { id: "b", x: 400, y: 0, w: 300, h: 100 },
      { id: "c", x: 800, y: 0, w: 400, h: 100 }, // 500 / 400 = 1.25
    ];
    const c = byId(layoutJustified(items, { targetRowHeight: 100, gutter: 0, width: 500 })).get("c")!;
    expect(c.w).toBeCloseTo(500);
    expect(c.h).toBeCloseTo(125);
  });
  it("property: aspect kept, finite, full rows justified, deterministic (200 boards)", () => {
    for (const seed of SEEDS) {
      const r = rng(seed * 31337);
      const items = randomItems(seed, 2 + Math.floor(r() * 38), { min: 40, max: 320 });
      const gutter = Math.floor(r() * 24);
      const width = 600 + Math.floor(r() * 1200);
      const targetRowHeight = 80 + Math.floor(r() * 160);
      const ps = layoutJustified(items, { targetRowHeight, gutter, width });
      expect(ps.every(finite)).toBe(true);
      expectGutterApart(ps, gutter);
      expectAspectKept(items, ps);
      const ox = Math.min(...items.map((i) => i.x));
      const rows = rowsOf(ps);
      rows.slice(0, -1).forEach((row) => {
        const last = row[row.length - 1];
        expect(Math.abs(last.x + last.w - (ox + width))).toBeLessThan(1e-6);
      });
      expect(layoutJustified(items, { targetRowHeight, gutter, width })).toEqual(ps);
    }
  });
});

describe("layoutPack", () => {
  it("does not resize, keeps items at least a gutter apart and packs 30 seeded rects at >= 60% utilisation", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const items = randomItems(seed, 30, { min: 40, max: 240 });
      const gutter = 10;
      const ps = layoutPack(items, { gutter });
      expectGutterApart(ps, gutter);
      const m = byId(ps);
      for (const it of items) {
        expect(m.get(it.id)!.w).toBe(it.w);
        expect(m.get(it.id)!.h).toBe(it.h);
      }
      const x0 = Math.min(...ps.map((p) => p.x));
      const y0 = Math.min(...ps.map((p) => p.y));
      const x1 = Math.max(...ps.map((p) => p.x + p.w));
      const y1 = Math.max(...ps.map((p) => p.y + p.h));
      const used = ps.reduce((n, p) => n + p.w * p.h, 0);
      expect(used / ((x1 - x0) * (y1 - y0))).toBeGreaterThanOrEqual(0.6);
    }
  });
  it("honours the requested aspect", () => {
    const items = randomItems(9, 30, { min: 40, max: 160 });
    const ps = layoutPack(items, { gutter: 8, aspect: 3 });
    const w = Math.max(...ps.map((p) => p.x + p.w)) - Math.min(...ps.map((p) => p.x));
    const h = Math.max(...ps.map((p) => p.y + p.h)) - Math.min(...ps.map((p) => p.y));
    expect(w / h).toBeGreaterThan(2);
  });
  it("property: no overlaps, sizes kept, finite, deterministic, order independent (200 boards)", () => {
    for (const seed of SEEDS) {
      const r = rng(seed * 6007);
      const items = randomItems(seed, 2 + Math.floor(r() * 28), { min: 30, max: 300 });
      const gutter = Math.floor(r() * 30);
      const ps = layoutPack(items, { gutter });
      expect(ps).toHaveLength(items.length);
      expect(ps.every(finite)).toBe(true);
      expectGutterApart(ps, gutter);
      const m = byId(ps);
      for (const it of items) expect([m.get(it.id)!.w, m.get(it.id)!.h]).toEqual([it.w, it.h]);
      expect(layoutPack(items, { gutter })).toEqual(ps);
      const again = byId(layoutPack([...items].reverse(), { gutter }));
      for (const p of ps) expect(again.get(p.id)).toEqual(p);
    }
  });
});

describe("normaliseSize", () => {
  it("by height with the median target makes every height equal, widths proportional, centres kept", () => {
    const items = randomItems(4, 9);
    const ps = normaliseSize(items, { by: "height", target: "median" });
    const hs = items.map((i) => i.h).sort((a, b) => a - b);
    const median = hs[4];
    for (const p of ps) expect(p.h).toBeCloseTo(median);
    expectAspectKept(items, ps);
    const m = byId(ps);
    for (const it of items) {
      const p = m.get(it.id)!;
      expect(p.x + p.w / 2).toBeCloseTo(it.x + it.w / 2);
      expect(p.y + p.h / 2).toBeCloseTo(it.y + it.h / 2);
    }
  });
  it("by width with min, max and a number", () => {
    const items = randomItems(6, 7);
    const ws = items.map((i) => i.w);
    expect(normaliseSize(items, { by: "width", target: "min" })[0].w).toBeCloseTo(Math.min(...ws));
    expect(normaliseSize(items, { by: "width", target: "max" })[0].w).toBeCloseTo(Math.max(...ws));
    expect(normaliseSize(items, { by: "width", target: 150 }).every((p) => Math.abs(p.w - 150) < 1e-9)).toBe(true);
  });
  it("ignores a non-positive or non-finite numeric target", () => {
    const items = randomItems(6, 4);
    for (const target of [0, -5, NaN]) {
      const ps = normaliseSize(items, { by: "height", target });
      expect(ps.every(finite)).toBe(true);
      expect(ps.map((p) => [p.w, p.h])).toEqual(items.map((i) => [i.w, i.h]));
    }
  });
});

describe("tidy", () => {
  it("snaps a rough grid: equal gaps, same order, same sizes", () => {
    const items: LayoutItem[] = [
      { id: "a", x: 0, y: 0, w: 100, h: 80 },
      { id: "b", x: 130, y: 6, w: 100, h: 80 },
      { id: "c", x: 245, y: -4, w: 100, h: 80 },
      { id: "d", x: 3, y: 130, w: 100, h: 80 },
      { id: "e", x: 118, y: 141, w: 100, h: 80 },
    ];
    const ps = tidy(items, { gutter: 16 });
    const m = byId(ps);
    expect(m.get("b")!.x - (m.get("a")!.x + 100)).toBeCloseTo(16);
    expect(m.get("c")!.x - (m.get("b")!.x + 100)).toBeCloseTo(16);
    expect(m.get("e")!.x - (m.get("d")!.x + 100)).toBeCloseTo(16);
    const rowOneBottom = Math.max(...["a", "b", "c"].map((k) => m.get(k)!.y + 80));
    expect(m.get("d")!.y - rowOneBottom).toBeCloseTo(16);
    for (const it of items) expect([m.get(it.id)!.w, m.get(it.id)!.h]).toEqual([it.w, it.h]);
    expect(orderByReading(ps).map((p) => p.id)).toEqual(orderByReading(items).map((i) => i.id));
  });
  it("a row keeps its original left edge", () => {
    const items: LayoutItem[] = [
      { id: "a", x: 40, y: 0, w: 100, h: 80 },
      { id: "b", x: 200, y: 4, w: 100, h: 80 },
    ];
    const m = byId(tidy(items, { gutter: 10 }));
    expect(m.get("a")!.x).toBeCloseTo(40);
  });
  it("property: no overlaps, sizes and order kept, finite (200 boards)", () => {
    for (const seed of SEEDS) {
      const r = rng(seed * 15485863);
      const items = randomItems(seed, 2 + Math.floor(r() * 38), { spread: 900 });
      const gutter = Math.floor(r() * 40);
      const ps = tidy(items, { gutter });
      expect(ps.every(finite)).toBe(true);
      expectGutterApart(ps, gutter);
      const m = byId(ps);
      for (const it of items) expect([m.get(it.id)!.w, m.get(it.id)!.h]).toEqual([it.w, it.h]);
      expect(orderByReading(ps).map((p) => p.id)).toEqual(orderByReading(items).map((i) => i.id));
      expect(tidy(items, { gutter })).toEqual(ps);
    }
  });
});

describe("degenerate input", () => {
  const algos: Array<[string, (items: LayoutItem[]) => Placement[]]> = [
    ["grid", (i) => layoutGrid(i, { columns: 3, gutter: 8 })],
    ["masonry", (i) => layoutMasonry(i, { columns: 3, gutter: 8 })],
    ["justified", (i) => layoutJustified(i, { targetRowHeight: 100, gutter: 8, width: 600 })],
    ["pack", (i) => layoutPack(i, { gutter: 8 })],
    ["normalise", (i) => normaliseSize(i, { by: "height", target: "median" })],
    ["tidy", (i) => tidy(i, { gutter: 8 })],
  ];
  it.each(algos)("%s: zero items is empty, one item is unchanged", (_name, fn) => {
    expect(fn([])).toEqual([]);
    const one: LayoutItem = { id: "x", x: 12, y: 34, w: 56, h: 78 };
    expect(fn([one])).toEqual([{ id: "x", x: 12, y: 34, w: 56, h: 78 }]);
  });
  it.each(algos)("%s: zero-size and non-finite items are returned unchanged with no NaN", (_name, fn) => {
    const items: LayoutItem[] = [
      { id: "a", x: 0, y: 0, w: 100, h: 80 },
      { id: "zero-w", x: 500, y: 7, w: 0, h: 50 },
      { id: "zero-h", x: 600, y: 9, w: 50, h: 0 },
      { id: "nan", x: NaN, y: 1, w: 50, h: 50 },
      { id: "b", x: 200, y: 0, w: 100, h: 80 },
    ];
    const ps = fn(items);
    expect(ps).toHaveLength(items.length);
    const m = byId(ps);
    expect(m.get("zero-w")).toEqual({ id: "zero-w", x: 500, y: 7, w: 0, h: 50 });
    expect(m.get("zero-h")).toEqual({ id: "zero-h", x: 600, y: 9, w: 50, h: 0 });
    for (const id of ["a", "b"]) expect(finite(m.get(id)!)).toBe(true);
  });
  it.each(algos)("%s: all items degenerate leaves everything unchanged", (_name, fn) => {
    const items: LayoutItem[] = [
      { id: "a", x: 1, y: 2, w: 0, h: 0 },
      { id: "b", x: 3, y: 4, w: 0, h: 5 },
    ];
    expect(fn(items)).toEqual(items.map((i) => ({ ...i })));
  });
  it("2,000 items finish quickly (grid, masonry, justified, tidy < 300 ms; pack < 1500 ms), all finite", () => {
    const items = randomItems(99, 2000, { min: 30, max: 260, spread: 8000 });
    const time = (fn: () => Placement[]) => {
      const t = performance.now();
      const out = fn();
      const ms = performance.now() - t;
      expect(out).toHaveLength(2000);
      expect(out.every(finite)).toBe(true);
      return ms;
    };
    expect(time(() => layoutGrid(items, { columns: 40, gutter: 8 }))).toBeLessThan(300);
    expect(time(() => layoutMasonry(items, { columns: 40, gutter: 8 }))).toBeLessThan(300);
    expect(time(() => layoutJustified(items, { targetRowHeight: 120, gutter: 8, width: 6000 }))).toBeLessThan(300);
    expect(time(() => tidy(items, { gutter: 8 }))).toBeLessThan(300);
    expect(time(() => layoutPack(items, { gutter: 8 }))).toBeLessThan(1500);
  });
});
