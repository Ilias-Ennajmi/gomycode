"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AtSign, Hash, MapPin, Play, Target, X, type LucideIcon } from "lucide-react";
import { AiLabel } from "@/components/ui/AiLabel";
import { IconButton } from "@/components/ui/IconButton";
import { cx } from "@/components/ui/cx";
import { KIND_LABEL, type AutoCollection, type CollectionKind } from "@/lib/collections";
import { getBrowserClient } from "@/lib/supabase/client";

const ICON: Record<CollectionKind, LucideIcon> = { tag: Hash, creator: AtSign, intent: Target, places: MapPin };

/** A row of smart groups (topics, creators, why you saved it, places). Tapping one filters the grid. */
export function CollectionsRow({ collections, selectedId, onPick }: { collections: AutoCollection[]; selectedId: string | null; onPick: (c: AutoCollection | null) => void }) {
  if (!collections.length) return null;
  return (
    <section aria-labelledby="collections-title" className="flex flex-col gap-1">
      <h2 id="collections-title" className="px-4 text-label text-fg-muted">
        Smart groups
      </h2>
      <ul className="scroll-area no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
        {collections.map((c) => {
          const Icon = ICON[c.kind];
          const on = c.id === selectedId;
          // The icon already says # or @.
          const name = c.kind === "tag" || c.kind === "creator" ? c.label.slice(1) : c.label;
          return (
            <li key={c.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={on}
                aria-label={`${KIND_LABEL[c.kind]}: ${c.label}, ${c.count} saves`}
                onClick={() => onPick(on ? null : c)}
                className={cx(
                  "press flex h-14 max-w-56 items-center gap-2 rounded-lg pl-2 pr-4 text-left shadow-pop",
                  on ? "bg-fg text-background" : "bg-surface text-fg",
                )}
              >
                <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-card", on ? "bg-background/15" : "bg-raised")}>
                  <Icon size={20} strokeWidth={2.25} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-label">{name}</span>
                  <span className={cx("text-caption", on ? "opacity-80" : "text-fg-muted")}>
                    {c.count} {c.count === 1 ? "save" : "saves"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type TagSynthesis = { topic: string | null; points: string[]; suggestedAction: string | null; saveCount: number };

function useTagSynthesis(tag: string | null): TagSynthesis | null {
  const [found, setFound] = useState<{ tag: string; value: TagSynthesis | null } | null>(null);
  useEffect(() => {
    const supabase = getBrowserClient();
    if (!tag || !supabase) return;
    let alive = true;
    void supabase
      .from("syntheses")
      .select("topic,points,suggested_action,source_save_ids")
      .is("space_id", null)
      .ilike("tag", tag.replace(/[%_\\]/g, "\\$&"))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setFound({
          tag,
          value: data
            ? {
                topic: data.topic,
                points: Array.isArray(data.points) ? data.points.filter((p): p is string => typeof p === "string") : [],
                suggestedAction: data.suggested_action,
                saveCount: data.source_save_ids.length,
              }
            : null,
        });
      });
    return () => {
      alive = false;
    };
  }, [tag]);
  return found && found.tag === tag ? found.value : null;
}

/** The open collection: what it is, how many, Play all, close; under a topic, what its saves agree on. */
export function CollectionHeader({ collection, count, playHref, onClose }: { collection: AutoCollection; count: number; playHref: string | null; onClose: () => void }) {
  const Icon = ICON[collection.kind];
  const synthesis = useTagSynthesis(collection.kind === "tag" ? collection.key : null);
  return (
    <div className="rise-in mx-4 flex flex-col gap-3">
      <div className="flex min-h-16 items-center gap-3 rounded-lg bg-fg py-2 pl-4 pr-2 text-background">
        <Icon size={24} strokeWidth={2.25} aria-hidden className="shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-title">{collection.kind === "tag" || collection.kind === "creator" ? collection.label.slice(1) : collection.label}</h2>
          <span className="text-caption opacity-80">
            {KIND_LABEL[collection.kind]} · {count} {count === 1 ? "save" : "saves"}
          </span>
        </div>
        {playHref && (
          <Link href={playHref} aria-label={`Play ${collection.label}`} className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
            <Play size={22} strokeWidth={2} fill="currentColor" aria-hidden />
          </Link>
        )}
        <IconButton label="Close this group" icon={X} onClick={onClose} className="text-background hover:bg-background/15" />
      </div>
      {synthesis && synthesis.points.length > 0 && (
        <article className="flex flex-col gap-3 rounded-lg bg-surface p-4 shadow-pop ring-1 ring-insight/40">
          <div className="flex items-center justify-between gap-2">
            <AiLabel text="What these agree on" />
            <span className="text-caption text-fg-muted">{synthesis.saveCount} saves</span>
          </div>
          {synthesis.topic && <h3 className="text-heading">{synthesis.topic}</h3>}
          <ol className="flex flex-col gap-2">
            {synthesis.points.map((p, i) => (
              <li key={i} className="flex items-start gap-3 text-body">
                <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fg font-display text-caption text-background">
                  {i + 1}
                </span>
                {p}
              </li>
            ))}
          </ol>
          {synthesis.suggestedAction && (
            <p className="rounded-lg bg-raised p-3 text-body">
              <span className="text-label">Try · </span>
              {synthesis.suggestedAction}
            </p>
          )}
        </article>
      )}
    </div>
  );
}
