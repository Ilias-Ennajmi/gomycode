"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, FileText, Images, Link2, Presentation, RotateCcw, Share2, type LucideIcon } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Switch } from "@/components/ui/Switch";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { haptic } from "@/lib/haptics";
import { scheduleDelete, cancelDelete } from "@/lib/undo";
import {
  collectionUrl,
  createExport,
  deleteExport,
  exportFileName,
  fetchExportFile,
  latestCollection,
  shareOrDownload,
  watchExport,
  type ExportKind,
  type ExportRow,
} from "@/lib/exports";

type Option = { kind: ExportKind; title: string; detail: string; icon: LucideIcon };

const OPTIONS: Option[] = [
  { kind: "brief", title: "Creative brief", detail: "PDF and Word, written from these saves", icon: FileText },
  { kind: "moodboard", title: "Moodboard", detail: "PDF of key frames", icon: Images },
  { kind: "deck", title: "Reference deck", detail: "PowerPoint, one slide per idea", icon: Presentation },
  { kind: "collection", title: "Shared collection", detail: "A read-only web link", icon: Link2 },
];

const MAIN_EXT: Record<ExportKind, string> = { brief: "pdf", moodboard: "pdf", deck: "pptx", collection: "" };
const EXT_LABEL: Record<string, string> = { pdf: "PDF", docx: "Word file", pptx: "PowerPoint" };
const WORKING: Record<ExportKind, string> = {
  brief: "Writing your brief…",
  moodboard: "Laying out the moodboard…",
  deck: "Building the deck…",
  collection: "Making the link…",
};

export type ExportSheetProps = {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
  /** Saves the export would use with each toggle state. */
  countAll: number;
  countAppliedKept: number;
};

export function ExportSheet({ open, onClose, spaceId, spaceName, countAll, countAppliedKept }: ExportSheetProps) {
  const { toast } = useToast();
  const [onlyAppliedKept, setOnlyAppliedKept] = useState(false);
  const [includeQuotes, setIncludeQuotes] = useState(false);
  const [job, setJob] = useState<ExportRow | null>(null);
  const [starting, setStarting] = useState<ExportKind | null>(null);
  const [link, setLink] = useState<ExportRow | null>(null);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [fileError, setFileError] = useState(false);
  const stopWatch = useRef<(() => void) | null>(null);

  const count = onlyAppliedKept ? countAppliedKept : countAll;

  // An existing live link is shown instead of minting a new one.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    latestCollection(spaceId)
      .then((row) => alive && setLink(row))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, spaceId]);

  useEffect(() => () => stopWatch.current?.(), []);

  // When a file is ready, fetch it straight away so the share tap opens the sheet without waiting.
  useEffect(() => {
    if (!job || job.status !== "ready" || job.kind === "collection") return;
    let alive = true;
    const exts = Object.keys(job.files).length ? Object.keys(job.files) : [MAIN_EXT[job.kind]];
    Promise.all(exts.map((ext) => fetchExportFile(job.id, ext, exportFileName(spaceName, job.kind, ext)).then((f) => [ext, f] as const)))
      .then((pairs) => {
        if (!alive) return;
        setFiles(Object.fromEntries(pairs));
        haptic();
      })
      .catch(() => alive && setFileError(true));
    return () => {
      alive = false;
    };
  }, [job, spaceName]);

  const reset = () => {
    stopWatch.current?.();
    stopWatch.current = null;
    setJob(null);
    setFiles({});
    setFileError(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const start = async (kind: ExportKind) => {
    if (starting) return;
    if (kind === "collection" && link) {
      setJob(link);
      return;
    }
    setStarting(kind);
    try {
      const row = await createExport(spaceId, kind, { only_applied_kept: onlyAppliedKept, include_quotes: includeQuotes });
      haptic();
      setJob(row);
      if (kind === "collection") setLink(row);
      if (row.status !== "ready" && row.status !== "failed") {
        stopWatch.current?.();
        stopWatch.current = watchExport(row.id, (next) => setJob(next));
      }
    } catch {
      toast({ message: "Exports need a connection. Try again when you're online." });
    } finally {
      setStarting(null);
    }
  };

  const share = async (ext: string) => {
    const file = files[ext];
    if (!file) return;
    const how = await shareOrDownload(file);
    if (how === "downloaded") toast({ message: `${file.name} downloaded` });
  };

  const url = job?.shareSlug ? collectionUrl(job.shareSlug) : null;

  const shareLink = async () => {
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: spaceName, url });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    await copyLink();
  };

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ message: "Link copied" });
    } catch {
      toast({ message: url });
    }
  };

  const stopSharing = () => {
    if (!job) return;
    const row = job;
    setLink(null);
    reset();
    scheduleDelete(`export-${row.id}`, () => deleteExport(row.id).catch(() => {}));
    toast({
      message: "The link stops working in a moment",
      actionLabel: "Undo",
      onAction: () => {
        cancelDelete(`export-${row.id}`);
        setLink(row);
      },
    });
  };

  const working = job && (job.status === "queued" || job.status === "running");

  return (
    <Sheet open={open} onClose={close} label="Export" title={job ? OPTIONS.find((o) => o.kind === job.kind)?.title : `Turn ${count} ${count === 1 ? "save" : "saves"} into…`}>
      {!job && (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {OPTIONS.map((o) => {
              const live = o.kind === "collection" && link;
              return (
                <li key={o.kind}>
                  <button
                    type="button"
                    onClick={() => void start(o.kind)}
                    disabled={Boolean(starting) || (count === 0 && !live)}
                    aria-busy={starting === o.kind || undefined}
                    className={cx(
                      "flex min-h-16 w-full items-center gap-4 rounded-card border border-line bg-surface px-4 py-3 text-left",
                      "transition-colors duration-[var(--dur-fast)] hover:bg-raised active:scale-95 disabled:opacity-40",
                      starting === o.kind && "animate-pulse",
                    )}
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-raised text-fg">
                      <o.icon size={24} strokeWidth={2} aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-label text-fg">{o.title}</span>
                      <span className="text-caption text-fg-muted">{live ? "Your link is live · tap to see it" : o.detail}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-1 border-t border-line pt-2">
            <Switch
              label="Only applied and kept saves"
              description={`${countAppliedKept} of ${countAll}`}
              checked={onlyAppliedKept}
              onChange={setOnlyAppliedKept}
            />
            <Switch
              label="Include key quotes from transcripts"
              description="Brief and deck"
              checked={includeQuotes}
              onChange={setIncludeQuotes}
            />
          </div>
          {count === 0 && <p className="text-caption text-fg-muted">Nothing to export with this filter yet.</p>}
        </div>
      )}

      {job && working && (
        <div className="flex flex-col gap-4 py-2" role="status" aria-live="polite">
          <p className="text-body text-fg">{WORKING[job.kind]}</p>
          <div className="h-2 overflow-hidden rounded-full bg-raised" aria-hidden>
            <div className={cx("h-full rounded-full bg-fg-subtle", job.status === "running" ? "shimmer w-2/3" : "w-1/6")} />
          </div>
          <p className="text-caption text-fg-muted">
            {job.status === "queued" ? "Queued. It keeps going if you close this." : "Usually under a minute. You can close this and come back."}
          </p>
        </div>
      )}

      {job && job.status === "failed" && (
        <div className="flex flex-col gap-4 py-2" role="alert">
          <p className="text-body text-fg">{job.error ?? "The export didn't work."}</p>
          <Button icon={RotateCcw} onClick={() => { reset(); }} variant="secondary" fullWidth>
            Back to options
          </Button>
        </div>
      )}

      {job && job.status === "ready" && job.kind !== "collection" && (
        <div className="flex flex-col gap-3 py-2">
          <p className="text-body text-fg">Ready. Send it anywhere.</p>
          {[MAIN_EXT[job.kind], ...Object.keys(job.files).filter((e) => e !== MAIN_EXT[job.kind])].map((ext, i) => (
            <Button
              key={ext}
              icon={Share2}
              variant={i === 0 ? "primary" : "secondary"}
              loading={!files[ext] && !fileError}
              disabled={!files[ext]}
              onClick={() => void share(ext)}
              fullWidth
            >
              {`Share ${EXT_LABEL[ext] ?? ext.toUpperCase()}`}
            </Button>
          ))}
          {fileError && <p className="text-caption text-danger">Couldn&apos;t fetch the file. Check your connection and open Export again.</p>}
          <Button variant="ghost" onClick={reset} fullWidth>
            Make another
          </Button>
        </div>
      )}

      {job && job.status === "ready" && job.kind === "collection" && url && (
        <div className="flex flex-col gap-3 py-2">
          <p className="text-body text-fg-muted">Anyone with this link can see the saves of {spaceName}, read-only.</p>
          <p className="break-all rounded-card bg-raised px-4 py-3 text-label text-fg">{url}</p>
          <Button icon={Share2} onClick={() => void shareLink()} fullWidth>
            Share link
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button icon={Copy} variant="secondary" onClick={() => void copyLink()}>
              Copy
            </Button>
            <Button icon={ExternalLink} variant="secondary" onClick={() => window.open(url, "_blank", "noopener")}>
              Open
            </Button>
          </div>
          <Button variant="danger" onClick={stopSharing} fullWidth>
            Stop sharing
          </Button>
        </div>
      )}
    </Sheet>
  );
}
