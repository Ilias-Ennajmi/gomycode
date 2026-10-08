"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Archive, Bell, Captions, CheckCircle2, ChevronDown, Heart, ListTodo, PencilLine, Volume2 } from "lucide-react";
import { MediaPlayer } from "@/components/player/MediaPlayer";
import { RemindSheet } from "@/components/save/RemindSheet";
import { cardText } from "@/components/library/SaveGrid";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { formatDuration } from "@/components/ui/Thumbnail";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG } from "@/components/ui/space";
import { useLibrary } from "@/lib/hooks/useLibrary";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { addReminder, fetchTranscript, saveNote, setState, type ReminderChoice, type SaveItem, type Segment } from "@/lib/data";
import { buildQueue } from "@/lib/queue";
import { haptic } from "@/lib/haptics";

const INK = { color: "var(--ink-light)" } as const;
const RATES = [1, 1.5, 2] as const;
const SWIPE_PX = 80;
const HINT_KEY = "stash.play.sessions";
const CC_KEY = "stash.play.captions";

function readFlag(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function RailButton({ label, icon: Icon, onClick, pressed }: { label: string; icon: typeof Heart; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} className="flex w-14 flex-col items-center gap-1 text-tab" style={INK}>
      <span
        className={cx("flex h-12 w-12 items-center justify-center rounded-full", pressed ? "bg-[var(--ink-light)]" : "")}
        style={pressed ? undefined : { background: "color-mix(in srgb, var(--scrim-base) 55%, transparent)" }}
      >
        <Icon size={24} strokeWidth={2} aria-hidden style={pressed ? { color: "var(--scrim-base)" } : undefined} />
      </span>
      {label}
    </button>
  );
}

export function PlayView() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const motionOK = useMotionOK();
  const lib = useLibrary();

  const [order, setOrder] = useState<string[] | null>(null);
  const [active, setActive] = useState(0);
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);
  const [boost, setBoost] = useState(false);
  const [muted, setMuted] = useState(false);
  const [soundHint, setSoundHint] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [segments, setSegments] = useState<Record<string, Segment[]>>({});
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [remindOpen, setRemindOpen] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [dx, setDx] = useState(0);
  const watched = useRef(new Set<string>());
  const pages = useRef<Array<HTMLElement | null>>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; horizontal: boolean | null; hold?: ReturnType<typeof setTimeout> } | null>(null);

  const inboxId = lib.spaces.find((s) => s.kind === "inbox")?.id ?? null;
  const byId = useMemo(() => new Map(lib.saves.map((s) => [s.id, s])), [lib.saves]);
  const spacesById = useMemo(() => new Map(lib.spaces.map((s) => [s.id, s])), [lib.spaces]);

  // Freeze the queue once, so live updates never reshuffle what's playing.
  useEffect(() => {
    if (order || !lib.synced) return;
    const q = buildQueue(
      lib.saves,
      { queue: params.get("queue"), space: params.get("space"), filter: params.get("filter"), ids: params.get("ids"), id: params.get("id") },
      inboxId,
    );
    // Building the queue needs the loaded library, so it happens once data arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(q.map((s) => s.id));
  }, [order, lib.synced, lib.saves, params, inboxId]);

  useEffect(() => {
    // Preferences live in localStorage, readable only after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCaptionsOn(readFlag(CC_KEY, true));
    try {
      const n = Number(localStorage.getItem(HINT_KEY) ?? "0");
      if (n < 3) {
        setShowHints(true);
        localStorage.setItem(HINT_KEY, String(n + 1));
        const t = setTimeout(() => setShowHints(false), 3500);
        return () => clearTimeout(t);
      }
    } catch {
      // hints are optional
    }
  }, []);

  const items = useMemo(
    () => (order ?? []).map((id) => byId.get(id)).filter((s): s is SaveItem => Boolean(s)),
    [order, byId],
  );
  const current = items[active] as SaveItem | undefined;
  const finished = order !== null && active >= items.length && items.length > 0;

  // Which page is on screen.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio > 0.6) {
            const i = Number((e.target as HTMLElement).dataset.index);
            setActive(i);
            setProgress(0);
            setExpanded(false);
          }
        }
      },
      { threshold: [0.6] },
    );
    pages.current.forEach((p) => p && io.observe(p));
    return () => io.disconnect();
  }, [items.length]);

  // Transcript of the current save (captions + expanded band).
  useEffect(() => {
    if (!current || segments[current.id]) return;
    void fetchTranscript(current.id)
      .then((segs) => setSegments((prev) => ({ ...prev, [current.id]: segs })))
      .catch(() => {});
  }, [current, segments]);

  const goTo = useCallback(
    (i: number) => {
      pages.current[i]?.scrollIntoView({ behavior: motionOK ? "smooth" : "auto" });
    },
    [motionOK],
  );

  const markWatched = useCallback(
    (s: SaveItem) => {
      if (watched.current.has(s.id) || s.watchedAt) return;
      watched.current.add(s.id);
      lib.patchSave(s.id, { watchedAt: new Date().toISOString() });
      void setState(s.id, { watched_at: new Date().toISOString() }).catch(() => {});
    },
    [lib],
  );

  const keep = (s: SaveItem) => {
    haptic();
    lib.patchSave(s.id, { kept: true });
    markWatched(s);
    void setState(s.id, { kept: true }).catch(() => {});
    toast({ message: "Kept · it comes back later", aboveBar: false, duration: 2000 });
    goTo(active + 1);
  };

  const archive = (s: SaveItem) => {
    haptic();
    const at = new Date().toISOString();
    const index = active;
    setOrder((o) => (o ?? []).filter((id) => id !== s.id));
    lib.patchSave(s.id, { archivedAt: at });
    void setState(s.id, { archived_at: at }).catch(() => {});
    toast({
      message: "Archived",
      actionLabel: "Undo",
      aboveBar: false,
      onAction: () => {
        setOrder((o) => {
          const next = [...(o ?? [])];
          next.splice(index, 0, s.id);
          return next;
        });
        lib.patchSave(s.id, { archivedAt: null });
        void setState(s.id, { archived_at: null }).catch(() => {});
        setTimeout(() => goTo(index), 50);
      },
    });
  };

  const toggleApplied = (s: SaveItem) => {
    const appliedAt = s.appliedAt ? null : new Date().toISOString();
    haptic();
    lib.patchSave(s.id, { appliedAt });
    void setState(s.id, { applied_at: appliedAt }).catch(() => {});
  };

  const toTask = (s: SaveItem) => {
    const text = s.actions[0] ?? s.keyIdea ?? cardText(s);
    if (navigator.share) void navigator.share({ title: "From Stash", text, url: s.sourceUrl }).catch(() => {});
    else void navigator.clipboard?.writeText(`${text}\n${s.sourceUrl}`).then(() => toast({ message: "Copied", aboveBar: false }));
  };

  const remind = async (choice: ReminderChoice, date?: string) => {
    setRemindOpen(false);
    if (!current) return;
    try {
      await addReminder(current.id, choice, date);
      haptic();
      toast({ message: "Reminder set", aboveBar: false });
    } catch {
      toast({ message: "Couldn't set the reminder.", aboveBar: false });
    }
  };

  const close = () => (window.history.length > 1 ? router.back() : router.replace("/library"));

  // Horizontal swipe = keep (right) / archive (left); hold = 2× while held.
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,a,input,iframe")) return;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      horizontal: null,
      hold: setTimeout(() => setBoost(true), 500),
    };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const mx = e.clientX - g.x;
    const my = e.clientY - g.y;
    if (Math.abs(mx) > 10 || Math.abs(my) > 10) clearTimeout(g.hold);
    if (g.horizontal === null && (Math.abs(mx) > 12 || Math.abs(my) > 12)) g.horizontal = Math.abs(mx) > Math.abs(my);
    if (g.horizontal) setDx(mx);
  };
  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    clearTimeout(g.hold);
    setBoost(false);
    if (g.horizontal && current) {
      if (dx > SWIPE_PX) keep(current);
      else if (dx < -SWIPE_PX) archive(current);
    }
    setDx(0);
  };

  const space = current?.spaceId ? spacesById.get(current.spaceId) : undefined;
  const label = (() => {
    if (params.get("ids")) return "Search results";
    const sp = params.get("space");
    if (sp) return sp === "inbox" ? "Inbox" : (spacesById.get(sp)?.name ?? "Space");
    if (params.get("id")) return space?.name ?? "Playing";
    return "Your 5";
  })();
  const segs = current ? segments[current.id] : undefined;

  if (order !== null && items.length === 0) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center pt-safe pb-safe">
        <p className="max-w-xs text-body text-fg">Nothing to play here yet. Share a reel to Stash and it plays here, full screen.</p>
        <Button variant="secondary" onClick={close}>
          Close
        </Button>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-[var(--scrim-base)]" style={INK}>
      <div
        ref={scroller}
        className="scroll-area h-dvh snap-y snap-mandatory overflow-y-scroll overscroll-contain"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {items.map((s, i) => {
          const near = i >= active - 1 && i <= active + 2;
          const poster = s.thumbPath ? lib.thumbs[s.thumbPath] : undefined;
          return (
            <section
              key={s.id}
              ref={(el) => {
                pages.current[i] = el;
              }}
              data-index={i}
              aria-label={`${i + 1} of ${items.length}`}
              className="relative h-dvh w-full snap-start snap-always touch-pan-y"
              style={i === active && dx ? { transform: `translateX(${dx}px) rotate(${dx / 40}deg)`, transition: "none" } : undefined}
            >
              {near ? (
                <MediaPlayer
                  save={s}
                  poster={poster}
                  active={i === active && !finished && !noteOpen && !remindOpen}
                  preload={i === active + 1 || i === active + 2}
                  rate={boost ? 2 : rate}
                  muted={muted}
                  captions={i === active && captionsOn ? segs : null}
                  onAutoplayBlocked={() => {
                    setMuted(true);
                    setSoundHint(true);
                  }}
                  onTime={(t, d) => {
                    if (i !== active) return;
                    setProgress(d ? t / d : 0);
                    if (d && (t / d > 0.8 || t > 45)) markWatched(s);
                  }}
                  onEnded={() => {
                    markWatched(s);
                    goTo(i + 1);
                  }}
                />
              ) : (
                poster && (
                  // eslint-disable-next-line @next/next/no-img-element -- signed Storage URL
                  <img src={poster} alt="" className="absolute inset-0 h-full w-full object-contain" />
                )
              )}
              {i === active && dx !== 0 && (
                <span
                  aria-hidden
                  className={cx("absolute top-1/3 rounded-full px-4 py-2 text-label", dx > 0 ? "left-6" : "right-6")}
                  style={{ background: "color-mix(in srgb, var(--scrim-base) 70%, transparent)", opacity: Math.min(1, Math.abs(dx) / SWIPE_PX) }}
                >
                  {dx > 0 ? "Keep" : "Archive"}
                </span>
              )}
            </section>
          );
        })}

        {items.length > 0 && (
          <section
            ref={(el) => {
              pages.current[items.length] = el;
            }}
            data-index={items.length}
            className="flex h-dvh snap-start flex-col items-center justify-center gap-4 bg-background px-6 text-center text-fg"
          >
            <CheckCircle2 size={48} strokeWidth={1.5} aria-hidden />
            <h2 className="text-display">{items.length} done</h2>
            <p className="text-body text-fg-muted">Kept saves come back as recall cards in Learn.</p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => goTo(0)}>
                Play again
              </Button>
              <Button onClick={close}>Close</Button>
            </div>
          </section>
        )}
      </div>

      {/* Top bar */}
      {!finished && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-10 flex flex-col gap-2 px-3 pt-safe">
          <div className="pt-2">
            <div role="progressbar" aria-label="Queue" aria-valuemin={1} aria-valuemax={items.length} aria-valuenow={active + 1} className="flex gap-1">
              {items.map((s, i) => (
                <span
                  key={s.id}
                  className="h-1 flex-1 rounded-full"
                  style={{ background: i <= active ? "var(--ink-light)" : "color-mix(in srgb, var(--ink-light) 30%, transparent)" }}
                />
              ))}
            </div>
          </div>
          <div className="pointer-events-auto flex items-center gap-1">
            <button type="button" aria-label="Close player" onClick={close} className="flex h-12 w-12 items-center justify-center rounded-full">
              <ChevronDown size={24} strokeWidth={2} aria-hidden />
            </button>
            <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-label">
              {space && <span aria-hidden className={cx("h-2 w-2 shrink-0 rounded-full", SPACE_BG[space.color])} />}
              <span className="sr-only">Playing</span>
              <span className="truncate">{label}</span>
              <span className="shrink-0">· {Math.min(active + 1, items.length)} of {items.length}</span>
            </span>
            <button
              type="button"
              onClick={() => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}
              aria-label={`Speed ${rate}×`}
              className="h-12 min-w-12 rounded-full px-3 text-label"
              style={{ background: "color-mix(in srgb, var(--scrim-base) 55%, transparent)" }}
            >
              {rate}×
            </button>
            <button
              type="button"
              aria-label="Captions"
              aria-pressed={captionsOn}
              onClick={() => {
                const next = !captionsOn;
                setCaptionsOn(next);
                try {
                  localStorage.setItem(CC_KEY, next ? "1" : "0");
                } catch {
                  // best-effort
                }
              }}
              className={cx("flex h-12 w-12 items-center justify-center rounded-full", !captionsOn && "opacity-60")}
              style={{ background: "color-mix(in srgb, var(--scrim-base) 55%, transparent)" }}
            >
              <Captions size={24} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {soundHint && muted && !finished && (
        <button
          type="button"
          onClick={() => {
            setMuted(false);
            setSoundHint(false);
          }}
          className="fixed left-1/2 top-1/3 z-10 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full px-4 text-label"
          style={{ background: "color-mix(in srgb, var(--scrim-base) 70%, transparent)" }}
        >
          <Volume2 size={20} strokeWidth={2} aria-hidden /> Tap for sound
        </button>
      )}

      <AnimatePresence>
        {showHints && !finished && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none fixed inset-x-0 top-[22%] z-10 flex justify-between px-4 text-label"
          >
            <span className="flex items-center gap-2 rounded-full px-3 py-2" style={{ background: "color-mix(in srgb, var(--scrim-base) 70%, transparent)" }}>
              <Archive size={20} strokeWidth={2} aria-hidden /> ← Archive
            </span>
            <span className="flex items-center gap-2 rounded-full px-3 py-2" style={{ background: "color-mix(in srgb, var(--scrim-base) 70%, transparent)" }}>
              Keep → <Heart size={20} strokeWidth={2} aria-hidden />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {current && !finished && (
        <>
          {/* Right rail */}
          <div className="fixed right-2 z-10 flex flex-col gap-3" style={{ bottom: "calc(env(safe-area-inset-bottom) + 160px)" }}>
            <RailButton label="Applied" icon={CheckCircle2} pressed={Boolean(current.appliedAt)} onClick={() => toggleApplied(current)} />
            <RailButton label="Keep" icon={Heart} pressed={current.kept} onClick={() => keep(current)} />
            <RailButton label="To task" icon={ListTodo} onClick={() => toTask(current)} />
            <RailButton
              label="Note"
              icon={PencilLine}
              onClick={() => {
                setNote(current.userNote ?? "");
                setNoteOpen(true);
              }}
            />
            <RailButton label="Remind" icon={Bell} onClick={() => setRemindOpen(true)} />
          </div>

          {/* Bottom band */}
          <div
            className="fixed inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-4 pt-6 pb-safe"
            style={{ background: "linear-gradient(to top, color-mix(in srgb, var(--scrim-base) 88%, transparent), transparent)" }}
          >
            <div className="flex items-center gap-2 pr-16 text-caption">
              {current.creator && <span className="truncate">@{current.creator.replace(/^@/, "")}</span>}
              {current.duration ? <span>· {formatDuration(current.duration)}</span> : null}
              {space && (
                <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full px-2 py-1" style={{ background: "color-mix(in srgb, var(--scrim-base) 55%, transparent)" }}>
                  <span aria-hidden className={cx("h-2 w-2 rounded-full", SPACE_BG[space.color])} />
                  {space.name}
                </span>
              )}
            </div>
            <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} className="pr-16 text-left">
              <span className={cx("block text-heading", !expanded && "truncate")}>{cardText(current)}</span>
              {!expanded && (current.takeaways.length > 0 || (segs?.length ?? 0) > 0) && (
                <span className="text-caption opacity-80">Tap for {current.takeaways.length ? "takeaways" : ""}{current.takeaways.length && segs?.length ? " and " : ""}{segs?.length ? "transcript" : ""}</span>
              )}
            </button>
            {expanded && (
              <div className="scroll-area max-h-[40dvh] overflow-y-auto pr-16">
                {current.takeaways.length > 0 && (
                  <ul className="flex flex-col gap-2 pb-3">
                    {current.takeaways.map((t, i) => (
                      <li key={i} className="text-body">
                        • {t}
                      </li>
                    ))}
                  </ul>
                )}
                {segs && segs.length > 0 && <p className="text-body opacity-90">{segs.map((x) => x.text).join(" ")}</p>}
                <Link href={`/item/${current.id}`} className="mt-3 inline-flex h-12 items-center text-label underline">
                  Open details
                </Link>
              </div>
            )}
            <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--ink-light) 25%, transparent)" }}>
              <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, background: "var(--ink-light)" }} />
            </div>
          </div>
        </>
      )}

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} label="Note" title="Note">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (current) {
              lib.patchSave(current.id, { userNote: note.trim() || null });
              void saveNote(current.id, note).catch(() => toast({ message: "Couldn't save the note.", aboveBar: false }));
            }
            setNoteOpen(false);
          }}
        >
          <label htmlFor="play-note" className="sr-only">
            Note
          </label>
          <textarea
            id="play-note"
            autoFocus
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why you saved it, where you'll use it…"
            className="w-full rounded-card bg-raised p-3 text-input text-fg outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-fg"
          />
          <Button type="submit" fullWidth>
            Save note
          </Button>
        </form>
      </Sheet>
      <RemindSheet open={remindOpen} onClose={() => setRemindOpen(false)} onPick={(c, d) => void remind(c, d)} />
    </main>
  );
}
