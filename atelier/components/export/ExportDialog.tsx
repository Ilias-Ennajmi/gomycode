"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog } from "@/components/home/Dialog";
import { buttonPrimary, buttonSecondary, helpClass, inputClass, labelClass } from "@/components/ui/controls";
import { downloadFile, sanitizeFileName } from "@/lib/download";
import type { BoardDoc } from "@/lib/engine/doc/board-doc";
import type { ExportFormat, ExportPreset, ExportScope } from "@/lib/engine/export/export-commands";
import {
  exportBackup,
  exportImage,
  exportJsonCanvas,
  exportPdf,
  exportSvg,
  framesInOrder,
  previewSceneSize,
  type ExportHandle,
  type ExportResult,
} from "@/lib/engine/export/export-api";
import type { AssetSource } from "@/lib/engine/export/images";
import { getExportManager, type ExportManager } from "@/lib/engine/export/manager";
import { ExportCancelled } from "@/lib/engine/export/protocol";
import { clampScale } from "@/lib/engine/export/raster";
import { boardDocSource, type ExportTarget } from "@/lib/engine/export/scene";
import type { ToastFn } from "@/lib/engine/commands/registry";
import type { CreditsRow } from "@/lib/engine/provenance/credits";
import { getAssetMetaStore } from "@/lib/assets/meta-store";
import { ExportProgress } from "./ExportProgress";

type Props = {
  doc: BoardDoc;
  selectionIds: ReadonlySet<string>;
  assets: AssetSource;
  toast: ToastFn;
  preset?: ExportPreset;
  manager?: Pick<ExportManager, "run">;
  /** Credits rows for the deck's credits page. Without it the dialog does not offer that page. */
  creditsRows?: () => CreditsRow[];
  onClose(): void;
};

type Run =
  | { state: "idle" }
  | { state: "running"; ratio: number; label: string }
  | { state: "done"; result: ExportResult }
  | { state: "error"; message: string };

/** Formats this dialog can write. (PDF, ZIP and backups are added by their own tasks.) */
const IMAGE_FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "png", label: "PNG" },
  { id: "jpeg", label: "JPG" },
  { id: "webp", label: "WebP" },
  { id: "svg", label: "SVG" },
  { id: "pdf", label: "PDF" },
  { id: "backup", label: "Backup" },
  { id: "jsonCanvas", label: "JSON Canvas" },
];

const SIZES = [1, 2, 4] as const;
type SizeChoice = (typeof SIZES)[number] | "custom";

const chip =
  "flex min-h-11 cursor-pointer select-none items-center justify-center rounded-md border border-line bg-panel px-3 text-(length:--text-md) transition-[transform,border-color,background-color] duration-(--dur-fast) ease-out peer-checked:border-brand peer-checked:bg-(--color-selection-fill) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-select peer-disabled:cursor-not-allowed peer-disabled:opacity-50 active:scale-[0.98] hoverable:border-fg-muted";

function Radio<T extends string | number>({ name, value, current, onChange, children, disabled }: { name: string; value: T; current: T; onChange(v: T): void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <label className="block">
      <input type="radio" name={name} value={String(value)} checked={current === value} disabled={disabled} onChange={() => onChange(value)} className="peer sr-only" />
      <span className={chip}>{children}</span>
    </label>
  );
}

export function describeFailure(e: unknown): string {
  const raw = e instanceof Error ? e.message : "";
  if (/OffscreenCanvas|Worker/i.test(raw)) return raw || "This browser can't export here. Update your browser and try again.";
  if (/memory|allocation|too large/i.test(raw)) return "That export is too large for this device's memory. Try a smaller size or a single frame.";
  return raw || "The export failed. Try again, or export a smaller part of the board.";
}

/**
 * The Export dialog: what to export (selection, a frame, the whole board), the format, size and background, then a
 * progress bar with Cancel while the worker runs, and a summary of anything that could not be done exactly (pictures that
 * failed to load, fonts that were substituted, a size that was reduced). A native modal <dialog>: focus is trapped, Escape
 * closes it (and cancels a running export).
 */
export function ExportDialog({ doc, selectionIds, assets, toast, preset, manager, creditsRows, onClose }: Props) {
  const uid = useId();
  const src = useMemo(() => boardDocSource(doc), [doc]);
  const frames = useMemo(() => framesInOrder(src), [src]);
  const hasSelection = selectionIds.size > 0;

  const [scope, setScope] = useState<ExportScope>(preset?.scope ?? (hasSelection ? "selection" : "board"));
  const [frameId, setFrameId] = useState<string>(() => {
    const sel = [...selectionIds].find((id) => frames.some((f) => f.id === id));
    return sel ?? frames[0]?.id ?? "";
  });
  const [format, setFormat] = useState<ExportFormat>(preset?.format && IMAGE_FORMATS.some((f) => f.id === preset.format) ? preset.format : "png");
  const [size, setSize] = useState<SizeChoice>(1);
  const [customWidth, setCustomWidth] = useState("1920");
  const [transparent, setTransparent] = useState(false);
  const [quality, setQuality] = useState(92);
  const [linkImages, setLinkImages] = useState(false);
  const [credits, setCredits] = useState(false);
  const [name, setName] = useState("");
  const [pdfQuality, setPdfQuality] = useState<"screen" | "print">("screen");
  const [cover, setCover] = useState(false);
  const [coverTitle, setCoverTitle] = useState(() => doc.meta.title);
  const [coverClient, setCoverClient] = useState("");
  const [coverDate, setCoverDate] = useState(() => new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }));
  const [palettePage, setPalettePage] = useState(false);
  const [creditsPage, setCreditsPage] = useState(false);
  const [run, setRun] = useState<Run>({ state: "idle" });

  const handle = useRef<ExportHandle | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      handle.current?.cancel();
    };
  }, []);

  const effectiveScope: ExportScope = scope === "selection" && !hasSelection ? "board" : scope === "frame" && frames.length === 0 ? "board" : scope;
  const target: ExportTarget = useMemo(
    () => (effectiveScope === "frame" ? { kind: "frame", id: frameId } : effectiveScope === "selection" ? { kind: "selection", ids: [...selectionIds] } : { kind: "board" }),
    [effectiveScope, frameId, selectionIds],
  );

  const isSvg = format === "svg";
  const isPdf = format === "pdf";
  const isBackup = format === "backup";
  const isCanvas = format === "jsonCanvas";
  /** Formats that always take the whole board and have no picture options. */
  const wholeBoard = isBackup || isCanvas;
  const canBeTransparent = format !== "jpeg" && !isPdf && !wholeBoard;
  const pdfFrameIds = useMemo((): string[] | null => {
    if (effectiveScope === "frame") return frameId ? [frameId] : [];
    if (effectiveScope === "selection") {
      const picked = frames.filter((f) => selectionIds.has(f.id)).map((f) => f.id);
      return picked.length ? picked : null;
    }
    return null;
  }, [effectiveScope, frameId, frames, selectionIds]);
  const lossy = format === "jpeg" || format === "webp";

  // The output size, before anything starts.
  const preview = useMemo(() => {
    try {
      const s = previewSceneSize(src, target, { credits });
      const req = size === "custom" ? { widthPx: Number(customWidth) } : { scale: size };
      return { ...s, empty: isPdf ? frames.length === 0 : s.empty, out: isSvg || isPdf ? null : clampScale(s, req) };
    } catch {
      return null;
    }
  }, [src, target, credits, size, customWidth, isSvg, isPdf, frames.length]);

  const running = run.state === "running";
  const extension = format === "jpeg" ? "jpg" : isBackup ? "atelier" : isCanvas ? "canvas" : format;
  const pageCount = isPdf ? (pdfFrameIds ?? frames.map((f) => f.id)).length + (cover ? 1 : 0) + (palettePage ? 1 : 0) : 0;

  async function start() {
    if (running) return;
    setRun({ state: "running", ratio: 0, label: "Preparing" });
    const onProgress = (ratio: number, label: string) => {
      if (alive.current) setRun((cur) => (cur.state === "running" ? { state: "running", ratio, label } : cur));
    };
    const deps = { manager: manager ?? getExportManager(), assets, onProgress };
    const common = { transparent: transparent && canBeTransparent, credits };
    const h = isBackup
      ? exportBackup(doc, { ...deps, meta: getAssetMetaStore() })
      : isCanvas
        ? exportJsonCanvas(doc, deps)
        : isPdf
      ? exportPdf(
          src,
          {
            quality: pdfQuality,
            cover: cover ? { title: coverTitle.trim() || doc.meta.title, client: coverClient.trim(), date: coverDate.trim() } : null,
            palettePage,
            creditsPage: creditsPage && !!creditsRows,
            frameIds: pdfFrameIds,
            credits: creditsPage && creditsRows ? creditsRows() : undefined,
            assetPalettes: palettePage ? assetPalettes() : undefined,
          },
          deps,
        )
      : isSvg
      ? exportSvg(src, target, { ...common, imageMode: linkImages ? "link" : "embed" }, deps)
      : exportImage(src, target, { ...common, format: format as "png" | "jpeg" | "webp", size: size === "custom" ? { widthPx: Number(customWidth) } : { scale: size }, quality: quality / 100 }, deps);
    handle.current = h;
    try {
      const result = await h.promise;
      const resultExt = result.filename.split(".").pop() ?? extension;
      const filename = name.trim() ? `${sanitizeFileName(name, "export")}.${resultExt}` : result.filename;
      downloadFile(filename, result.blob);
      if (!alive.current) return;
      setRun({ state: "done", result: { ...result, filename } });
      const dims = result.width && result.height ? ` (${result.width} × ${result.height} px)` : "";
      toast({ message: `Exported ${filename}${dims}`, durationMs: 6000 });
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof ExportCancelled) {
        setRun({ state: "idle" });
        toast({ message: "Export cancelled", durationMs: 3000 });
      } else {
        const message = describeFailure(e);
        setRun({ state: "error", message });
        toast({ message, durationMs: 8000 });
      }
    } finally {
      if (handle.current === h) handle.current = null;
    }
  }

  /** The colour palettes of the board's pictures with the area each covers: the palette page's fallback. */
  function assetPalettes() {
    const meta = getAssetMetaStore();
    const out: { palette: { hex: string; weight: number }[]; area: number }[] = [];
    for (const o of src.all()) {
      if (o.type !== "image") continue;
      const p = meta.get(o.assetId)?.palette;
      if (p && p.length) out.push({ palette: p, area: o.w * o.h });
    }
    return out;
  }

  const summary = run.state === "done" ? run.result.summary : null;
  const problems = summary
    ? [
        summary.clampedReason,
        summary.failedAssets.length ? `${summary.failedAssets.length} image${summary.failedAssets.length === 1 ? "" : "s"} could not be loaded and show as grey boxes.` : null,
        summary.substitutedFonts.length ? `Drawn in Inter instead of: ${summary.substitutedFonts.join(", ")}.` : null,
        ...summary.warnings,
      ].filter((s): s is string => !!s)
    : [];

  const titleId = `${uid}-title`;
  const outId = `${uid}-out`;

  return (
    <Dialog
      labelledBy={titleId}
      describedBy={outId}
      onClose={() => {
        handle.current?.cancel();
        onClose();
      }}
      widthClass="w-[min(34rem,calc(100vw-2rem))]"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
        data-export-dialog=""
      >
        <h2 id={titleId} className="mb-5 text-(length:--text-lg) font-semibold">
          Export
        </h2>

        <fieldset disabled={running} className="m-0 min-w-0 border-0 p-0">
          {wholeBoard ? null : <><p id={`${uid}-scope-l`} className={labelClass}>
            What to export
          </p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby={`${uid}-scope-l`}>
            <Radio<ExportScope> name={`${uid}-scope`} value="selection" current={effectiveScope} onChange={setScope} disabled={!hasSelection}>
              Selection
            </Radio>
            <Radio<ExportScope> name={`${uid}-scope`} value="frame" current={effectiveScope} onChange={setScope} disabled={frames.length === 0}>
              Frame
            </Radio>
            <Radio<ExportScope> name={`${uid}-scope`} value="board" current={effectiveScope} onChange={setScope}>
              Board
            </Radio>
          </div>
          </>}
          {wholeBoard ? null : effectiveScope === "frame" ? (
            <div className="mt-3">
              <label htmlFor={`${uid}-frame`} className={labelClass}>
                Frame
              </label>
              <select id={`${uid}-frame`} className={inputClass} value={frameId} onChange={(e) => setFrameId(e.target.value)}>
                {frames.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name || "Frame"}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <p id={`${uid}-format-l`} className={`${labelClass} mt-5`}>
            Format
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-labelledby={`${uid}-format-l`}>
            {IMAGE_FORMATS.map((f) => (
              <Radio<ExportFormat> key={f.id} name={`${uid}-format`} value={f.id} current={format} onChange={setFormat}>
                {f.label}
              </Radio>
            ))}
          </div>

          {wholeBoard ? (
            <p className={`${helpClass} mt-4`} data-whole-board="">
              {isBackup
                ? "A backup holds the whole board and the original file of every picture and video. Open it from the home screen with Import backup: it always becomes a new board and never replaces one."
                : "JSON Canvas is an open format other tools read. Text, notes, links, frames and arrows are kept; pen strokes and rotation are not. With pictures it is a zip: unpack it into your notes folder."}
            </p>
          ) : isPdf ? (
            <div className="mt-5 flex flex-col gap-1" data-pdf-options="">
              <p id={`${uid}-pq-l`} className={labelClass}>
                Picture quality
              </p>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby={`${uid}-pq-l`}>
                <Radio<"screen" | "print"> name={`${uid}-pq`} value="screen" current={pdfQuality} onChange={setPdfQuality}>
                  Screen · 150 dpi
                </Radio>
                <Radio<"screen" | "print"> name={`${uid}-pq`} value="print" current={pdfQuality} onChange={setPdfQuality}>
                  Print · 300 dpi
                </Radio>
              </div>
              <label className="mt-2 flex min-h-11 items-center gap-3 text-(length:--text-md)">
                <input type="checkbox" checked={cover} onChange={(e) => setCover(e.target.checked)} className="size-4 accent-(--color-accent)" />
                Cover page
              </label>
              {cover ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <label htmlFor={`${uid}-ct`} className={labelClass}>
                      Title
                    </label>
                    <input id={`${uid}-ct`} className={inputClass} value={coverTitle} maxLength={200} onChange={(e) => setCoverTitle(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-cc`} className={labelClass}>
                      Client
                    </label>
                    <input id={`${uid}-cc`} className={inputClass} value={coverClient} maxLength={120} onChange={(e) => setCoverClient(e.target.value)} />
                  </div>
                  <div>
                    <label htmlFor={`${uid}-cd`} className={labelClass}>
                      Date
                    </label>
                    <input id={`${uid}-cd`} className={inputClass} value={coverDate} maxLength={60} onChange={(e) => setCoverDate(e.target.value)} />
                  </div>
                </div>
              ) : null}
              <label className="flex min-h-11 items-center gap-3 text-(length:--text-md)">
                <input type="checkbox" checked={palettePage} onChange={(e) => setPalettePage(e.target.checked)} className="size-4 accent-(--color-accent)" />
                Palette page
              </label>
              {creditsRows ? (
                <label className="flex min-h-11 items-center gap-3 text-(length:--text-md)">
                  <input type="checkbox" checked={creditsPage} onChange={(e) => setCreditsPage(e.target.checked)} className="size-4 accent-(--color-accent)" />
                  Credits page
                </label>
              ) : null}
              <p className={helpClass}>One page per frame, in presentation order, at the frame&apos;s size. Text stays real text.</p>
            </div>
          ) : isSvg ? (
            <div className="mt-5">
              <label className="flex min-h-11 items-center gap-3 text-(length:--text-md)">
                <input type="checkbox" checked={linkImages} onChange={(e) => setLinkImages(e.target.checked)} className="size-4 accent-(--color-accent)" />
                Link images instead of embedding them
              </label>
              <p className={helpClass}>Embedded images make the file self-contained but larger. Linked images need the storage address to stay reachable.</p>
            </div>
          ) : (
            <>
              <p id={`${uid}-size-l`} className={`${labelClass} mt-5`}>
                Size
              </p>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-labelledby={`${uid}-size-l`}>
                {SIZES.map((s) => (
                  <Radio<SizeChoice> key={s} name={`${uid}-size`} value={s} current={size} onChange={setSize}>
                    {s}×
                  </Radio>
                ))}
                <Radio<SizeChoice> name={`${uid}-size`} value="custom" current={size} onChange={setSize}>
                  Width
                </Radio>
              </div>
              {size === "custom" ? (
                <div className="mt-3">
                  <label htmlFor={`${uid}-w`} className={labelClass}>
                    Width in pixels
                  </label>
                  <input id={`${uid}-w`} type="number" min={1} max={16384} inputMode="numeric" className={inputClass} value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} />
                </div>
              ) : null}
              {lossy ? (
                <div className="mt-3">
                  <label htmlFor={`${uid}-q`} className={labelClass}>
                    Quality {quality}%
                  </label>
                  <input id={`${uid}-q`} type="range" min={50} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-(--color-accent)" />
                </div>
              ) : null}
            </>
          )}

          {isPdf ? null : <div className="mt-4 flex flex-col">
            <label className="flex min-h-11 items-center gap-3 text-(length:--text-md)">
              <input type="checkbox" checked={transparent && canBeTransparent} disabled={!canBeTransparent} onChange={(e) => setTransparent(e.target.checked)} className="size-4 accent-(--color-accent)" />
              Transparent background{!canBeTransparent ? " (not available for JPG)" : ""}
            </label>
            <label className="flex min-h-11 items-center gap-3 text-(length:--text-md)">
              <input type="checkbox" checked={credits} onChange={(e) => setCredits(e.target.checked)} className="size-4 accent-(--color-accent)" />
              Add credit captions to pictures
            </label>
          </div>}

          <div className="mt-2">
            <label htmlFor={`${uid}-name`} className={labelClass}>
              File name
            </label>
            <div className="flex items-center gap-2">
              <input id={`${uid}-name`} className={inputClass} value={name} maxLength={120} placeholder="Board name" autoComplete="off" onChange={(e) => setName(e.target.value)} />
              <span className="shrink-0 text-(length:--text-md) text-fg-muted">.{extension}</span>
            </div>
          </div>
        </fieldset>

        <p id={outId} className="mt-4 text-(length:--text-sm) text-fg-muted" data-export-size="">
          {wholeBoard
            ? ""
            : preview?.empty
            ? isPdf
              ? "A deck needs at least one frame: each frame becomes a page."
              : "There is nothing to export here yet."
            : preview
              ? isPdf
                ? `Output: ${pageCount} page${pageCount === 1 ? "" : "s"}.`
                : isSvg
                ? `Output: ${Math.round(preview.width)} × ${Math.round(preview.height)} units, vector.`
                : `Output: ${preview.out!.width.toLocaleString("en-US")} × ${preview.out!.height.toLocaleString("en-US")} px.`
              : ""}
        </p>
        {preview?.out?.reason ? (
          <p role="note" className="mt-1 text-(length:--text-sm) font-medium text-fg" data-export-clamp="">
            {preview.out.reason}
          </p>
        ) : null}

        {run.state === "running" ? <ExportProgress ratio={run.ratio} label={run.label} onCancel={() => handle.current?.cancel()} /> : null}

        {run.state === "error" ? (
          <p role="alert" className="mt-4 text-(length:--text-sm) text-alert">
            {run.message}
          </p>
        ) : null}

        {run.state === "done" ? (
          <div role="status" className="mt-4 text-(length:--text-sm)" data-export-summary="">
            <p className="font-medium text-fg">Saved {run.result.filename}.</p>
            {problems.length ? (
              <ul className="mt-1 list-disc pl-5 text-fg-muted">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className={buttonSecondary}
            onClick={() => {
              handle.current?.cancel();
              onClose();
            }}
          >
            {run.state === "done" ? "Close" : "Cancel"}
          </button>
          <button type="submit" className={buttonPrimary} disabled={running || (!wholeBoard && preview?.empty === true)} data-autofocus="">
            {running ? "Exporting…" : "Export"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
