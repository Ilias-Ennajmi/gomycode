import { describe, expect, it } from "vitest";
import { ASK_PROBLEM_TEXT, askReducer, cleanQuestion, insertProblem, looksLikeQuestion, type AskRow, type AskState } from "@/lib/askState";
import { toAsk } from "@/lib/ask";

const IDLE: AskState = { phase: "idle" };
const row = (p: Partial<AskRow> = {}): AskRow => ({ id: "a1", question: "What about hooks?", status: "queued", answer: null, citedSaveIds: [], error: null, createdAt: "2026-11-10T10:00:00Z", ...p });

const run = (events: Parameters<typeof askReducer>[1][], from: AskState = IDLE) => events.reduce(askReducer, from);

describe("Ask your saves: state machine", () => {
  it("goes idle → sending → thinking → answered", () => {
    let s = askReducer(IDLE, { type: "submit", question: "  What   about hooks? ", online: true });
    expect(s).toEqual({ phase: "sending", question: "What about hooks?" });
    s = askReducer(s, { type: "inserted", row: row() });
    expect(s).toEqual({ phase: "thinking", question: "What about hooks?", id: "a1", step: "queued" });
    s = askReducer(s, { type: "row", row: row({ status: "running" }) });
    expect(s).toMatchObject({ phase: "thinking", step: "running" });
    s = askReducer(s, { type: "row", row: row({ status: "ready", answer: "Open with the result.", citedSaveIds: ["sv-01", "sv-05"] }) });
    expect(s).toEqual({ phase: "answered", question: "What about hooks?", id: "a1", answer: "Open with the result.", cited: ["sv-01", "sv-05"] });
  });

  it("refuses an empty question and an offline phone before anything is sent", () => {
    expect(askReducer(IDLE, { type: "submit", question: " ", online: true })).toMatchObject({ phase: "problem", problem: "too_short" });
    expect(askReducer(IDLE, { type: "submit", question: "hooks?", online: false })).toMatchObject({ phase: "problem", problem: "offline" });
  });

  it("turns SQLSTATE 54000 into the daily limit", () => {
    expect(insertProblem("54000")).toBe("limit");
    expect(insertProblem("42501")).toBe("failed");
    const s = run([{ type: "submit", question: "hooks?", online: true }, { type: "insert_failed", code: "54000" }]);
    expect(s).toEqual({ phase: "problem", question: "hooks?", problem: "limit" });
    expect(ASK_PROBLEM_TEXT.limit).toMatch(/today's limit/);
  });

  it("says to add an AI key when the worker answers no_ai", () => {
    const s = run([
      { type: "submit", question: "hooks?", online: true },
      { type: "inserted", row: row() },
      { type: "row", row: row({ status: "failed", error: "no_ai" }) },
    ]);
    expect(s).toMatchObject({ phase: "problem", problem: "no_ai" });
    expect(ASK_PROBLEM_TEXT.no_ai).toBe("Add an AI key to ask questions.");
    const other = run([
      { type: "submit", question: "hooks?", online: true },
      { type: "inserted", row: row() },
      { type: "row", row: row({ status: "failed", error: "provider timeout" }) },
    ]);
    expect(other).toMatchObject({ phase: "problem", problem: "failed" });
  });

  it("ignores rows of another ask and never leaves an answer", () => {
    const thinking = run([{ type: "submit", question: "hooks?", online: true }, { type: "inserted", row: row() }]);
    expect(askReducer(thinking, { type: "row", row: row({ id: "other", status: "ready", answer: "x" }) })).toBe(thinking);
    const answered = askReducer(thinking, { type: "row", row: row({ status: "ready", answer: "Yes." }) });
    expect(askReducer(answered, { type: "row", row: row({ status: "running" }) })).toBe(answered);
    expect(askReducer(answered, { type: "timeout" })).toBe(answered);
    expect(askReducer(answered, { type: "insert_failed", code: "54000" })).toBe(answered);
  });

  it("times out only while thinking, and resets", () => {
    const thinking = run([{ type: "submit", question: "hooks?", online: true }, { type: "inserted", row: row() }]);
    expect(askReducer(thinking, { type: "timeout" })).toMatchObject({ phase: "problem", problem: "timeout" });
    expect(askReducer(thinking, { type: "reset" })).toEqual(IDLE);
  });

  it("an answer that is already there on insert shows at once; an empty one gets the plain line", () => {
    const s = run([{ type: "submit", question: "hooks?", online: true }, { type: "inserted", row: row({ status: "ready", answer: "  " }) }]);
    expect(s).toMatchObject({ phase: "answered", answer: "Nothing in your saves about that yet.", cited: [] });
  });
});

describe("Ask helpers", () => {
  it("cleans questions to the table's limits", () => {
    expect(cleanQuestion("  a\n b  ")).toBe("a b");
    expect(cleanQuestion("x".repeat(900))).toHaveLength(500);
  });

  it("spots a question in the search box", () => {
    expect(looksLikeQuestion("what did I save about pricing")).toBe(true);
    expect(looksLikeQuestion("best pastel de nata?")).toBe(true);
    expect(looksLikeQuestion("harissa")).toBe(false);
    expect(looksLikeQuestion("hooks ads")).toBe(false);
  });

  it("maps a row from the database", () => {
    expect(
      toAsk({ id: "a", question: "q?", status: "ready", answer: "A", cited_save_ids: ["s1"], error: null, created_at: "t" }),
    ).toEqual({ id: "a", question: "q?", status: "ready", answer: "A", citedSaveIds: ["s1"], error: null, createdAt: "t" });
    expect(toAsk({ id: "a", question: "q?", status: "queued", answer: null, cited_save_ids: null as never, error: null, created_at: "t" }).citedSaveIds).toEqual([]);
  });
});
