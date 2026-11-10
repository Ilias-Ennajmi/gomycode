"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { HighlightList } from "@/components/save/Highlights";
import { cardText } from "@/components/library/SaveGrid";
import { fetchHighlights, makeCard, onHighlightsChange } from "@/lib/highlights";
import type { Highlight } from "@/lib/highlightText";
import type { SaveItem } from "@/lib/data";
import { haptic } from "@/lib/haptics";

const CACHE = "stash.highlights";
const PREVIEW = 4;

function readCache(): Highlight[] {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? "[]") as Highlight[];
    return Array.isArray(c) ? c : [];
  } catch {
    return [];
  }
}

/** Learn → Highlights: the lines kept across all saves, newest first, each one tap from a recall card. */
export function LearnHighlights({ savesById, onKept }: { savesById: Map<string, SaveItem>; onKept: (saveId: string) => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [list, setList] = useState<Highlight[]>([]);
  const [all, setAll] = useState(false);

  useEffect(() => {
    // localStorage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList(readCache());
    const load = () =>
      void fetchHighlights({ limit: 60 })
        .then((rows) => {
          setList(rows);
          try {
            localStorage.setItem(CACHE, JSON.stringify(rows.slice(0, 30)));
          } catch {
            // cache is a convenience only
          }
        })
        .catch(() => {});
    load();
    return onHighlightsChange(load);
  }, []);

  const card = (h: Highlight) => {
    if (h.cardId) return;
    haptic();
    setList((prev) => prev.map((x) => (x.id === h.id ? { ...x, cardId: "pending" } : x)));
    onKept(h.saveId);
    toast({ message: "Recall card added · this save is kept" });
    const save = savesById.get(h.saveId);
    makeCard(h, save?.aiTitle ?? save?.title ?? null)
      .then((cardId) => setList((prev) => prev.map((x) => (x.id === h.id ? { ...x, cardId } : x))))
      .catch(() => {
        setList((prev) => prev.map((x) => (x.id === h.id ? { ...x, cardId: null } : x)));
        toast({ message: "Couldn't make the card. Check your connection." });
      });
  };

  // Highlights of saves that are gone or archived stay out of the way.
  const live = list.filter((h) => {
    const s = savesById.get(h.saveId);
    return s && !s.archivedAt;
  });

  return (
    <section id="highlights" aria-labelledby="learn-highlights-title" className="flex scroll-mt-4 flex-col gap-3">
      <h2 id="learn-highlights-title" className="text-title">
        Highlights
      </h2>
      {live.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-line p-4 text-body text-fg-muted">
          Open a save and tap a line of its transcript to keep it. Kept lines gather here, and any of them can become a recall card.
        </p>
      ) : (
        <>
          <HighlightList
            highlights={all ? live : live.slice(0, PREVIEW)}
            onCard={card}
            saveTitle={(h) => {
              const s = savesById.get(h.saveId);
              return s ? cardText(s) : undefined;
            }}
            onOpen={(h) => router.push(h.start !== null ? `/item/${h.saveId}?t=${Math.floor(h.start)}` : `/item/${h.saveId}`)}
          />
          {!all && live.length > PREVIEW && (
            <Button variant="secondary" className="self-start" onClick={() => setAll(true)}>
              Show all {live.length}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
