import { describe, expect, it } from "vitest";
import { DUE_CARDS_SELECT, fetchDueCards, keptCardRows } from "@/lib/loop";

const row = (id: string, kept: boolean | null, shape: "object" | "array" = "object") => {
  const states = kept === null ? null : { kept };
  const save = { states: shape === "array" && states ? [states] : states };
  return {
    id,
    save_id: `s-${id}`,
    prompt: "q",
    answer: "a",
    ease: "2.5",
    interval_days: 0,
    repetitions: 0,
    due_at: "2026-11-01T00:00:00Z",
    saves: shape === "array" ? [save] : save,
  };
};

function fakeClient(rows: unknown[]) {
  const calls: unknown[][] = [];
  const chain = {
    from: (t: string) => (calls.push(["from", t]), chain),
    select: (c: string) => (calls.push(["select", c]), chain),
    eq: (c: string, v: unknown) => (calls.push(["eq", c, v]), chain),
    lte: (c: string, v: unknown) => (calls.push(["lte", c, v]), chain),
    order: (c: string) => (calls.push(["order", c]), chain),
    limit: (n: number) => (calls.push(["limit", n]), Promise.resolve({ data: rows, error: null })),
  };
  return { chain, calls };
}

describe("fetchDueCards", () => {
  it("filters on kept in the query (inner joins through saves to states)", async () => {
    const { chain, calls } = fakeClient([row("c1", true)]);
    const now = new Date("2026-11-10T08:00:00Z");
    const cards = await fetchDueCards(chain as never, now);
    expect(DUE_CARDS_SELECT).toContain("saves!inner(states!inner(kept))");
    expect(calls).toContainEqual(["select", DUE_CARDS_SELECT]);
    expect(calls).toContainEqual(["eq", "saves.states.kept", true]);
    expect(calls).toContainEqual(["lte", "due_at", now.toISOString()]);
    expect(calls).toContainEqual(["limit", 100]);
    expect(cards).toEqual([
      { id: "c1", saveId: "s-c1", prompt: "q", answer: "a", ease: 2.5, intervalDays: 0, repetitions: 0, dueAt: "2026-11-01T00:00:00Z" },
    ]);
  });

  it("still drops unkept rows if the server returns any (safety net)", async () => {
    const { chain } = fakeClient([row("c1", false), row("c2", true, "array"), row("c3", null), row("c4", true)]);
    const cards = await fetchDueCards(chain as never);
    expect(cards.map((c) => c.id)).toEqual(["c2", "c4"]);
  });

  it("keptCardRows accepts object and array embeds", () => {
    expect(keptCardRows([row("a", true), row("b", true, "array"), row("c", false, "array")]).map((r) => r.id)).toEqual(["a", "b"]);
  });
});
