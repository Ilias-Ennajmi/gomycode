"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, CheckCircle2, ChevronLeft, Circle, ExternalLink, Highlighter, MoreVertical, Play, RefreshCw, Share2, Trash2 } from "lucide-react";
import { PlatformBadge } from "@/components/ui/PlatformBadge";
import { AiStateNote, ProcessSteps } from "@/components/save/ProcessSteps";
import { HighlightList, useHighlights } from "@/components/save/Highlights";
import { embedAspect, openInLabel, playbackMode, videoNote } from "@/lib/playback";
import { paragraphs } from "@/lib/highlightText";
import { AiLabel } from "@/components/ui/AiLabel";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { Thumbnail, formatDuration } from "@/components/ui/Thumbnail";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { SPACE_BG } from "@/components/ui/space";
import { Illustration } from "@/components/brand/Illustration";
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
  fetchTranscriptFull,
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
import { publicUrl } from "@/lib/links";
import { morphName } from "@/lib/morph";
import { WordReveal } from "@/components/ui/WordReveal";
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

/** The copy the Library keeps on the phone: the page paints from it before the network answers. */
function cachedItem(id: string): { save: SaveItem; spaces: Space[] } | null {
  try {
    const c = JSON.parse(localStorage.getItem("stash.library") ?? "null") as { saves?: SaveItem[]; spaces?: Space[] } | null;
    const save = c?.saves?.find((s) => s.id === id);
    return save ? { save, spaces: c?.spaces ?? [] } : null;
  } catch {
    return null;
  }
}

const ARTICLE_PREVIEW = 8;

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
  const [fullText, setFullText] = useState("");
  const [allText, setAllText] = useState(false);
  const [related, setRelated] = useState<SaveItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [note, setNote] = useState("");
  const watchedSent = useRef(false);
  // The key idea fades in word by word when processing finishes while the page is open.
  const lastStatus = useRef<string | null>(null);
  const [revealIdea, setRevealIdea] = useState(false);
  const { done, toggle } = useDoneActions(id);

  const load = useCallback(async () => {
    try {
      const s = await fetchSave(id);
      if (!s) {
        setMissing(true);
        return;
      }
      if ((lastStatus.current === "queued" || lastStatus.current === "processing") && s.status === "ready") setRevealIdea(true);
      lastStatus.current = s.status;
      setSave(s);
      setNote(s.userNote ?? "");
      const [sp, transcript, relIds] = await Promise.all([fetchSpaces(), fetchTranscriptFull(id), fetchRelated(id).catch(() => [])]);
      setSpaces(sp);
      setSegments(transcript.segments);
      setFullText(transcript.fullText);
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
    // Cache first: the Library's copy on the phone shows at once; the network refreshes it.
    const cached = cachedItem(id);
    if (cached) {
      // localStorage is only readable after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSave((s) => s ?? cached.save);
      setSpaces((s) => (s.length ? s : cached.spaces));
      setNote((n) => n || (cached.save.userNote ?? ""));
      lastStatus.current ??= cached.save.status;
      if (cached.save.thumbPath) void signedUrls("stash-thumbs", [cached.save.thumbPath]).then((u) => setThumbs((t) => ({ ...u, ...t })));
    }
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
  const markKept = useCallback(() => setSave((s) => (s ? { ...s, kept: true } : s)), []);
  const hl = useHighlights(id, save?.aiTitle ?? save?.title ?? null, markKept);
  const articleText = useMemo(() => paragraphs(fullText), [fullText]);
  const activeSeg = segments.findIndex((s) => now >= s.start && now < Math.max(s.end, s.start + 1));

  if (missing) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 pt-safe pb-safe text-center">
        <Illustration name="error" className="h-36" />
        <h1 className="text-title">This save is gone</h1>
        <p className="text-body text-fg-muted">It was deleted, maybe on another device.</p>
        <Button variant="ink" onClick={() => router.replace("/library")}>
          Back to Library
        </Button>
      </main>
    );
  }

  if (!save) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 p-4 pt-safe">
        <div data-morph-dst={id} style={{ viewTransitionName: morphName(id) }} className="mx-auto w-full max-w-xs">
          <Skeleton shape="thumb" className="max-h-[var(--detail-max-h)]" />
        </div>
        <Skeleton shape="line" />
        <Skeleton shape="line" className="w-2/3" />
      </main>
    );
  }

  const processing = save.status === "queued" || save.status === "processing";
  const { mode, embedUrl: embed } = playbackMode(save);
  const article = mode === "article";
  const poster = save.thumbPath ? thumbs[save.thumbPath] : undefined;
  const original = publicUrl(save.sourceUrl);
  const whyNoCopy = mode === "embed" || mode === "link" ? videoNote(save.videoState, save.platform) : null;
  const wide = mode === "embed" && embed !== null && embedAspect(embed, save.sourceUrl) === "landscape";
  let host = "";
  try {
    host = original ? new URL(original).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }

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
    const url = publicUrl(save.sourceUrl);
    const payload = { title: save.aiTitle ?? "Stash", text, url };
    if (navigator.share) void navigator.share(payload).catch(() => {});
    else void navigator.clipboard?.writeText(url ? `${text}\n${url}` : text).then(() => toast({ message: "Copied" }));
  };

  return (
    <main className="mx-auto min-h-dvh max-w-xl pb-safe">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-background/90 px-2 pt-safe backdrop-blur">
        <IconButton
          label="Back"
          icon={ChevronLeft}
          variant="raised"
          onClick={() => (window.history.length > 1 ? router.back() : router.replace("/library"))}
        />
        <div className="flex items-center gap-1">
          <IconButton label="More" icon={MoreVertical} onClick={() => setMenuOpen(true)} />
          {!article && (
            <Link
              href={`/play?id=${save.id}`}
              aria-label="Play full screen"
              className="press flex h-12 w-12 items-center justify-center rounded-full bg-accent text-on-accent shadow-pop"
            >
              <Play size={22} strokeWidth={2} fill="currentColor" aria-hidden />
            </Link>
          )}
        </div>
      </header>

      {article ? (
        // An article is read, not played: its picture, where it is from, and the way out to the original.
        <div className="flex flex-col gap-3 px-4">
          {poster && (
            <div data-morph-dst={save.id} style={{ viewTransitionName: morphName(save.id) }} className="aspect-video w-full overflow-hidden rounded-xl bg-raised shadow-raised">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed Storage URL */}
              <img src={poster} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          {original && (
            <a href={original} target="_blank" rel="noreferrer" className="press flex min-h-12 items-center gap-3 rounded-full border border-line bg-raised px-4 text-label text-fg">
              <ExternalLink size={20} strokeWidth={2} aria-hidden className="shrink-0" />
              <span className="min-w-0 flex-1 truncate">{openInLabel(save.platform)}</span>
              <span className="shrink-0 truncate text-caption text-fg-muted">{host}</span>
            </a>
          )}
        </div>
      ) : (
        <>
          <div
            data-morph-dst={save.id}
            style={{ viewTransitionName: morphName(save.id) }}
            className={cx(
              "mx-auto w-full overflow-hidden rounded-xl shadow-raised",
              wide ? "aspect-video max-w-xl" : "aspect-9/16 max-h-[var(--detail-max-h-lg)] max-w-sm",
            )}
          >
            <MediaPlayer ref={player} save={save} poster={poster} controls loop startAt={startAt} onTime={onTime} />
          </div>
          {mode === "embed" && original && (
            <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-2 px-4 pt-3">
              <a href={original} target="_blank" rel="noreferrer" className="press flex h-12 items-center gap-2 rounded-full border border-line bg-raised px-5 text-label text-fg">
                <ExternalLink size={20} strokeWidth={2} aria-hidden /> {openInLabel(save.platform)}
              </a>
              {whyNoCopy && <p className="text-center text-caption text-fg-muted">{whyNoCopy}</p>}
            </div>
          )}
        </>
      )}

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
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-muted">
            {space && (
              <span className={cx("mr-1 inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-label text-on-space", SPACE_BG[space.color])}>
                {space.name}
              </span>
            )}
            <PlatformBadge platform={save.platform} />
            {save.creator && <span>· @{save.creator.replace(/^@/, "")}</span>}
            {save.duration ? <span>· {formatDuration(save.duration)}</span> : null}
          </div>
          {processing ? (
            <div className="flex flex-col gap-3">
              <h1 className="text-title">{cardText(save)}</h1>
              <ProcessSteps step={save.processStep} platform={save.platform} />
            </div>
          ) : save.keyIdea ? (
            <>
              <AiLabel text="Key idea" />
              <h1 className="text-title">
                <WordReveal text={save.keyIdea} animate={revealIdea} />
              </h1>
              {save.takeaways.length > 0 && (
                <ol className="flex flex-col gap-2 rounded-lg bg-surface p-4 shadow-pop">
                  {save.takeaways.map((t, i) => (
                    <li key={i} className="flex items-start gap-3 text-body text-fg">
                      <span
                        aria-hidden
                        className={cx(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-label",
                          space ? cx(SPACE_BG[space.color], "text-on-space") : "bg-fg text-background",
                        )}
                      >
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{t}</span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <>
              <h1 className="text-title">{cardText(save)}</h1>
              {save.status === "ready" && <AiStateNote aiState={save.aiState} onRetry={() => void retry()} />}
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={save.appliedAt ? "ink" : "secondary"}
              icon={CheckCircle2}
              onClick={toggleApplied}
              aria-pressed={Boolean(save.appliedAt)}
              className={cx(save.appliedAt && "pop-in")}
              key={save.appliedAt ? "applied" : "not-applied"}
            >
              {save.appliedAt ? "Applied" : "Mark as applied"}
            </Button>
            <Button variant="secondary" icon={Bell} onClick={() => setRemindOpen(true)}>
              Remind me
            </Button>
          </div>
        </section>

        {save.actions.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-heading">To do</h2>
            <ul className="flex flex-col rounded-lg bg-surface px-3 py-1 shadow-pop">
              {save.actions.map((a, i) => (
                <li key={i} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    aria-pressed={done.includes(i)}
                    className="flex min-h-12 flex-1 items-center gap-3 text-left text-body"
                  >
                    {done.includes(i) ? (
                      <CheckCircle2 size={24} strokeWidth={2} aria-hidden className="pop-in shrink-0 text-fg" />
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
        </section>

        {(hl.list.length > 0 || segments.length > 0 || articleText.length > 0) && (
          <section aria-labelledby="highlights-title" className="flex flex-col gap-2">
            <h2 id="highlights-title" className="text-heading">
              Highlights
            </h2>
            {hl.list.length > 0 ? (
              <HighlightList
                highlights={hl.list}
                onSeek={mode === "file" ? (t) => player.current?.seek(t) : undefined}
                onCard={hl.card}
                onRemove={hl.remove}
              />
            ) : (
              <p className="flex items-center gap-3 rounded-lg border-2 border-dashed border-line p-4 text-body text-fg-muted">
                <Highlighter size={20} strokeWidth={2} aria-hidden className="shrink-0" />
                Tap a line below to keep it. A kept line can become a recall card.
              </p>
            )}
          </section>
        )}

        {segments.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-heading">Transcript</h2>
            <ol className="flex flex-col rounded-lg bg-surface p-1 shadow-pop">
              {segments.map((seg, i) => {
                const on = hl.isOn(seg);
                return (
                  <li key={i} className={cx("flex items-stretch rounded-card", i === activeSeg && "bg-raised")}>
                    <button
                      type="button"
                      disabled={mode !== "file"}
                      onClick={() => player.current?.seek(seg.start)}
                      aria-label={`Play from ${formatDuration(seg.start)}`}
                      className="press flex min-h-12 w-14 shrink-0 items-start justify-center pt-3 text-caption tabular-nums text-fg-muted"
                    >
                      {formatDuration(seg.start)}
                    </button>
                    <button
                      type="button"
                      aria-pressed={on}
                      aria-label={`${on ? "Remove highlight" : "Highlight"}: ${seg.text}`}
                      onClick={() => hl.toggle(seg)}
                      className={cx("press flex min-h-12 min-w-0 flex-1 items-start gap-2 py-2.5 pr-3 text-left text-body", i === activeSeg || on ? "text-fg" : "text-fg-muted")}
                    >
                      <span className={cx("min-w-0 flex-1", on && "rounded-sm bg-fg px-1.5 text-background [box-decoration-break:clone]")}>{seg.text}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {segments.length === 0 && articleText.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-heading">{article ? "The article" : "What it says"}</h2>
            <div className="flex flex-col gap-1 rounded-lg bg-surface p-2 shadow-pop">
              {(allText ? articleText : articleText.slice(0, ARTICLE_PREVIEW)).map((p, i) => {
                const on = hl.isOn({ text: p });
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    onClick={() => hl.toggle({ text: p })}
                    className="press min-h-12 rounded-card px-2 py-2 text-left text-body leading-relaxed text-fg"
                  >
                    <span className={cx(on && "rounded-sm bg-fg px-1 text-background [box-decoration-break:clone]")}>{p}</span>
                  </button>
                );
              })}
              {!allText && articleText.length > ARTICLE_PREVIEW && (
                <Button variant="secondary" className="m-2 self-start" onClick={() => setAllText(true)}>
                  Show the rest
                </Button>
              )}
            </div>
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
            className="w-full rounded-lg border border-line bg-surface p-4 text-input text-fg outline-none placeholder:text-fg-subtle focus:border-fg"
          />
        </section>

        {related.length > 0 && (
          <section className="flex flex-col gap-2 pb-6">
            <h2 className="text-heading">Related</h2>
            <ul className="scroll-area -mx-4 flex gap-3 overflow-x-auto px-4">
              {related.map((r) => (
                <li key={r.id} className="w-32 shrink-0">
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
          {publicUrl(save.sourceUrl) && <li>
            <a
              href={save.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-14 items-center gap-3 rounded-card px-3 text-body text-fg hover:bg-raised"
            >
              <ExternalLink size={24} strokeWidth={2} aria-hidden className="text-fg-muted" /> Open original
            </a>
          </li>}
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
