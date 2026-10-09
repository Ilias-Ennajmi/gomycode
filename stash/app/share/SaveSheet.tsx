"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Bell, Check, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { SpacePicker } from "@/components/save/SpacePicker";
import { RemindSheet } from "@/components/save/RemindSheet";
import { VoiceNoteButton } from "@/components/save/VoiceNoteButton";
import { addReminder, createSpace, fetchSaves, fetchSpaces, mostUsed, nextSpaceColor, type ReminderChoice, type Space } from "@/lib/data";
import { cleanUrl, detectPlatform, extractUrl, PLATFORM_LABEL } from "@/lib/links";
import { enqueue, flush, serverIdFor, updateSaveByClientId } from "@/lib/outbox";
import { getBrowserClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { useMotionOK } from "@/lib/hooks/useMotionOK";

const CACHE = "stash.library";

function cachedSpaces(): { spaces: Space[]; top: Space[] } {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE) ?? "null") as { spaces: Space[]; saves: { spaceId: string | null }[] } | null;
    if (c) return { spaces: c.spaces, top: mostUsed(c.spaces, c.saves) };
  } catch {
    // no cache yet
  }
  return { spaces: [], top: [] };
}

function close() {
  // Opened from another app's share sheet: back returns there. Otherwise go to the Library.
  if (window.history.length > 1) window.history.back();
  else window.close();
  setTimeout(() => window.location.replace("/library"), 300);
}

/**
 * Android share target. The save is written locally before anything else, so
 * "Saved" shows instantly (offline too). Everything below it is optional.
 */
export function SaveSheet() {
  const params = useSearchParams();
  const { toast } = useToast();
  const motionOK = useMotionOK();
  const sharedTitle = params.get("title");
  const raw = extractUrl(params.get("url"), params.get("text"), params.get("title"));
  const url = raw ? cleanUrl(raw) : null;
  const platform = url ? detectPlatform(url) : "web";

  const clientId = useRef<string>("");
  const [saved, setSaved] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [top, setTop] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [remindOpen, setRemindOpen] = useState(false);
  const [voiceDone, setVoiceDone] = useState(false);
  const [reminded, setReminded] = useState<string | null>(null);

  // 1 · Save first.
  useEffect(() => {
    if (!url || clientId.current) return;
    clientId.current = crypto.randomUUID();
    const text = params.get("text");
    const title = sharedTitle || (text && text.replace(url, "").trim()) || null;
    void enqueue({
      clientId: clientId.current,
      sourceUrl: url,
      platform,
      spaceId: null,
      sharedTitle: title ? title.slice(0, 300) : null,
      savedAt: new Date().toISOString(),
    }).then(() => {
      setSaved(true);
      haptic();
      void flush();
    });
  }, [url, platform, params, sharedTitle]);

  // 2 · Then the optional Space row (cached first, fresh when online).
  useEffect(() => {
    const c = cachedSpaces();
    // Local cache is only readable after mount (SSR has no localStorage), so it's applied here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSpaces(c.spaces);
    setTop(c.top);
    void Promise.all([fetchSpaces(), fetchSaves({ limit: 300 })])
      .then(([sp, sv]) => {
        setSpaces(sp);
        setTop(mostUsed(sp, sv));
      })
      .catch(() => {});
  }, []);

  const pick = (id: string | null) => {
    setSpaceId(id);
    haptic();
    void updateSaveByClientId(clientId.current, { space_id: id });
  };

  const create = async (name: string) => {
    try {
      const space = await createSpace(name, nextSpaceColor(spaces));
      setSpaces((s) => [...s, space]);
      setTop((t) => [space, ...t].slice(0, 4));
      pick(space.id);
    } catch {
      toast({ message: "New Spaces need a connection.", aboveBar: false });
    }
  };

  const uploadVoice = async (blob: Blob, mime: string) => {
    const supabase = getBrowserClient();
    const { data } = (await supabase?.auth.getUser()) ?? { data: { user: null } };
    if (!supabase || !data.user || !navigator.onLine) {
      toast({ message: "Voice notes need a connection.", aboveBar: false });
      return;
    }
    const ext = mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
    const path = `${data.user.id}/${clientId.current}.${ext}`;
    const { error } = await supabase.storage.from("stash-voice").upload(path, blob, { contentType: mime, upsert: true });
    if (error) {
      toast({ message: "Couldn't save the voice note.", aboveBar: false });
      return;
    }
    await flush();
    await updateSaveByClientId(clientId.current, { voice_note_path: path });
    setVoiceDone(true);
    haptic();
  };

  const remind = async (choice: ReminderChoice, date?: string) => {
    setRemindOpen(false);
    const id = await serverIdFor(clientId.current);
    if (!id) {
      toast({ message: "Reminders need a connection.", aboveBar: false });
      return;
    }
    try {
      await addReminder(id, choice, date);
      setReminded(choice === "nearby" ? "When you're nearby" : choice === "tonight" ? "Tonight" : choice === "weekend" ? "This weekend" : date ?? "Set");
      haptic();
    } catch {
      toast({ message: "Couldn't set the reminder.", aboveBar: false });
    }
  };

  const shown = spaces.length && top.length < 3 ? [...top, ...spaces.filter((s) => s.kind !== "inbox" && !top.includes(s))].slice(0, 6) : top;
  let host = "";
  try {
    host = url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch {
    host = "";
  }

  return (
    <div className="fixed inset-0 flex items-end bg-scrim" onClick={close}>
      <motion.section
        role="dialog"
        aria-label="Saved to Stash"
        onClick={(e) => e.stopPropagation()}
        initial={motionOK ? { y: "100%" } : false}
        animate={{ y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.7 }}
        onDragEnd={(_, info) => (info.offset.y > 120 || info.velocity.y > 600) && close()}
        className="mx-auto w-full max-w-lg rounded-t-sheet bg-surface px-5 pt-3 pb-safe shadow-sheet"
      >
        <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-line" />
        {!url ? (
          <div className="flex flex-col gap-4 pb-8">
            <h1 className="text-title">No link found</h1>
            <p className="text-body text-fg-muted">Share a post or reel link to Stash, or paste one in the Library.</p>
            <Button variant="secondary" onClick={close}>
              Close
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5 pb-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full bg-fg text-background"
              >
                <Check size={24} strokeWidth={2.5} />
              </span>
              <h1 className="flex-1 text-title" aria-live="polite">
                {saved ? "Saved" : "Saving…"}
              </h1>
              <Button variant="ghost" onClick={close}>
                Done
              </Button>
            </div>

            <div className="flex items-center gap-3 rounded-card bg-raised p-3">
              <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-sm bg-surface text-fg-muted">
                <Link2 size={24} strokeWidth={2} aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="line-clamp-2 text-label text-fg">{sharedTitle || host}</span>
                <span className="text-caption text-fg-muted">
                  {PLATFORM_LABEL[platform]} · <span className="text-insight">AI is reading it…</span>
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-caption text-fg-muted">Add to a Space (optional). Skip it and AI files it for you.</span>
              <SpacePicker spaces={shown} selectedId={spaceId} onPick={pick} onCreate={create} />
            </div>

            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
              <VoiceNoteButton
                done={voiceDone}
                onRecorded={(b, m) => void uploadVoice(b, m)}
                onProblem={(m) => toast({ message: m, aboveBar: false })}
              />
              <button
                type="button"
                onClick={() => setRemindOpen(true)}
                className="flex h-12 items-center justify-center gap-2 rounded-card border border-line px-4 text-label text-fg"
              >
                <Bell size={24} strokeWidth={2} aria-hidden />
                <span className="truncate">{reminded ?? "Remind me"}</span>
              </button>
            </div>
          </div>
        )}
      </motion.section>
      <RemindSheet open={remindOpen} onClose={() => setRemindOpen(false)} onPick={(c, d) => void remind(c, d)} />
    </div>
  );
}
