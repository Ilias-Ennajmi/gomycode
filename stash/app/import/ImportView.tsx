"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Check, FileArchive, Heart, Image as ImageIcon, RotateCcw, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { cx } from "@/components/ui/cx";
import { haptic } from "@/lib/haptics";
import { isWantedEntry, newLinks, parseExportFile, type ImportedLink, type ImportSource } from "@/lib/importers";
import { existingUrls, importHistory, queueLinks, recordImport, type ImportRecord } from "@/lib/importRun";
import { isZip, readZipEntries } from "@/lib/zip";

type Choice = { id: ImportSource | "screenshots"; title: string; detail: string; icon: LucideIcon; soon?: boolean };

const CHOICES: Choice[] = [
  { id: "instagram", title: "Instagram Saved", detail: "From your Instagram data download", icon: Bookmark },
  { id: "tiktok", title: "TikTok Favorites", detail: "From your TikTok data download", icon: Heart },
];

const HOW: Record<ImportSource, string[]> = {
  instagram: [
    "In Instagram: Settings → Accounts Center → Your information and permissions → Download your information.",
    "Choose “Some of your information” → Saved, format JSON, then create the file.",
    "When Instagram emails you, download the ZIP and pick it below.",
  ],
  tiktok: [
    "In TikTok: Settings → Account → Download your data.",
    "Choose JSON (TXT works too), request it, then download the ZIP when it's ready.",
    "Pick the ZIP below (or the user_data JSON inside it).",
  ],
};

type Phase =
  | { step: "pick" }
  | { step: "reading"; progress: number }
  | { step: "review"; fileName: string; found: number; fresh: ImportedLink[] }
  | { step: "sending"; fileName: string; found: number; sent: number; total: number }
  | { step: "done"; found: number; queued: number; offline: boolean }
  | { step: "error"; message: string };

export function ImportView() {
  const [source, setSource] = useState<ImportSource | null>(null);
  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  const [history, setHistory] = useState<ImportRecord[]>([]);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    importHistory()
      .then(setHistory)
      .catch(() => {});
  }, []);

  const read = async (file: File, src: ImportSource) => {
    setPhase({ step: "reading", progress: 0 });
    try {
      let links: ImportedLink[] = [];
      if (isZip(file.name, file.type)) {
        const entries = await readZipEntries(file, (n) => isWantedEntry(n, src), (p) => setPhase({ step: "reading", progress: p }));
        for (const [name, text] of Object.entries(entries)) links.push(...parseExportFile(name, text, src));
      } else {
        links = parseExportFile(file.name, await file.text(), src);
      }
      const seen = new Set<string>();
      links = links.filter((l) => (seen.has(l.key) ? false : (seen.add(l.key), true)));
      if (links.length === 0) {
        setPhase({
          step: "error",
          message:
            src === "instagram"
              ? "No saved posts in this file. Pick the ZIP from Instagram's “Download your information” with Saved included."
              : "No favourite videos in this file. Pick the ZIP from TikTok's “Download your data”.",
        });
        return;
      }
      let fresh = links;
      try {
        fresh = newLinks(links, await existingUrls());
      } catch {
        // Offline: duplicates are harmless (same post, new row) but rare; import everything.
      }
      setPhase({ step: "review", fileName: file.name, found: links.length, fresh });
    } catch {
      setPhase({ step: "error", message: "Couldn't read this file. Pick the ZIP (or the JSON inside it) again." });
    }
  };

  const send = async (fileName: string, found: number, fresh: ImportedLink[]) => {
    setPhase({ step: "sending", fileName, found, sent: 0, total: fresh.length });
    const sent = await queueLinks(fresh, (s, total) => setPhase({ step: "sending", fileName, found, sent: s, total }));
    haptic();
    if (source) await recordImport(source, fileName, found, fresh.length).catch(() => {});
    setPhase({ step: "done", found, queued: fresh.length, offline: sent < fresh.length });
    importHistory()
      .then(setHistory)
      .catch(() => {});
  };

  const restart = () => {
    setPhase({ step: "pick" });
    if (input.current) input.current.value = "";
  };

  return (
    <main className="mx-auto min-h-dvh max-w-xl pt-safe pb-safe">
      <PageHeader title="Import" eyebrow="Bring the saves you already have" back="/you" />
      <div className="flex flex-col gap-4 px-4 pb-8">
        <div role="radiogroup" aria-label="Where from" className="flex flex-col gap-2">
          {CHOICES.map((c) => {
            const selected = source === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-disabled={c.soon || undefined}
                disabled={c.soon || phase.step === "sending" || phase.step === "reading"}
                onClick={() => {
                  if (c.soon) return;
                  setSource(c.id as ImportSource);
                  restart();
                }}
                className={cx(
                  "flex min-h-16 w-full items-center gap-4 rounded-card border px-4 py-3 text-left",
                  "transition-colors duration-[var(--dur-fast)]",
                  selected ? "border-fg bg-raised" : "border-line bg-surface hover:bg-raised",
                  c.soon && "opacity-60",
                )}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-raised text-fg">
                  <c.icon size={24} strokeWidth={2} aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-label text-fg">{c.title}</span>
                  <span className="text-caption text-fg-muted">{c.detail}</span>
                </span>
                {selected && <Check size={24} strokeWidth={2} aria-hidden className="text-fg" />}
              </button>
            );
          })}
        </div>
        <p className="flex items-start gap-3 rounded-card bg-raised px-4 py-3 text-body text-fg">
          <ImageIcon size={24} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
          <span>
            Screenshots: open one in your gallery and tap Share → Stash. The AI reads the post in it and files it for you.
          </span>
        </p>

        {source && (
          <section aria-label="Steps" className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-fg-muted">
              {HOW[source].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>

            <input
              ref={input}
              id="import-file"
              type="file"
              accept=".zip,.json,.html,.txt,application/zip,application/json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void read(f, source);
              }}
            />

            {(phase.step === "pick" || phase.step === "error") && (
              <>
                {phase.step === "error" && <Banner>{phase.message}</Banner>}
                <label
                  htmlFor="import-file"
                  className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-card bg-accent text-label text-on-accent active:scale-95"
                >
                  <FileArchive size={24} strokeWidth={2} aria-hidden />
                  Pick the downloaded ZIP
                </label>
              </>
            )}

            {phase.step === "reading" && (
              <Progress label="Reading the file…" value={phase.progress} />
            )}

            {phase.step === "review" && (
              <div className="flex flex-col gap-3">
                <p className="text-body text-fg">
                  Found <strong>{phase.found}</strong> {source === "instagram" ? "saved posts" : "favourite videos"}
                  {phase.found !== phase.fresh.length && <> · {phase.found - phase.fresh.length} already in Stash</>}.
                </p>
                {phase.fresh.length > 0 ? (
                  <>
                    <p className="text-caption text-fg-muted">
                      They go to your Inbox and are read in the background. Each one uses a little of your monthly AI budget; when
                      it runs out, the rest wait until you raise it.
                    </p>
                    <Button size="lg" fullWidth onClick={() => void send(phase.fileName, phase.found, phase.fresh)}>
                      {`Import ${phase.fresh.length} ${phase.fresh.length === 1 ? "save" : "saves"}`}
                    </Button>
                  </>
                ) : (
                  <p className="text-body text-fg-muted">Everything in this file is already in Stash.</p>
                )}
                <Button variant="ghost" icon={RotateCcw} onClick={restart} fullWidth>
                  Pick another file
                </Button>
              </div>
            )}

            {phase.step === "sending" && (
              <Progress label={`Queuing ${phase.sent} of ${phase.total}…`} value={phase.total ? phase.sent / phase.total : 1} />
            )}

            {phase.step === "done" && (
              <div className="flex flex-col gap-3" role="status">
                <p className="text-body text-fg">
                  {phase.queued} {phase.queued === 1 ? "save" : "saves"} queued
                  {phase.offline ? " on this phone. They'll send as soon as you're online." : ". Key ideas fill in over the next minutes."}
                </p>
                <Link href="/library?space=inbox" className="flex h-12 items-center justify-center rounded-card border border-line text-label text-fg">
                  Open the Inbox
                </Link>
                <Link href="/triage" className="flex h-12 items-center justify-center rounded-card text-label text-fg">
                  Sort old saves (30 s)
                </Link>
              </div>
            )}
          </section>
        )}

        {history.length > 0 && (
          <section aria-labelledby="import-history" className="flex flex-col gap-2">
            <h2 id="import-history" className="text-heading">
              Earlier imports
            </h2>
            <ul className="flex flex-col gap-1">
              {history.map((h) => (
                <li key={h.id} className="flex min-h-12 items-center justify-between gap-3 rounded-card bg-surface px-4 text-body">
                  <span className="truncate text-fg">{h.source === "instagram" ? "Instagram" : "TikTok"} · {h.queued} new of {h.total}</span>
                  <span className="shrink-0 text-caption text-fg-muted">{new Date(h.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}

function Progress({ label, value }: { label: string; value: number }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite">
      <span className="text-body text-fg">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-fg transition-[width] duration-[var(--dur-fast)]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
