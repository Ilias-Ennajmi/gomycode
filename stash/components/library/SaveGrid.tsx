"use client";

import { Thumbnail } from "@/components/ui/Thumbnail";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import type { SaveItem, Space } from "@/lib/data";
import type { OutboxItem } from "@/lib/outbox";
import { PLATFORM_LABEL } from "@/lib/links";

/** What a card says when the AI hasn't (or couldn't) write a key idea. */
export function cardText(s: SaveItem): string {
  if (s.keyIdea) return s.keyIdea;
  if (s.status === "dead_link") return "Original removed";
  const firstLine = (s.title || s.caption || "").split("\n")[0].trim();
  return firstLine.slice(0, 120) || PLATFORM_LABEL[s.platform];
}

export function SaveGrid({
  items,
  queued = [],
  thumbs,
  spacesById,
  justReady,
  density = 2,
  onOpen,
}: {
  items: SaveItem[];
  queued?: OutboxItem[];
  thumbs: Record<string, string>;
  spacesById: Map<string, Space>;
  justReady?: Set<string>;
  density?: 2 | 3;
  onOpen: (s: SaveItem) => void;
}) {
  return (
    <ul className={cx("grid gap-3 px-4", density === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {queued.map((q) => (
        <li key={q.clientId} aria-label="Saving">
          <Skeleton shape="thumb" />
        </li>
      ))}
      {items.map((s) => {
        const space = s.spaceId ? spacesById.get(s.spaceId) : undefined;
        const processing = s.status === "queued" || s.status === "processing";
        return (
          <li key={s.id}>
            <Thumbnail
              src={s.thumbPath ? thumbs[s.thumbPath] : undefined}
              spaceColor={space?.color}
              duration={s.duration ?? undefined}
              unwatched={!s.watchedAt && !processing}
              keyIdea={processing ? undefined : cardText(s)}
              loading={processing}
              reveal={justReady?.has(s.id)}
              label={processing ? "Processing save" : cardText(s)}
              onClick={() => onOpen(s)}
            />
          </li>
        );
      })}
    </ul>
  );
}
