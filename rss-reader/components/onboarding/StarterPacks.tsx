"use client";

import * as React from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CATALOG, CATALOG_CATEGORIES, type CatalogEntry } from "@/lib/discover/catalog";
import { useFeeds } from "@/lib/hooks/useFeeds";
import { useT } from "@/lib/i18n";
import { haptic } from "@/lib/native";
import { SourcePreview } from "@/components/discover/SourcePreview";

const PACK_SIZE = 6;
const EMOJI: Record<string, string> = {
  tech: "💻",
  design: "🎨",
  marketing: "📣",
  business: "🚀",
  productivity: "⏱️",
  creativity: "🖌️",
  science: "🔬",
  finance: "📈",
  news: "🗞️",
  culture: "📚",
  health: "🏃",
  food: "🍳",
  travel: "✈️",
  gaming: "🎮",
  sports: "⚽",
};

/** The pack for a category: its best sources in the chosen language, topped up from English. */
function packFor(category: string, lang: "en" | "fr"): CatalogEntry[] {
  const own = CATALOG.filter((e) => e.category === category && e.lang === lang);
  const rest =
    lang === "en" ? [] : CATALOG.filter((e) => e.category === category && e.lang === "en");
  return [...own, ...rest].slice(0, PACK_SIZE);
}

/**
 * Starter packs: on the first open (nothing followed yet) and from Settings, pick the
 * interests you want and follow a curated bundle for each in one tap. Each pack lands in a
 * category of its own, so the sidebar is organised from the start.
 */
export function StarterPacks({
  open,
  onOpenChange,
  firstRun = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  firstRun?: boolean;
}) {
  const { t, locale } = useT();
  const [lang, setLang] = React.useState<"en" | "fr">(locale);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  // A source of a picked pack, looked inside before following the lot.
  const [preview, setPreview] = React.useState<(CatalogEntry & { pack: string }) | null>(null);
  const [previewPending, setPreviewPending] = React.useState(false);
  const { feeds, mutate } = useFeeds();
  const followed = React.useMemo(() => new Set(feeds.map((f) => f.url)), [feeds]);

  const packs = React.useMemo(
    () =>
      CATALOG_CATEGORIES.map((c) => ({ ...c, entries: packFor(c.id, lang) })).filter(
        (p) => p.entries.length > 0
      ),
    [lang]
  );
  const chosen = packs.filter((p) => picked.has(p.id));
  const toFollow = chosen.flatMap((p) =>
    p.entries.filter((e) => !followed.has(e.url)).map((e) => ({ ...e, pack: p.name }))
  );

  async function followOne(entry: CatalogEntry & { pack: string }) {
    setPreviewPending(true);
    try {
      const res = await fetch("/api/feeds/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ url: entry.url, categoryName: entry.pack, language: entry.lang }],
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { followed?: number };
      if (!res.ok || !body.followed) throw new Error(`Couldn't follow ${entry.name}`);
      await mutate();
      haptic("success");
      toast.success(`Following ${entry.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't follow");
    } finally {
      setPreviewPending(false);
    }
  }

  async function follow() {
    if (toFollow.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/feeds/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: toFollow.map((e) => ({ url: e.url, categoryName: e.pack, language: e.lang })),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { followed?: number; failed?: string[] };
      if (!res.ok) throw new Error("Couldn't follow those");
      await mutate();
      haptic("success");
      toast.success(`Following ${body.followed ?? toFollow.length} new sources`, {
        description:
          body.failed && body.failed.length > 0
            ? `${body.failed.length} couldn't be reached; try them later from Discover.`
            : "Their latest stories are on their way.",
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't follow those");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92vh,820px)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className="border-b px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Sparkles className="h-5 w-5 text-primary" />
            {firstRun ? t("What do you want to read?") : t("Starter packs")}
          </DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Pick a few interests. Each one follows a handful of good sources, sorted into its own category."
            )}
          </p>
          <div className="mt-3 flex gap-1 rounded-full bg-muted p-0.5 text-xs font-medium w-fit">
            {(["en", "fr"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setLang(id)}
                aria-pressed={lang === id}
                className={cn(
                  "rounded-full px-3 py-1 transition-colors",
                  lang === id ? "bg-background shadow-sm" : "text-muted-foreground"
                )}
              >
                {id === "en" ? "English" : "Français"}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {packs.map((pack) => {
              const on = picked.has(pack.id);
              const already = pack.entries.filter((e) => followed.has(e.url)).length;
              return (
                <li key={pack.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => {
                      haptic();
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (next.has(pack.id)) next.delete(pack.id);
                        else next.add(pack.id);
                        return next;
                      });
                    }}
                    className={cn(
                      "relative flex h-full w-full flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-all",
                      on
                        ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary))]"
                        : "hover:bg-accent/60"
                    )}
                  >
                    <span className="text-2xl" aria-hidden>
                      {EMOJI[pack.id] ?? "✨"}
                    </span>
                    <span className="text-sm font-semibold leading-snug">{pack.name}</span>
                    <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                      {pack.entries
                        .slice(0, 3)
                        .map((e) => e.name)
                        .join(" · ")}
                    </span>
                    <span className="mt-auto pt-1 text-[11px] text-muted-foreground">
                      {pack.entries.length} sources
                      {already > 0 ? ` · ${already} followed` : ""}
                    </span>
                    {on && (
                      <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {chosen.length > 0 && (
            <div className="mt-5 space-y-4">
              {chosen.map((pack) => (
                <section key={pack.id} aria-label={pack.name}>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("In")} {pack.name}
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {pack.entries.map((entry) => {
                      const isFollowed = followed.has(entry.url);
                      return (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setPreview({ ...entry, pack: pack.name })}
                          className="inline-flex h-8 max-w-full items-center gap-1 rounded-full bg-muted px-3 text-xs font-medium transition-colors hover:bg-accent"
                        >
                          {isFollowed && <Check className="h-3 w-3 text-primary" />}
                          <span className="truncate">{entry.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              <p className="text-[11px] text-muted-foreground">
                {t("Tap a source to look inside before following.")}
              </p>
            </div>
          )}
        </div>
        {preview && (
          <SourcePreview
            result={{
              url: preview.url,
              name: preview.name,
              kind: preview.kind,
              lang: preview.lang,
              description: preview.description,
              provider: "catalog",
              category: preview.pack,
            }}
            following={followed.has(preview.url)}
            pending={previewPending}
            onFollow={() => void followOne(preview)}
            onClose={() => setPreview(null)}
          />
        )}
        <div className="flex items-center gap-3 border-t p-3 pb-safe">
          {firstRun && (
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-full px-4 text-sm text-muted-foreground hover:bg-accent"
            >
              {t("I'll add my own")}
            </button>
          )}
          <button
            type="button"
            disabled={toFollow.length === 0 || busy}
            onClick={() => void follow()}
            className="ml-auto flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {toFollow.length > 0
              ? `${t("Follow")} ${toFollow.length} ${t("sources")}`
              : t("Pick an interest")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
