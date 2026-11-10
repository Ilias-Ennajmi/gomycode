import type { Enums } from "@/lib/supabase/types";

/*
 * "Ask your saves": the small state machine behind the sheet. Pure, so it is unit-tested.
 * The phone inserts a row in `asks` (question only); the worker answers it; the row
 * comes back through Realtime (or a poll).
 */

export type AskRow = {
  id: string;
  question: string;
  status: Enums<"ask_status">;
  answer: string | null;
  citedSaveIds: string[];
  error: string | null;
  createdAt: string;
};

export type AskProblem = "limit" | "no_ai" | "offline" | "too_short" | "timeout" | "failed";

export type AskState =
  | { phase: "idle" }
  | { phase: "sending"; question: string }
  | { phase: "thinking"; question: string; id: string; step: "queued" | "running" }
  | { phase: "answered"; question: string; id: string; answer: string; cited: string[] }
  | { phase: "problem"; question: string; problem: AskProblem };

export type AskEvent =
  | { type: "submit"; question: string; online: boolean }
  | { type: "inserted"; row: AskRow }
  | { type: "row"; row: AskRow }
  | { type: "insert_failed"; code?: string | null }
  | { type: "timeout" }
  | { type: "reset" };

export const ASK_MIN = 2;
export const ASK_MAX = 500;

/** Trimmed, single spaces, at most 500 characters. */
export function cleanQuestion(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, ASK_MAX);
}

/** The database raises SQLSTATE 54000 past the daily limit (config ask_daily_limit). */
export function insertProblem(code: string | null | undefined): AskProblem {
  return code === "54000" ? "limit" : "failed";
}

function fromRow(row: AskRow): AskState {
  if (row.status === "ready") {
    return { phase: "answered", question: row.question, id: row.id, answer: row.answer?.trim() || "Nothing in your saves about that yet.", cited: row.citedSaveIds };
  }
  if (row.status === "failed") return { phase: "problem", question: row.question, problem: row.error === "no_ai" ? "no_ai" : "failed" };
  return { phase: "thinking", question: row.question, id: row.id, step: row.status === "running" ? "running" : "queued" };
}

export function askReducer(state: AskState, event: AskEvent): AskState {
  switch (event.type) {
    case "reset":
      return { phase: "idle" };
    case "submit": {
      const question = cleanQuestion(event.question);
      if (question.length < ASK_MIN) return { phase: "problem", question, problem: "too_short" };
      if (!event.online) return { phase: "problem", question, problem: "offline" };
      return { phase: "sending", question };
    }
    case "inserted":
      return state.phase === "sending" ? fromRow(event.row) : state;
    case "row":
      // Only the ask on screen moves the state; a finished answer never goes back to thinking.
      if (state.phase === "thinking" && state.id === event.row.id) return fromRow(event.row);
      return state;
    case "insert_failed":
      return state.phase === "sending" ? { phase: "problem", question: state.question, problem: insertProblem(event.code) } : state;
    case "timeout":
      return state.phase === "thinking" ? { phase: "problem", question: state.question, problem: "timeout" } : state;
    default:
      return state;
  }
}

export const ASK_PROBLEM_TEXT: Record<AskProblem, string> = {
  limit: "That's today's limit for questions. Ask again tomorrow.",
  no_ai: "Add an AI key to ask questions.",
  offline: "Asking needs a connection. Search still works on what's on the phone.",
  too_short: "Type a question first.",
  timeout: "This is taking longer than usual. The answer will show under Earlier once it's ready.",
  failed: "The answer didn't come through. Try again.",
};

/** Whether a search box entry reads like a question worth offering "Ask" for. */
export function looksLikeQuestion(text: string): boolean {
  const q = text.trim().toLowerCase();
  if (q.length < 8) return false;
  if (q.endsWith("?")) return true;
  return /^(what|which|who|how|why|when|where|is|are|do|does|did|can|could|should|tell me|show me|find)\b/.test(q) && q.split(/\s+/).length >= 3;
}
