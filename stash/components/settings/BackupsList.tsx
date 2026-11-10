"use client";

import { useEffect, useState } from "react";
import { Download, FileJson } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { getBrowserClient } from "@/lib/supabase/client";
import { formatBytes } from "@/lib/pipeline";

type Backup = { id: string; path: string; bytes: number; saves: number; createdAt: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });

/** Settings → Backups: the weekly copies of everything (JSON), newest first, each downloadable. */
export function BackupsList() {
  const { toast } = useToast();
  const [list, setList] = useState<Backup[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    let alive = true;
    void supabase
      .from("backups")
      .select("id,path,bytes,saves,created_at")
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data, error }) => {
        if (!alive) return;
        setList(error ? [] : (data ?? []).map((b) => ({ id: b.id, path: b.path, bytes: Number(b.bytes), saves: b.saves, createdAt: b.created_at })));
      });
    return () => {
      alive = false;
    };
  }, []);

  const download = async (b: Backup) => {
    const supabase = getBrowserClient();
    if (!supabase || !navigator.onLine) {
      toast({ message: "Downloading a backup needs a connection." });
      return;
    }
    setBusy(b.id);
    // A 10-minute link made by this phone's own session (the bucket only lets the owner read).
    const name = b.path.split("/").pop() ?? "stash-backup.json";
    const { data, error } = await supabase.storage.from("stash-exports").createSignedUrl(b.path, 600, { download: `stash-${name}` });
    setBusy(null);
    if (error || !data?.signedUrl) {
      toast({ message: "Couldn't get that backup. Try again in a moment." });
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = `stash-${name}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-pop">
      <p className="text-body text-fg-muted">Every Sunday Stash writes a copy of everything (saves, summaries, transcripts, Spaces, cards, highlights) as one file. The last four are kept.</p>
      {list === null ? (
        <span aria-hidden className="shimmer block h-12 rounded-card" />
      ) : list.length === 0 ? (
        <p className="rounded-lg border-2 border-dashed border-line p-4 text-body text-fg-muted">No backup yet. The first one is made next Sunday.</p>
      ) : (
        <ul className="flex flex-col">
          {list.map((b, i) => (
            <li key={b.id} className="flex min-h-14 items-center gap-3 border-t border-line/70 first:border-t-0">
              <FileJson size={22} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-label text-fg">
                  {day(b.createdAt)}
                  {i === 0 && <span className="ml-2 rounded-full bg-raised px-2 py-0.5 text-caption text-fg-muted">Latest</span>}
                </span>
                <span className="text-caption text-fg-muted">
                  {b.saves} {b.saves === 1 ? "save" : "saves"} · {formatBytes(b.bytes)}
                </span>
              </div>
              <IconButton label={`Download the backup of ${day(b.createdAt)}`} icon={Download} variant="raised" disabled={busy === b.id} onClick={() => void download(b)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
