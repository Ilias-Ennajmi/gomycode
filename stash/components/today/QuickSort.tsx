"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { SpaceChip } from "@/components/ui/SpaceChip";
import { Thumbnail } from "@/components/ui/Thumbnail";
import { useToast } from "@/components/ui/Toast";
import { cardText } from "@/components/library/SaveGrid";
import { moveToSpace, type SaveItem, type Space } from "@/lib/data";
import { haptic } from "@/lib/haptics";

const SWIPE_PX = 80;

/**
 * Inbox quick sort: one unsorted save at a time with the AI's suggested Space
 * first. Tap a Space to file it; swipe left (or Skip) to leave it for later.
 */
export function QuickSort({
  open,
  onClose,
  items,
  spaces,
  thumbs,
  onFiled,
}: {
  open: boolean;
  onClose: () => void;
  items: SaveItem[];
  spaces: Space[];
  thumbs: Record<string, string>;
  onFiled: (saveId: string, spaceId: string) => void;
}) {
  const { toast } = useToast();
  const [index, setIndex] = useState(0);
  const [filed, setFiled] = useState(0);
  const [dx, setDx] = useState(0);
  const start = useRef<number | null>(null);

  // Freeze the stack when it opens so filing doesn't reshuffle it.
  const [stack, setStack] = useState<SaveItem[]>([]);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStack(items);
      setIndex(0);
      setFiled(0);
    }
  }

  const current = stack[index] as SaveItem | undefined;
  const choices = useMemo(() => {
    const real = spaces.filter((s) => s.kind !== "inbox");
    const suggested = current?.suggestedSpaceId ? real.find((s) => s.id === current.suggestedSpaceId) : undefined;
    return { suggested, others: real.filter((s) => s.id !== suggested?.id) };
  }, [spaces, current]);

  const next = () => {
    setDx(0);
    setIndex((i) => i + 1);
  };

  const file = (space: Space) => {
    if (!current) return;
    haptic();
    onFiled(current.id, space.id);
    setFiled((n) => n + 1);
    void moveToSpace(current.id, space.id).catch(() => toast({ message: "Couldn't file it. It stays in Inbox." }));
    next();
  };

  return (
    <Sheet open={open} onClose={onClose} label="Quick sort" title="Quick sort">
      {current ? (
        <div className="flex flex-col gap-4">
          <p className="text-caption text-fg-muted">
            {index + 1} of {stack.length} · tap a Space, or swipe left to skip
          </p>
          <div
            className="mx-auto w-1/2 touch-pan-y select-none"
            style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 30}deg)` : undefined }}
            onPointerDown={(e) => {
              start.current = e.clientX;
            }}
            onPointerMove={(e) => {
              if (start.current !== null) setDx(Math.min(0, e.clientX - start.current));
            }}
            onPointerUp={() => {
              start.current = null;
              if (dx < -SWIPE_PX) next();
              else setDx(0);
            }}
            onPointerCancel={() => {
              start.current = null;
              setDx(0);
            }}
          >
            <Thumbnail
              src={current.thumbPath ? thumbs[current.thumbPath] : undefined}
              duration={current.duration ?? undefined}
              keyIdea={cardText(current)}
              label={cardText(current)}
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {choices.suggested && (
              <SpaceChip name={choices.suggested.name} color={choices.suggested.color} suggested onClick={() => file(choices.suggested!)} />
            )}
            {choices.others.map((s) => (
              <SpaceChip key={s.id} name={s.name} color={s.color} onClick={() => file(s)} />
            ))}
          </div>
          {choices.others.length === 0 && !choices.suggested && (
            <p className="text-caption text-fg-muted">Create a Space in Library first, then sort into it here.</p>
          )}
          <Button variant="secondary" icon={SkipForward} onClick={next} fullWidth>
            Skip
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <CheckCircle2 size={48} strokeWidth={1.5} aria-hidden />
          <p className="text-heading">{filed ? `${filed} sorted` : "Nothing left to sort"}</p>
          <Button onClick={onClose}>Done</Button>
        </div>
      )}
    </Sheet>
  );
}
