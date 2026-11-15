"use client";

import { Empty } from "@/components/audio/player/Shared";
import * as React from "react";
import { GripVertical, Headphones, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { durationLabel } from "@/lib/hooks/useVideo";
import { haptic } from "@/lib/native";
import { useAudio } from "@/components/audio/AudioProvider";
import { useT } from "@/lib/i18n";

/** Up next, reorderable by dragging the handle; a row's × removes it. */
export function QueueList() {
  const { t } = useT();
  const { queue, dequeue, moveInQueue, clearQueue, play } = useAudio();
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);
  const rows = React.useRef<HTMLLIElement[]>([]);

  const indexAtY = (y: number) => {
    let index = queue.length - 1;
    rows.current.forEach((row, i) => {
      const box = row?.getBoundingClientRect();
      if (box && y < box.top + box.height / 2 && i < index) index = i;
    });
    return index;
  };

  if (queue.length === 0) {
    return (
      <Empty text="Nothing queued. Long-press an episode and choose “Play next” or “Add to queue”." />
    );
  }
  return (
    <div>
      <ol className="space-y-1">
        {queue.map((item, i) => (
          <li
            key={item.id}
            ref={(node) => {
              if (node) rows.current[i] = node;
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl bg-card/60 py-2 pl-1 pr-2 ring-1 ring-border/50 transition-transform",
              dragIndex === i && "opacity-60",
              overIndex === i && dragIndex !== null && dragIndex !== i && "ring-primary"
            )}
          >
            <span
              className="flex h-10 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground"
              aria-label={t("Drag to reorder")}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragIndex(i);
                haptic();
              }}
              onPointerMove={(event) => {
                if (dragIndex === null) return;
                setOverIndex(indexAtY(event.clientY));
              }}
              onPointerUp={(event) => {
                const to = indexAtY(event.clientY);
                if (dragIndex !== null && to !== dragIndex) moveInQueue(dragIndex, to);
                setDragIndex(null);
                setOverIndex(null);
              }}
            >
              <GripVertical className="h-4 w-4" />
            </span>
            <button
              type="button"
              onClick={() => {
                dequeue(item.id);
                play(item, 0);
              }}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.imageUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Headphones className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 text-sm font-medium leading-snug">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.feedTitle}
                  {item.durationSeconds ? ` · ${durationLabel(item.durationSeconds)}` : ""}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => dequeue(item.id)}
              aria-label={`Remove ${item.title} from the queue`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={clearQueue}
        className="mt-3 w-full rounded-full py-2 text-xs font-medium text-muted-foreground hover:bg-accent/60"
      >
        {t("Clear the queue")}
      </button>
    </div>
  );
}
