"use client";

import * as React from "react";
import { BookA, Languages, Lightbulb, Loader2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { TRANSLATE_LANGUAGES } from "@/components/articles/TranslateMenu";
import type { SelectionAction } from "@/lib/smart";

export const SELECTION_ACTIONS: { id: SelectionAction; label: string; icon: React.ReactNode }[] = [
  { id: "explain", label: "Explain", icon: <Lightbulb className="h-4 w-4" /> },
  { id: "define", label: "Define", icon: <BookA className="h-4 w-4" /> },
  { id: "translate", label: "Translate", icon: <Languages className="h-4 w-4" /> },
];

export interface SelectionRequest {
  text: string;
  action: SelectionAction;
  title: string;
}

/** A hand with a passage: its explanation, a definition or a translation, in a sheet. */
export function SelectionHelp({
  request,
  onClose,
}: {
  request: SelectionRequest | null;
  onClose: () => void;
}) {
  const [result, setResult] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [to, setTo] = React.useState(() => {
    try {
      return localStorage.getItem("translate-to") || "en";
    } catch {
      return "en";
    }
  });

  React.useEffect(() => {
    if (!request) return;
    let cancelled = false;
    setResult(null);
    setError(null);
    fetch("/api/ai/selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, to }),
    })
      .then(async (res) => {
        const body = (await res.json()) as { result?: string; error?: string };
        if (!res.ok) throw new Error(body.error || "AI couldn't help with that");
        if (!cancelled) setResult(body.result ?? "");
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [request, to]);

  const action = SELECTION_ACTIONS.find((a) => a.id === request?.action);
  return (
    <Sheet
      open={Boolean(request)}
      onOpenChange={(open) => !open && onClose()}
      title={
        <span className="flex items-center gap-2">
          <span className="text-primary">{action?.icon}</span> {action?.label}
        </span>
      }
    >
      <div className="px-3" data-scroll>
        {request && (
          <blockquote className="mb-3 line-clamp-3 border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">
            {request.text}
          </blockquote>
        )}
        {request?.action === "translate" && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TRANSLATE_LANGUAGES.map((language) => (
              <button
                key={language.id}
                type="button"
                onClick={() => {
                  setTo(language.id);
                  try {
                    localStorage.setItem("translate-to", language.id);
                  } catch {
                    // Fine.
                  }
                }}
                aria-pressed={to === language.id}
                className={
                  to === language.id
                    ? "rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                    : "rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent"
                }
              >
                {language.label}
              </button>
            ))}
          </div>
        )}
        {error ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {error}
          </p>
        ) : result === null ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </p>
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{result}</p>
        )}
      </div>
    </Sheet>
  );
}
