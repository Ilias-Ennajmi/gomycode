"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/shared/Logo";
import { haptic } from "@/lib/native";
import { cacheLaterForOffline } from "@/components/layout/OfflineSupport";

type State =
  | { status: "saving" }
  | { status: "saved"; articleId: string; title: string; existed: boolean }
  | { status: "error"; message: string };

export function ShareSave({ link, title }: { link: string | null; title?: string }) {
  const [state, setState] = React.useState<State>(
    link
      ? { status: "saving" }
      : { status: "error", message: "There was no link in what you shared." }
  );
  const started = React.useRef(false);

  React.useEffect(() => {
    if (!link || started.current) return;
    started.current = true;
    fetch("/api/later", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: link }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not save this link");
        haptic();
        cacheLaterForOffline();
        setState({
          status: "saved",
          articleId: body.article.id,
          title: body.article.title || title || link,
          existed: Boolean(body.existed),
        });
      })
      .catch((error) =>
        setState({
          status: "error",
          message: error instanceof Error ? error.message : "Could not save this link",
        })
      );
  }, [link, title]);

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
      <Logo className="h-12 w-12" />
      {state.status === "saving" && (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Saving to Later…</p>
        </>
      )}
      {state.status === "saved" && (
        <>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Check className="h-5 w-5 text-emerald-500" />
            {state.existed ? "Already in Later" : "Saved to Later"}
          </div>
          <p className="line-clamp-3 text-sm text-muted-foreground">{state.title}</p>
          <div className="flex w-full gap-2">
            <Button asChild variant="outline" className="h-11 flex-1">
              <Link href="/reader?view=later" replace>
                Open Later
              </Link>
            </Button>
            <Button asChild className="h-11 flex-1">
              <Link href={`/reader?view=later&article=${state.articleId}`} replace>
                Read now
              </Link>
            </Button>
          </div>
        </>
      )}
      {state.status === "error" && (
        <>
          <div className="flex items-center gap-2 text-lg font-semibold">
            <TriangleAlert className="h-5 w-5 text-amber-500" />
            Couldn’t save
          </div>
          <p className="text-sm text-muted-foreground">{state.message}</p>
          <Button asChild variant="outline" className="h-11 w-full">
            <Link href="/reader" replace>
              Open Reader
            </Link>
          </Button>
        </>
      )}
    </div>
  );
}
