import { describe, expect, it } from "vitest";
import { frameIntervalsMs, longTasks, percentile, summarise, type TraceEvent } from "../../bench/stats";

const draw = (ts: number, tree = 1): TraceEvent => ({ name: "DrawFrame", ph: "I", ts, pid: 1, tid: 1, args: { layerTreeId: tree } });

describe("percentile", () => {
  it("is nearest-rank", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(xs, 95)).toBe(95);
    expect(percentile(xs, 50)).toBe(50);
    expect(percentile(xs, 100)).toBe(100);
    expect(percentile(xs, 0)).toBe(1);
  });
  it("does not need sorted input and does not mutate it", () => {
    const xs = [5, 1, 4, 2, 3];
    expect(percentile(xs, 60)).toBe(3);
    expect(xs).toEqual([5, 1, 4, 2, 3]);
  });
  it("is NaN for nothing", () => {
    expect(percentile([], 50)).toBeNaN();
  });
});

describe("frameIntervalsMs", () => {
  it("returns the gaps between DrawFrame events", () => {
    const events = Array.from({ length: 50 }, (_, i) => draw(1_000_000 + i * 16_700));
    const gaps = frameIntervalsMs(events);
    expect(gaps).toHaveLength(49);
    for (const g of gaps) expect(g).toBeCloseTo(16.7, 5);
  });
  it("drops idle gaps over 250 ms", () => {
    const gaps = frameIntervalsMs([draw(0), draw(16_700), draw(16_700 + 400_000), draw(16_700 + 400_000 + 16_700)]);
    expect(gaps).toHaveLength(2);
  });
  it("keeps layer trees apart and ignores other events", () => {
    const events: TraceEvent[] = [draw(0, 1), draw(10_000, 2), draw(16_000, 1), draw(30_000, 2), { name: "RunTask", ph: "X", ts: 5000, dur: 10, pid: 1, tid: 1 }];
    expect(frameIntervalsMs(events).sort((a, b) => a - b)).toEqual([16, 20]);
  });
  it("sorts events that arrive out of order", () => {
    expect(frameIntervalsMs([draw(33_400), draw(0), draw(16_700)])).toHaveLength(2);
  });
  it("is empty with fewer than two frames", () => {
    expect(frameIntervalsMs([])).toEqual([]);
    expect(frameIntervalsMs([draw(1)])).toEqual([]);
  });
});

describe("longTasks", () => {
  it("counts only RunTask events of at least 50 ms", () => {
    const task = (dur: number, name = "RunTask"): TraceEvent => ({ name, ph: "X", ts: 0, dur, pid: 1, tid: 1 });
    expect(longTasks([task(49_999), task(50_000), task(120_000), task(900_000, "FunctionCall")])).toBe(2);
    expect(longTasks([task(30_000)], 20)).toBe(1);
    expect(longTasks([])).toBe(0);
  });
});

describe("summarise", () => {
  it("derives fps from the mean interval", () => {
    const s = summarise(Array.from({ length: 60 }, () => 20));
    expect(s.fps).toBeCloseTo(50, 5);
    expect(s.p95).toBe(20);
    expect(s.frames).toBe(60);
  });
  it("reports tail latency", () => {
    const s = summarise([...Array.from({ length: 95 }, () => 16), ...Array.from({ length: 5 }, () => 80)]);
    expect(s.p50).toBe(16);
    expect(s.p95).toBe(16);
    expect(s.p99).toBe(80);
  });
  it("is all NaN for no frames", () => {
    const s = summarise([]);
    expect(s.fps).toBeNaN();
    expect(s.frames).toBe(0);
  });
});
