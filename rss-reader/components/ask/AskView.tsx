"use client";

import * as React from "react";
import useSWR from "swr";
import { ArrowUp, Loader2, MessageCircleQuestion, RotateCcw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/native";
import { useAiStatus } from "@/lib/hooks/useAi";
import { useReaderState } from "@/lib/hooks/useReaderState";
import type { AskSource } from "@/lib/smart";

interface Turn {
  question: string;
  answer: string | null;
  sources: AskSource[];
  error?: string;
}

const STORAGE_KEY = "ask-conversation";

/**
 * Ask your reader: a question, answered from your own feeds, with the articles it drew on.
 * The conversation stays for the session (so a follow-up can refer to the last answer).
 */
export function AskView() {
  const ai = useAiStatus();
  const { setSelectedArticleId, setMobilePane } = useReaderState();
  const { data: suggested } = useSWR<{ suggestions: string[] }>("/api/ask", {
    revalidateOnFocus: false,
  });
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const bottom = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setTurns(JSON.parse(saved) as Turn[]);
    } catch {
      // Starts empty.
    }
  }, []);
  React.useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.filter((t) => t.answer)));
    } catch {
      // Fine.
    }
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setDraft("");
    setBusy(true);
    const history = turns
      .filter((t) => t.answer)
      .slice(-3)
      .map((t) => ({ question: t.question, answer: t.answer! }));
    setTurns((all) => [...all, { question: q, answer: null, sources: [] }]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, history }),
      });
      const body = (await res.json()) as { answer?: string; sources?: AskSource[]; error?: string };
      if (!res.ok) throw new Error(body.error || "Couldn't answer that");
      haptic("light");
      setTurns((all) =>
        all.map((t, i) =>
          i === all.length - 1
            ? { ...t, answer: body.answer ?? "", sources: body.sources ?? [] }
            : t
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't answer that";
      setTurns((all) =>
        all.map((t, i) => (i === all.length - 1 ? { ...t, answer: "", error: message } : t))
      );
    } finally {
      setBusy(false);
    }
  }

  function openSource(source: AskSource) {
    setSelectedArticleId(source.id);
    setMobilePane("reader");
  }

  const suggestions = suggested?.suggestions ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex min-h-full max-w-2xl flex-col px-5 py-6 md:py-10">
          <header className="flex items-center gap-3">
            <MessageCircleQuestion className="h-6 w-6 text-primary" />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-tight">Ask your reader</h1>
              <p className="text-sm text-muted-foreground">
                Questions answered from what you follow, with the articles behind each answer.
              </p>
            </div>
            {turns.length > 0 && (
              <button
                type="button"
                onClick={() => setTurns([])}
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Start over"
                title="Start over"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </header>

          {ai && !ai.enabled && (
            <p className="mt-6 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              AI is off: add a Gemini key in the settings to ask questions.
            </p>
          )}

          {turns.length === 0 ? (
            <div className="mt-8 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Try asking
              </p>
              {[
                ...suggestions,
                "What did I miss this week?",
                "Summarise what my newsletters said about AI",
              ]
                .slice(0, 5)
                .map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void ask(s)}
                    className="flex w-full items-center gap-2 rounded-xl border bg-card/60 px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    {s}
                  </button>
                ))}
            </div>
          ) : (
            <ol className="mt-6 space-y-6" aria-live="polite">
              {turns.map((turn, i) => (
                <li key={i} className="space-y-3">
                  <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                    {turn.question}
                  </p>
                  <div className="rounded-2xl border bg-card/60 px-4 py-3 text-sm leading-relaxed">
                    {turn.answer === null ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Reading your articles…
                      </span>
                    ) : turn.error ? (
                      <span className="text-destructive">{turn.error}</span>
                    ) : (
                      <>
                        <Answer text={turn.answer} sources={turn.sources} onOpen={openSource} />
                        {turn.sources.length > 0 && (
                          <ul className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
                            {turn.sources.map((source) => (
                              <li key={source.id}>
                                <button
                                  type="button"
                                  onClick={() => openSource(source)}
                                  className="flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs hover:bg-accent"
                                  title={source.title}
                                >
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                                    {source.n}
                                  </span>
                                  <span className="truncate">{source.title}</span>
                                  <span className="shrink-0 text-muted-foreground">
                                    · {source.feed}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div ref={bottom} />
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void ask(draft);
        }}
        className="border-t bg-background/95 px-4 pb-safe pt-3 backdrop-blur"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2 pb-3">
          <textarea
            ref={input}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(draft);
              }
            }}
            rows={1}
            placeholder="Ask about anything you follow…"
            aria-label="Your question"
            enterKeyHint="send"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border bg-card px-4 py-2.5 text-base outline-none focus-visible:border-primary sm:text-sm"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            aria-label="Ask"
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
              (busy || !draft.trim()) && "opacity-40"
            )}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowUp className="h-5 w-5" />}
          </button>
        </div>
      </form>
    </div>
  );
}

/** The answer with its [n] citations as tappable chips. */
function Answer({
  text,
  sources,
  onOpen,
}: {
  text: string;
  sources: AskSource[];
  onOpen: (source: AskSource) => void;
}) {
  const parts = text.split(/(\[\d+(?:,\s*\d+)*\])/g);
  return (
    <p className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        const match = /^\[([\d,\s]+)\]$/.exec(part);
        if (!match) return <React.Fragment key={i}>{part}</React.Fragment>;
        return match[1].split(",").map((n, j) => {
          const source = sources.find((s) => s.n === Number(n.trim()));
          if (!source) return null;
          return (
            <button
              key={`${i}-${j}`}
              type="button"
              onClick={() => onOpen(source)}
              className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/15 px-1 align-text-top text-[10px] font-semibold text-primary hover:bg-primary/25"
              title={source.title}
            >
              {source.n}
            </button>
          );
        });
      })}
    </p>
  );
}
