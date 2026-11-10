"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useMotionValue, useTransform, type PanInfo } from "framer-motion";
import { Archive, Bookmark, CheckCheck } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { SpaceChip } from "@/components/ui/SpaceChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG } from "@/components/ui/space";
import { cardText } from "@/components/library/SaveGrid";
import { useLibrary } from "@/lib/hooks/useLibrary";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { haptic } from "@/lib/haptics";
import { moveToSpace, type SaveItem, type Space } from "@/lib/data";
import { PLATFORM_LABEL } from "@/lib/links";
import { ageLabel, remainingToday, triageCandidates, TRIAGE_DEFAULT_LIMIT } from "@/lib/triage";
import { decide, fetchSuggestions, fetchTriageLimit, fetchTriageSeen } from "@/lib/triageData";

const SWIPE_PX = 110;
const SWIPE_VELOCITY = 600;

type Dir = "keep" | "go";

export function TriageView() {
  const lib = useLibrary();
  const { toast } = useToast();
  const motionOK = useMotionOK();
  const [now] = useState(() => new Date());
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [limit, setLimit] = useState(TRIAGE_DEFAULT_LIMIT);
  const [ready, setReady] = useState(false);
  const [suggestions, setSuggestions] = useState<Record<string, string>>({});
  const [lastDir, setLastDir] = useState<Dir>("keep");

  useEffect(() => {
    let alive = true;
    Promise.all([fetchTriageSeen().catch(() => ({})), fetchTriageLimit().catch(() => TRIAGE_DEFAULT_LIMIT)]).then(([s, l]) => {
      if (!alive) return;
      setSeen(s);
      setLimit(l);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const spacesById = useMemo(() => new Map(lib.spaces.map((s) => [s.id, s])), [lib.spaces]);
  const left = remainingToday(limit, seen, now);
  const queue = useMemo(() => triageCandidates(lib.saves, now, seen).slice(0, left), [lib.saves, now, seen, left]);
  const doneToday = Math.max(0, limit - left);
  const totalToday = Math.min(limit, doneToday + queue.length);
  const current = queue[0];
  const queueIds = queue.map((s) => s.id).join(",");

  useEffect(() => {
    if (!queueIds) return;
    const ids = queueIds.split(",").filter((id) => !(id in suggestions)).slice(0, 50);
    if (!ids.length) return;
    let alive = true;
    fetchSuggestions(ids)
      .then((m) => alive && setSuggestions((prev) => ({ ...Object.fromEntries(ids.map((id) => [id, ""])), ...prev, ...m })))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [queueIds, suggestions]);

  const act = (save: SaveItem, dir: Dir, fileInto?: Space) => {
    const stamp = new Date().toISOString();
    const prevSeen = seen[save.id] ?? null;
    haptic(10);
    setLastDir(dir);
    setSeen((s) => ({ ...s, [save.id]: stamp }));

    if (dir === "keep") {
      lib.patchSave(save.id, { kept: true, ...(fileInto ? { spaceId: fileInto.id } : {}) });
      void decide(save.id, { kept: true, triage_seen_at: stamp }).catch(() => toast({ message: "Couldn't save that. Check your connection." }));
      if (fileInto) void moveToSpace(save.id, fileInto.id).catch(() => {});
      return;
    }

    lib.patchSave(save.id, { archivedAt: stamp });
    void decide(save.id, { archived_at: stamp, triage_seen_at: stamp }).catch(() => toast({ message: "Couldn't save that. Check your connection." }));
    toast({
      message: "Let go. It's in Archived.",
      actionLabel: "Undo",
      onAction: () => {
        lib.patchSave(save.id, { archivedAt: null });
        setSeen((s) => {
          const next = { ...s };
          if (prevSeen) next[save.id] = prevSeen;
          else delete next[save.id];
          return next;
        });
        void decide(save.id, { archived_at: null, triage_seen_at: prevSeen }).catch(() => {});
      },
    });
  };

  const loading = !ready || (lib.loading && lib.saves.length === 0);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col pt-safe pb-safe">
      <PageHeader
        title="Sort old saves"
        eyebrow={totalToday > 0 ? `${Math.min(doneToday + 1, totalToday)} of ${totalToday} today` : "Backlog"}
        back="/library"
      />
      {totalToday > 0 && current && (
        <div className="px-4 pb-3" aria-hidden>
          <div className="h-1 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-fg transition-[width] duration-[var(--dur-fast)]" style={{ width: `${(doneToday / totalToday) * 100}%` }} />
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3 px-4">
          <Skeleton shape="block" className="h-96" />
          <Skeleton shape="line" />
        </div>
      ) : !current ? (
        <section className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-raised text-fg-muted">
            <CheckCheck size={24} strokeWidth={2} aria-hidden />
          </span>
          <p className="max-w-xs text-body text-fg">
            {doneToday > 0 && left === 0
              ? `That's ${doneToday} for today. More tomorrow.`
              : "Nothing old to sort. Saves older than a month that you haven't watched show up here."}
          </p>
          <Link href="/library" className="tap flex items-center justify-center rounded-card border border-line px-6 text-label text-fg">
            Back to Library
          </Link>
        </section>
      ) : (
        <>
          <div className="relative mx-4 h-96">
            <AnimatePresence initial={false} custom={lastDir}>
              {queue[1] && (
                <div key={`under-${queue[1].id}`} aria-hidden className="absolute inset-0 scale-95 opacity-60">
                  <CardFace save={queue[1]} space={queue[1].spaceId ? spacesById.get(queue[1].spaceId) : undefined} thumb={queue[1].thumbPath ? lib.thumbs[queue[1].thumbPath] : undefined} now={now} />
                </div>
              )}
              <SwipeCard
                key={current.id}
                save={current}
                space={current.spaceId ? spacesById.get(current.spaceId) : undefined}
                thumb={current.thumbPath ? lib.thumbs[current.thumbPath] : undefined}
                now={now}
                motionOK={motionOK}
                onDecide={(d) => act(current, d)}
              />
            </AnimatePresence>
          </div>

          <div className="flex flex-col gap-3 px-4 pt-4">
            {suggestions[current.id] && spacesById.get(suggestions[current.id]) && suggestions[current.id] !== current.spaceId && (
              <div className="flex items-center gap-2">
                <span className="text-caption text-fg-muted">Keep in</span>
                <SpaceChip
                  name={spacesById.get(suggestions[current.id])!.name}
                  color={spacesById.get(suggestions[current.id])!.color}
                  suggested
                  onClick={() => act(current, "keep", spacesById.get(suggestions[current.id]))}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="secondary" size="lg" icon={Archive} onClick={() => act(current, "go")}>
                Let go
              </Button>
              <Button size="lg" icon={Bookmark} onClick={() => act(current, "keep")}>
                Keep
              </Button>
            </div>
            <p className="text-center text-caption text-fg-muted">Swipe left to let go, right to keep.</p>
          </div>
        </>
      )}
    </main>
  );
}

function SwipeCard({
  save,
  space,
  thumb,
  now,
  motionOK,
  onDecide,
}: {
  save: SaveItem;
  space?: Space;
  thumb?: string;
  now: Date;
  motionOK: boolean;
  onDecide: (d: Dir) => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], motionOK ? [-10, 10] : [0, 0]);
  const keepHint = useTransform(x, [20, SWIPE_PX], [0, 1]);
  const goHint = useTransform(x, [-SWIPE_PX, -20], [1, 0]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > SWIPE_PX || info.velocity.x > SWIPE_VELOCITY) onDecide("keep");
    else if (info.offset.x < -SWIPE_PX || info.velocity.x < -SWIPE_VELOCITY) onDecide("go");
  };

  return (
    <motion.div
      className="absolute inset-0 touch-pan-y"
      style={{ x, rotate }}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={onDragEnd}
      variants={{
        exit: (dir: Dir) => (motionOK ? { x: dir === "keep" ? 480 : -480, opacity: 0, transition: { duration: 0.25 } } : { opacity: 0, transition: { duration: 0 } }),
      }}
      initial={motionOK ? { scale: 0.95, opacity: 0.6 } : false}
      animate={{ scale: 1, opacity: 1, transition: { duration: motionOK ? 0.15 : 0 } }}
      exit="exit"
    >
      <CardFace save={save} space={space} thumb={thumb} now={now} />
      <motion.span
        aria-hidden
        style={{ opacity: keepHint }}
        className="absolute left-4 top-4 z-20 rounded-full bg-fg px-3 py-1 text-label text-background"
      >
        Keep
      </motion.span>
      <motion.span
        aria-hidden
        style={{ opacity: goHint }}
        className="absolute right-4 top-4 z-20 rounded-full bg-raised px-3 py-1 text-label text-fg"
      >
        Let go
      </motion.span>
    </motion.div>
  );
}

function CardFace({ save, space, thumb, now }: { save: SaveItem; space?: Space; thumb?: string; now: Date }) {
  const who = [save.creator && `@${save.creator.replace(/^@/, "")}`, PLATFORM_LABEL[save.platform]].filter(Boolean).join(" · ");
  return (
    <article
      aria-label={cardText(save)}
      className="relative flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-raised"
    >
      {space && <span aria-hidden className={cx("absolute inset-x-0 top-0 z-10 h-0.75", SPACE_BG[space.color])} />}
      <div className="relative min-h-0 flex-1 bg-raised">
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
          <img src={thumb} alt="" draggable={false} className="h-full w-full select-none object-cover" />
        )}
      </div>
      <div className="flex flex-col gap-1 p-4">
        <p className="line-clamp-3 text-heading text-fg">{cardText(save)}</p>
        <p className="text-caption text-fg-muted">
          Saved {ageLabel(save.savedAt, now)}
          {who && ` · ${who}`}
        </p>
      </div>
    </article>
  );
}
