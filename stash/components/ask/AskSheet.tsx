"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, ChevronRight, History, Sparkles } from "lucide-react";
import { AiLabel } from "@/components/ui/AiLabel";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { cardText } from "@/components/library/SaveGrid";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { createAsk, fetchRecentAsks, watchAsk } from "@/lib/ask";
import { ASK_MAX, ASK_PROBLEM_TEXT, askReducer, type AskRow, type AskState } from "@/lib/askState";
import { haptic } from "@/lib/haptics";
import type { SaveItem } from "@/lib/data";

const EXAMPLES = ["What did I save about hooks?", "Where should I eat in Lisbon?", "Ideas for a quick dinner"];

/** The saves an answer leans on, as cards you can open. */
function Cited({ ids, saves, thumbs, onOpen }: { ids: string[]; saves: Map<string, SaveItem>; thumbs: Record<string, string>; onOpen: (s: SaveItem) => void }) {
  const list = ids.map((id) => saves.get(id)).filter((s): s is SaveItem => Boolean(s));
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-label text-fg-muted">From {list.length === 1 ? "this save" : `these ${list.length} saves`}</h3>
      <ul className="flex flex-col gap-2">
        {list.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onOpen(s)} className="press flex w-full items-center gap-3 rounded-lg bg-surface p-2 text-left shadow-pop">
              <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded-card bg-raised">
                {s.thumbPath && thumbs[s.thumbPath] && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                  <img src={thumbs[s.thumbPath]} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-label text-fg">{cardText(s)}</span>
                <span className="flex items-center gap-2 text-caption text-fg-muted">
                  <PlatformBadge platform={s.platform} />
                  {s.creator && <span className="truncate">@{s.creator.replace(/^@/, "")}</span>}
                </span>
              </span>
              <ChevronRight size={20} strokeWidth={2} aria-hidden className="shrink-0 text-fg-subtle" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Ask your saves: a question goes in as a row in `asks`, the worker answers from the
 * saves only, and the answer shows with the saves it came from. It is written by the AI,
 * so it wears the insight colour.
 */
export function AskSheet({
  open,
  onClose,
  initialQuestion,
  saves,
  thumbs,
  onOpenSave,
}: {
  open: boolean;
  onClose: () => void;
  /** Asked straight away when the sheet opens (from the search box). */
  initialQuestion?: string;
  saves: SaveItem[];
  thumbs: Record<string, string>;
  onOpenSave: (s: SaveItem) => void;
}) {
  const [state, dispatch] = useReducer(askReducer, { phase: "idle" } as AskState);
  const [text, setText] = useState("");
  const [recent, setRecent] = useState<AskRow[]>([]);
  const [shown, setShown] = useState<AskRow | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const asked = useRef<string | null>(null);
  const byId = useMemo(() => new Map(saves.map((s) => [s.id, s])), [saves]);

  const ask = (raw: string) => {
    stop.current?.();
    setShown(null);
    dispatch({ type: "reset" });
    dispatch({ type: "submit", question: raw, online: navigator.onLine });
    const question = raw.replace(/\s+/g, " ").trim().slice(0, ASK_MAX);
    if (question.length < 2 || !navigator.onLine) return;
    haptic();
    setText("");
    createAsk(question)
      .then((row) => {
        dispatch({ type: "inserted", row });
        if (row.status === "ready" || row.status === "failed") return;
        stop.current = watchAsk(
          row.id,
          (r) => {
            dispatch({ type: "row", row: r });
            if (r.status === "ready") setRecent((prev) => [r, ...prev.filter((x) => x.id !== r.id)].slice(0, 6));
          },
          () => dispatch({ type: "timeout" }),
        );
      })
      .catch((e: { code?: string }) => dispatch({ type: "insert_failed", code: e?.code }));
  };

  useEffect(() => {
    if (!open) {
      stop.current?.();
      stop.current = null;
      asked.current = null;
      return;
    }
    void fetchRecentAsks().then(setRecent).catch(() => {});
    if (initialQuestion && asked.current !== initialQuestion) {
      asked.current = initialQuestion;
      // The question typed in the search box is asked as the sheet opens.
      ask(initialQuestion);
    }
  }, [open, initialQuestion]);

  useEffect(() => () => stop.current?.(), []);

  const busy = state.phase === "sending" || state.phase === "thinking";
  const view: { question: string; answer: string; cited: string[] } | null =
    state.phase === "answered"
      ? { question: state.question, answer: state.answer, cited: state.cited }
      : shown
        ? { question: shown.question, answer: shown.answer ?? "", cited: shown.citedSaveIds }
        : null;
  const earlier = recent.filter((r) => r.status === "ready" && r.answer && (state.phase !== "answered" || r.id !== state.id) && r.id !== shown?.id);

  return (
    <Sheet open={open} onClose={onClose} label="Ask your saves" title="Ask your saves">
      <div className="flex flex-col gap-5">
        <form
          className="flex items-center gap-2 rounded-full border border-line bg-raised pl-5 pr-1 focus-within:border-fg"
          onSubmit={(e) => {
            e.preventDefault();
            ask(text);
          }}
        >
          <label htmlFor="ask-question" className="sr-only">
            Your question
          </label>
          <input
            id="ask-question"
            value={text}
            maxLength={ASK_MAX}
            enterKeyHint="send"
            autoComplete="off"
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask about anything you saved…"
            className="h-14 min-w-0 flex-1 bg-transparent text-input text-fg outline-none placeholder:text-fg-subtle"
          />
          <button
            type="submit"
            aria-label="Ask"
            disabled={busy || text.trim().length < 2}
            className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent disabled:opacity-40"
          >
            <ArrowUp size={24} strokeWidth={2.25} aria-hidden />
          </button>
        </form>

        <div aria-live="polite" className="flex flex-col gap-4">
          {busy && (
            <div className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-pop">
              <p className="text-heading">{state.question}</p>
              <AiLabel text={state.phase === "thinking" && state.step === "running" ? "Reading your saves…" : "Looking through your saves…"} />
              <Skeleton shape="line" />
              <Skeleton shape="line" className="w-2/3" />
            </div>
          )}

          {state.phase === "problem" && (
            <div className="flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-pop">
              {state.question && <p className="text-heading">{state.question}</p>}
              <p className="flex items-start gap-3 text-body text-fg-muted">
                <Sparkles size={20} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-insight" />
                <span>
                  {ASK_PROBLEM_TEXT[state.problem]}{" "}
                  {state.problem === "no_ai" && (
                    <Link href="/settings#setup" className="text-label text-fg underline">
                      See Setup
                    </Link>
                  )}
                </span>
              </p>
            </div>
          )}

          {view && !busy && state.phase !== "problem" && (
            <article className="rise-in flex flex-col gap-4">
              <div className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-pop ring-1 ring-insight/40">
                <p className="text-heading">{view.question}</p>
                <AiLabel text="Answer from your saves" />
                <p className="whitespace-pre-line text-body text-fg">{view.answer}</p>
              </div>
              <Cited ids={view.cited} saves={byId} thumbs={thumbs} onOpen={onOpenSave} />
            </article>
          )}
        </div>

        {state.phase === "idle" && !shown && (
          <div className="flex flex-col gap-2">
            <p className="text-body text-fg-muted">Answers come only from what you saved, with the saves they came from.</p>
            <ul className="flex flex-wrap gap-2">
              {EXAMPLES.map((q) => (
                <li key={q}>
                  <button type="button" onClick={() => ask(q)} className="press flex min-h-12 items-center rounded-full border border-line bg-surface px-4 text-left text-label text-fg">
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {earlier.length > 0 && !busy && (
          <section aria-labelledby="ask-earlier" className="flex flex-col gap-1">
            <h3 id="ask-earlier" className="flex items-center gap-2 text-label text-fg-muted">
              <History size={16} strokeWidth={2} aria-hidden /> Earlier
            </h3>
            <ul className="flex flex-col">
              {earlier.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: "reset" });
                      setShown(r);
                    }}
                    className={cx("press flex min-h-12 w-full items-center gap-2 rounded-card px-2 text-left text-body text-fg hover:bg-raised")}
                  >
                    <span className="line-clamp-1 flex-1">{r.question}</span>
                    <ChevronRight size={20} strokeWidth={2} aria-hidden className="shrink-0 text-fg-subtle" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  );
}
