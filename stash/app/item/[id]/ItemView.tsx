"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, CheckCircle2, ChevronLeft, Circle, ExternalLink, MoreVertical, Play, RefreshCw, Share2, Trash2 } from "lucide-react";
import { AiLabel } from "@/components/ui/AiLabel";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { Thumbnail, formatDuration } from "@/components/ui/Thumbnail";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { MediaPlayer, type PlayerHandle } from "@/components/player/MediaPlayer";
import { SpacePicker } from "@/components/save/SpacePicker";
import { RemindSheet } from "@/components/save/RemindSheet";
import { cardText } from "@/components/library/SaveGrid";
import {
  addReminder,
  createSpace,
  deleteSave,
  fetchRelated,
  fetchSave,
  fetchSaves,
  fetchSpaces,
  fetchTranscript,
  moveToSpace,
  nextSpaceColor,
  reprocess,
  saveNote,
  setState,
  type ReminderChoice,
  type SaveItem,
  type Segment,
  type Space,
} from "@/lib/data";
import { signedUrls } from "@/lib/media";
import { PLATFORM_LABEL } from "@/lib/links";
import { haptic } from "@/lib/haptics";
import { cancelDelete, scheduleDelete } from "@/lib/undo";
import { getBrowserClient } from "@/lib/supabase/client";

function useDoneActions(saveId: string) {
  const key = `stash.actions.${saveId}`;
  const [done, setDone] = useState<number[]>([]);
  useEffect(() => {
    try {
      // localStorage is only readable after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDone(JSON.parse(localStorage.getItem(key) ?? "[]") as number[]);
    } catch {
      setDone([]);
    }
  }, [key]);
  const toggle = (i: number) =>
    setDone((prev) => {
      const next = prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i];
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // best-effort
      }
      return next;
    });
  return { done, toggle };
}

export function ItemView({ id }: { id: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const player = useRef<PlayerHandle>(null);
  const startAt = Number(params.get("t")) || undefined;

  const [save, setSave] = useState<SaveItem | null>(null);
  const [missing, setMissing] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [related, setRelated] = useState<SaveItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [note, setNote] = useState("");
  const watchedSent = useRef(false);
  const { done, toggle } = useDoneActions(id);

  const load = useCallback(async () => {
    try {
      const s = await fetchSave(id);
      if (!s) {
        setMissing(true);
        return;
      }
      setSave(s);
      setNote(s.userNote ?? "");
      const [sp, segs, relIds] = await Promise.all([fetchSpaces(), fetchTranscript(id), fetchRelated(id).catch(() => [])]);
      setSpaces(sp);
      setSegments(segs);
      const rel = relIds.length ? await fetchSaves({ ids: relIds }) : [];
      setRelated(relIds.map((r) => rel.find((x) => x.id === r)).filter((x): x is SaveItem => Boolean(x)));
      const paths = [s.thumbPath, ...rel.map((r) => r.thumbPath)].filter((p): p is string => Boolean(p));
      setThumbs(await signedUrls("stash-thumbs", paths));
      if (s.voiceNotePath) setVoiceUrl((await signedUrls("stash-voice", [s.voiceNotePath]))[s.voiceNotePath] ?? null);
    } catch {
      if (!navigator.onLine) toast({ message: "You're offline. Showing what's on the phone." });
    }
  }, [id, toast]);

  useEffect(() => {
    // Async fetch: state is only set after the network answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // A save that's still processing fills in live.
    const supabase = getBrowserClient();
    const channel = supabase
      ?.channel(`stash-item-${id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "stash", table: "saves", filter: `id=eq.${id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "stash", table: "insights", filter: `save_id=eq.${id}` }, () => void load())
      .subscribe();
    return () => {
      if (channel) void supabase?.removeChannel(channel);
    };
  }, [id, load]);

  const space = useMemo(() => spaces.find((s) => s.id === save?.spaceId), [spaces, save?.spaceId]);
  const activeSeg = segments.findIndex((s) => now >= s.start && now < Math.max(s.end, s.start + 1));

  if (missing) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 pt-safe pb-safe text-center">
        <p className="text-body text-fg-muted">This save isn&apos;t here anymore.</p>
        <Button variant="secondary" onClick={() => router.replace("/library")}>
          Back to Library
        </Button>
      </main>
    );
  }

  if (!save) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 p-4 pt-safe">
        <Skeleton shape="thumb" className="mx-auto max-h-[60dvh] max-w-xs" />
        <Skeleton shape="line" />
        <Skeleton shape="line" className="w-2/3" />
      </main>
    );
  }

  const processing = save.status === "queued" || save.status === "processing";

  const onTime = (t: number, d: number) => {
    setNow(t);
    if (!watchedSent.current && d > 0 && (t / d > 0.8 || t > 45)) {
      watchedSent.current = true;
      if (!save.watchedAt) void setState(save.id, { watched_at: new Date().toISOString() }).catch(() => {});
    }
  };

  const move = (spaceId: string | null) => {
    const before = save.spaceId;
    setSave({ ...save, spaceId });
    haptic();
    moveToSpace(save.id, spaceId).catch(() => {
      setSave((s) => (s ? { ...s, spaceId: before } : s));
      toast({ message: "Couldn't move it. Check your connection." });
    });
  };

  const newSpace = async (name: string) => {
    try {
      const created = await createSpace(name, nextSpaceColor(spaces));
      setSpaces((prev) => [...prev, created]);
      move(created.id);
    } catch {
      toast({ message: "New Spaces need a connection." });
    }
  };

  const toggleApplied = () => {
    const appliedAt = save.appliedAt ? null : new Date().toISOString();
    setSave({ ...save, appliedAt });
    haptic();
    void setState(save.id, { applied_at: appliedAt }).catch(() => {});
    if (appliedAt) toast({ message: "Marked as applied" });
  };

  const remove = () => {
    setMenuOpen(false);
    scheduleDelete(save.id, () => deleteSave(save.id));
    haptic();
    toast({ message: "Deleted", actionLabel: "Undo", onAction: () => cancelDelete(save.id) });
    router.back();
  };

  const retry = async () => {
    setMenuOpen(false);
    setSave({ ...save, status: "queued", error: null });
    try {
      await reprocess(save.id);
      toast({ message: "Processing again" });
    } catch {
      toast({ message: "Couldn't start it. Check your connection." });
    }
  };

  const remind = async (choice: ReminderChoice, date?: string) => {
    setRemindOpen(false);
    try {
      await addReminder(save.id, choice, date);
      haptic();
      toast({ message: "Reminder set" });
    } catch {
      toast({ message: "Couldn't set the reminder." });
    }
  };

  const shareAction = (text: string) => {
    const payload = { title: save.aiTitle ?? "Stash", text, url: save.sourceUrl };
    if (navigator.share) void navigator.share(payload).catch(() => {});
    else void navigator.clipboard?.writeText(`${text}\n${save.sourceUrl}`).then(() => toast({ message: "Copied" }));
  };

  return (
    <main className="mx-auto min-h-dvh max-w-xl pb-safe">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-background/90 px-2 pt-safe backdrop-blur">
        <IconButton
          label="Back"
          icon={ChevronLeft}
          onClick={() => (window.history.length > 1 ? router.back() : router.replace("/library"))}
        />
        <div className="flex items-center">
          <Link
            href={`/play?id=${save.id}`}
            aria-label="Play full screen"
            className="flex h-12 w-12 items-center justify-center rounded-full text-fg"
          >
            <Play size={24} strokeWidth={2} aria-hidden />
          </Link>
          <IconButton label="More" icon={MoreVertical} onClick={() => setMenuOpen(true)} />
        </div>
      </header>

      <div className="mx-auto aspect-9/16 max-h-[64dvh] w-full max-w-sm overflow-hidden rounded-card">
        <MediaPlayer
          ref={player}
          save={save}
          poster={save.thumbPath ? thumbs[save.thumbPath] : undefined}
          controls
          loop
          startAt={startAt}
          onTime={onTime}
        />
      </div>

      <div className="flex flex-col gap-6 px-4 pt-4">
        {(save.error || save.status === "failed" || save.status === "dead_link") && (
          <Banner
            action={
              save.status !== "dead_link" ? (
                <button type="button" className="tap px-2 text-label underline" onClick={() => void retry()}>
                  Retry
                </button>
              ) : undefined
            }
          >
            {save.status === "dead_link" ? "The original was removed. The summary and transcript stay here." : save.error ?? "Processing failed."}
          </Banner>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-2 text-caption text-fg-muted">
            <span>{PLATFORM_LABEL[save.platform]}</span>
            {save.creator && <span>· @{save.creator.replace(/^@/, "")}</span>}
            {save.duration ? <span>· {formatDuration(save.duration)}</span> : null}
          </div>
          {processing ? (
            <div className="flex flex-col gap-2" aria-label="AI is reading it">
              <AiLabel text="Reading it…" />
              <Skeleton shape="line" />
              <Skeleton shape="line" className="w-2/3" />
            </div>
          ) : save.keyIdea ? (
            <>
              <AiLabel text="Key idea" />
              <h1 className="text-title">{save.keyIdea}</h1>
              {save.takeaways.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {save.takeaways.map((t, i) => (
                    <li key={i} className="flex gap-3 text-body text-fg">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fg-muted" />
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <h1 className="text-title">{cardText(save)}</h1>
          )}
          <Button
            variant={save.appliedAt ? "secondary" : "ghost"}
            icon={CheckCircle2}
            onClick={toggleApplied}
            className="self-start"
            aria-pressed={Boolean(save.appliedAt)}
          >
            {save.appliedAt ? "Applied" : "Mark as applied"}
          </Button>
        </section>

        {save.actions.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-heading">To do</h2>
            <ul className="flex flex-col">
              {save.actions.map((a, i) => (
                <li key={i} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={done.includes(i)}
                    className="flex min-h-12 flex-1 items-center gap-3 text-left text-body"
                  >
                    {done.includes(i) ? (
                      <CheckCircle2 size={24} strokeWidth={2} aria-hidden className="shrink-0 text-fg" />
                    ) : (
                      <Circle size={24} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
                    )}
                    <span className={cx(done.includes(i) && "text-fg-muted line-through")}>{a}</span>
                  </button>
                  <IconButton label="Send to tasks" icon={Share2} onClick={() => shareAction(a)} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-heading">Space</h2>
          <SpacePicker spaces={spaces} selectedId={space?.id ?? null} onPick={move} onCreate={newSpace} />
          <Button variant="secondary" icon={Bell} onClick={() => setRemindOpen(true)} className="self-start">
            Remind me
          </Button>
        </section>

        {segments.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-heading">Transcript</h2>
            <ol className="flex flex-col">
              {segments.map((seg, i) => (
                <li key={i}>
                  <button
                    type="button"
                    disabled={!save.hasVideo}
                    onClick={() => player.current?.seek(seg.start)}
                    className={cx(
                      "flex w-full gap-3 rounded-sm px-2 py-2 text-left text-body",
                      i === activeSeg ? "bg-raised text-fg" : "text-fg-muted",
                    )}
                  >
                    <span className="w-10 shrink-0 text-caption tabular-nums">{formatDuration(seg.start)}</span>
                    <span>{seg.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-heading">Your note</h2>
          {voiceUrl && <audio controls src={voiceUrl} className="w-full" />}
          <label htmlFor="note" className="sr-only">
            Your note
          </label>
          <textarea
            id="note"
            value={note}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (save.userNote ?? "") && void saveNote(save.id, note).catch(() => {})}
            placeholder="Why you saved it, where you'll use it…"
            className="w-full rounded-card bg-raised p-3 text-input text-fg outline-none placeholder:text-fg-subtle focus:ring-2 focus:ring-fg"
          />
        </section>

        {related.length > 0 && (
          <section className="flex flex-col gap-2 pb-6">
            <h2 className="text-heading">Related</h2>
            <ul className="scroll-area -mx-4 flex gap-3 overflow-x-auto px-4">
              {related.map((r) => (
                <li key={r.id} className="w-28 shrink-0">
                  <Thumbnail
                    src={r.thumbPath ? thumbs[r.thumbPath] : undefined}
                    spaceColor={spaces.find((s) => s.id === r.spaceId)?.color}
                    keyIdea={cardText(r)}
                    label={cardText(r)}
                    onClick={() => router.push(`/item/${r.id}`)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} label="More">
        <ul className="flex flex-col">
          <li>
            <a
              href={save.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 items-center gap-3 rounded-card px-3 text-body text-fg hover:bg-raised"
            >
              <ExternalLink size={24} strokeWidth={2} aria-hidden className="text-fg-muted" /> Open original
            </a>
          </li>
          <li>
            <button type="button" onClick={() => void retry()} className="flex min-h-14 w-full items-center gap-3 rounded-card px-3 text-body text-fg hover:bg-raised">
              <RefreshCw size={24} strokeWidth={2} aria-hidden className="text-fg-muted" /> Process again
            </button>
          </li>
          <li>
            <button type="button" onClick={remove} className="flex min-h-14 w-full items-center gap-3 rounded-card px-3 text-body text-danger hover:bg-raised">
              <Trash2 size={24} strokeWidth={2} aria-hidden /> Delete
            </button>
          </li>
        </ul>
      </Sheet>
      <RemindSheet open={remindOpen} onClose={() => setRemindOpen(false)} onPick={(c, d) => void remind(c, d)} />
    </main>
  );
}
