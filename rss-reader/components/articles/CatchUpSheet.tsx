"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCheck, Loader2, Sparkles } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/native";
import { markAllRead } from "@/lib/hooks/useFeeds";
import { useReaderState } from "@/lib/hooks/useReaderState";
import { useSWRConfig } from "swr";

interface Bullet {
  text: string;
  articles: { id: string; title: string; feed: string }[];
}

/** What to ask the catch-up for: the list on screen, as the API's scope. */
export function catchUpScope(
  view: { type: string; id?: string },
  listParams: { source?: string; categoryId?: string }
) {
  if (view.type === "feed") return { feedId: view.id };
  if (view.type === "category") return { categoryId: view.id };
  if (view.type === "news") return { news: view.id ?? "all" };
  if (listParams.categoryId) return { categoryId: listParams.categoryId };
  return { source: listParams.source };
}

/**
 * "Catch me up": a few bullets over everything unread in the list, each pointing at the
 * articles behind it, and one button to mark them all read.
 */
export function CatchUpSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { view, listParams, setSelectedArticleId, setMobilePane } = useReaderState();
  const { mutate } = useSWRConfig();
  const [state, setState] = React.useState<{
    bullets: Bullet[];
    articleIds: string[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [marking, setMarking] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState(null);
    setError(null);
    fetch("/api/catchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(catchUpScope(view, listParams)),
    })
      .then(async (res) => {
        const body = (await res.json()) as {
          bullets?: Bullet[];
          articleIds?: string[];
          error?: string;
        };
        if (!res.ok) throw new Error(body.error || "Couldn't write the catch-up");
        if (!cancelled)
          setState({ bullets: body.bullets ?? [], articleIds: body.articleIds ?? [] });
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
    // The scope is fixed when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function markRead() {
    if (!state) return;
    setMarking(true);
    try {
      await markAllRead({ ids: state.articleIds });
      haptic("success");
      toast.success(`${state.articleIds.length} marked read`);
      await mutate((key) => typeof key === "string" && key.startsWith("/api/articles"));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark them read");
    } finally {
      setMarking(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Catch me up
        </span>
      }
    >
      <div className="px-3" data-scroll>
        {error ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            {error}
          </p>
        ) : !state ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading what you haven&apos;t…
          </p>
        ) : state.bullets.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            Nothing unread here. You&apos;re caught up.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {state.articleIds.length} unread article{state.articleIds.length === 1 ? "" : "s"}, in
              a few lines.
            </p>
            <ul className="space-y-3">
              {state.bullets.map((bullet, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed">{bullet.text}</p>
                    {bullet.articles.length > 0 && (
                      <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                        {bullet.articles.map((article) => (
                          <button
                            key={article.id}
                            type="button"
                            onClick={() => {
                              setSelectedArticleId(article.id);
                              setMobilePane("reader");
                              onOpenChange(false);
                            }}
                            className="max-w-full truncate text-left text-primary hover:underline"
                            title={`${article.title} · ${article.feed}`}
                          >
                            {article.feed}: {article.title}
                          </button>
                        ))}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {state && state.articleIds.length > 0 && (
        <div className="px-3 pt-5">
          <Button className="w-full gap-2" onClick={() => void markRead()} disabled={marking}>
            {marking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            Mark these {state.articleIds.length} read
          </Button>
        </div>
      )}
    </Sheet>
  );
}
