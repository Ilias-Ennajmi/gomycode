"use client";

import { useMemo, useRef, useState } from "react";
import { SkipForward } from "lucide-react";
import { Illustration } from "@/components/brand/Illustration";
import { Button } from "@/components/ui/Button";
import { ProgressSegments } from "@/components/ui/ProgressSegments";
import { Sheet } from "@/components/ui/Sheet";
import { SpaceChip } from "@/components/ui/SpaceChip";
import { Thumbnail } from "@/components/ui/Thumbnail";
import { useToast } from "@/components/ui/Toast";
import { cardText } from "@/components/library/SaveGrid";
import { moveToSpace, type SaveItem, type Space } from "@/lib/data";
import { haptic } from "@/lib/haptics";
import { tokenMs } from "@/lib/motionTokens";

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
  const [dragging, setDragging] = useState(false);
  // The card leaves before the next one rises in: filed (drops into the chips) or skipped (flies left).
  const [leaving, setLeaving] = useState<"file" | "skip" | null>(null);

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

  const next = (how: "file" | "skip" = "skip") => {
    setLeaving(how);
    // tokenMs is 0 with reduce motion: the next card shows at once.
    setTimeout(() => {
      setLeaving(null);
      setDx(0);
      setIndex((i) => i + 1);
    }, tokenMs("--dur-screen"));
  };

  const file = (space: Space) => {
    if (!current || leaving) return;
    haptic();
    onFiled(current.id, space.id);
    setFiled((n) => n + 1);
    void moveToSpace(current.id, space.id).catch(() => toast({ message: "Couldn't file it. It stays in Inbox." }));
    next("file");
  };

  return (
    <Sheet open={open} onClose={onClose} label="Quick sort" title="Quick sort">
      {current ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <ProgressSegments total={stack.length} filled={index} className="flex-1" label={`${index + 1} of ${stack.length}`} />
            <span className="shrink-0 text-label tabular-nums text-fg-muted">
              {index + 1} of {stack.length}
            </span>
          </div>
          <div
            key={current.id}
            className="rise-in mx-auto w-1/2 touch-pan-y select-none"
            style={{
              transform: leaving === "file"
                ? "translateY(40%) scale(0.6)"
                : leaving === "skip"
                  ? "translateX(-130%) rotate(-16deg)"
                  : dx
                    ? `translateX(${dx}px) rotate(${dx / 24}deg)`
                    : undefined,
              opacity: leaving ? 0 : 1,
              // 1:1 with the finger while dragging, a springy wobble back when let go, ease-out when it leaves.
              transition: leaving
                ? "transform var(--dur-screen) var(--motion-ease-out), opacity var(--dur-screen) var(--motion-ease-out)"
                : dx && dragging
                  ? "none"
                  : "transform var(--dur-sheet) var(--ease-spring)",
            }}
            onPointerDown={(e) => {
              start.current = e.clientX;
              setDragging(true);
            }}
            onPointerMove={(e) => {
              if (start.current !== null) setDx(Math.min(0, e.clientX - start.current));
            }}
            onPointerUp={() => {
              start.current = null;
              setDragging(false);
              if (dx < -SWIPE_PX) next("skip");
              else setDx(0);
            }}
            onPointerCancel={() => {
              start.current = null;
              setDragging(false);
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
          <p className="text-label">Where does it go?</p>
          <div className="-mt-2 flex flex-wrap gap-1">
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
          <Button variant="secondary" icon={SkipForward} onClick={() => next("skip")} fullWidth>
            Skip for now
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Illustration name="done" className="pop-in h-36" />
          <p className="text-title">{filed ? `${filed} sorted` : "Nothing left to sort"}</p>
          <p className="text-body text-fg-muted">{filed ? "Your Inbox is lighter. Nice." : "Your Inbox is clear."}</p>
          <Button variant="ink" onClick={onClose} className="mt-2">
            Done
          </Button>
        </div>
      )}
    </Sheet>
  );
}
