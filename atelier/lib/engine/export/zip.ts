// ZIP export: the original file of every picture and video on the board, a credits sheet, the board's palette in every format
// and (optionally) each frame as a PNG, streamed into a ZIP with fflate so memory stays bounded. Plain async code with the
// network, the renderer and the destination passed in, so it is tested without a browser: `fetchOriginal` and `renderFrame`
// are callbacks, `sink` is a WritableStream (a file chosen with the File System Access API) or absent (a Blob is returned).
//
// Honest about what it cannot do: an original that will not download, or is over a cap, is left out and listed (in the
// summary, in README.txt and in manifest.json) instead of failing the export. Cancel stops at once and leaves nothing behind:
// no Blob is returned and the sink is aborted.
import { creditsCsv, type CreditsRow } from "@/lib/engine/provenance/credits";
import { exportPalette, PALETTE_FORMATS, type NamedColor } from "./palette-formats";
import { abortError, emptySummary, type ExportSummary } from "./protocol";
import { ZipWriter } from "./zip-writer";

export const ZIP_LIMITS = {
  /** Pictures and videos in one ZIP. */
  maxAssets: 2000,
  maxFrames: 200,
  /** One original over this is left out (the browser would have to hold it whole to fetch it). */
  perFileBytes: 250 * 1024 * 1024,
  /** The ZIP format fflate writes tops out at 4 GB; stay under it. */
  totalBytes: 3.5 * 1024 * 1024 * 1024,
  /** Building a Blob in memory (no file chosen): above this the browser would likely run out. */
  memoryBytes: 1536 * 1024 * 1024,
  /** Building a Blob over this asks first. */
  confirmBytes: 500 * 1024 * 1024,
  /** Originals downloaded at the same time. */
  concurrency: 3,
} as const;

export type ZipLimits = { [K in keyof typeof ZIP_LIMITS]: number };

const MB = 1024 * 1024;
const fmtMB = (bytes: number): string => `${Math.max(1, Math.round(bytes / MB)).toLocaleString("en-US")} MB`;

export class ZipRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipRefused";
  }
}

// ---- names -----------------------------------------------------------------------------------------------------------

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// Control characters, bidi overrides and isolates, zero-width marks and the byte-order mark.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

function cleanBase(raw: string): string {
  let s = String(raw ?? "")
    .normalize("NFC")
    .replace(INVISIBLE, "")
    .replace(/[^\p{L}\p{N}._ -]/gu, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+/, "")
    .replace(/[\s.]+$/, "");
  if (RESERVED.test(s)) s += "_";
  return s;
}

const cleanExt = (ext: string): string => String(ext ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toLowerCase() || "bin";

const NAME_MAX = 80;

/**
 * A file name for inside the ZIP: the base cleaned (letters, digits, `. _ - space`; anything else becomes `_`; no path, no
 * leading dots, no reserved Windows name), the extension cleaned, the whole name at most 80 characters, and unique among
 * `used` ignoring case (macOS and Windows would overwrite otherwise): a clash becomes "name (2).ext". Adds the result to `used`.
 */
export function uniqueFileName(base: string, ext: string, used: Set<string>): string {
  const e = cleanExt(ext);
  const room = NAME_MAX - e.length - 1;
  const stem = Array.from(cleanBase(base) || "file");
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? "" : ` (${n})`;
    const cut = stem.slice(0, Math.max(1, room - suffix.length)).join("").replace(/[\s.]+$/, "") || "file";
    const name = `${cut}${suffix}.${e}`;
    const key = name.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return name;
    }
  }
}

// ---- size guard ------------------------------------------------------------------------------------------------------

/** What the ZIP will hold, roughly: the declared bytes of every original plus a little for the directory and the text files. */
export function estimateZipBytes(assets: readonly { bytes: number }[]): number {
  let total = 64 * 1024 + assets.length * 200;
  for (const a of assets) if (Number.isFinite(a.bytes) && a.bytes > 0) total += a.bytes;
  return total;
}

export type ZipGuard = { ok: true; confirm?: string } | { ok: false; reason: string };

/** Whether a ZIP of this size can be made here, before anything is fetched. `confirm` is the question to ask first. */
export function zipGuard(
  plan: { count: number; estimatedBytes: number; frames: number },
  o: { hasSink: boolean; limits?: Partial<ZipLimits> },
): ZipGuard {
  const l = { ...ZIP_LIMITS, ...o.limits };
  if (plan.count > l.maxAssets) {
    return { ok: false, reason: `This board has ${plan.count.toLocaleString("en-US")} pictures and videos; one ZIP holds at most ${l.maxAssets.toLocaleString("en-US")}. Export the frames you need one at a time, or make a backup instead.` };
  }
  if (plan.frames > l.maxFrames) {
    return { ok: false, reason: `This board has ${plan.frames} frames; a ZIP can include pictures of at most ${l.maxFrames}. Turn off frame images, or export fewer frames.` };
  }
  if (plan.estimatedBytes > l.totalBytes) {
    return { ok: false, reason: `These files add up to about ${fmtMB(plan.estimatedBytes)}, which is too large for one ZIP (the limit is 4 GB). Make a backup instead, or export the board in parts.` };
  }
  if (!o.hasSink && plan.estimatedBytes > l.memoryBytes) {
    return { ok: false, reason: `This ZIP would be about ${fmtMB(plan.estimatedBytes)}, more than this browser can build in memory. Use Chrome or Edge, which can save it straight to a file you choose, or make a backup instead.` };
  }
  if (!o.hasSink && plan.estimatedBytes > l.confirmBytes) {
    return { ok: true, confirm: `This ZIP will be about ${fmtMB(plan.estimatedBytes)} and is built in memory first. Continue?` };
  }
  return { ok: true };
}

// ---- building --------------------------------------------------------------------------------------------------------

export interface ZipAssetInput {
  assetId: string;
  /** Names the file in the ZIP (the picture's title). */
  title: string;
  /** Declared size, for the estimate and the guard. */
  bytes: number;
}

export interface ZipOptions {
  boardTitle: string;
  /** Each asset once, in the order the files should be written. */
  assets: ZipAssetInput[];
  /** The board's palette (empty: no palette files). */
  palette: NamedColor[];
  includePalette: boolean;
  /** Builds the credits rows once the file names are known; `fileOf` gives the path inside the ZIP. Null: no credits.csv. */
  credits: ((fileOf: (assetId: string) => string) => CreditsRow[]) | null;
  /** Frames to draw as `frames/NN-name.png` (needs `renderFrame`). Null: none. */
  frames: { frameId: string; name: string }[] | null;
}

export interface ZipDeps {
  signal: AbortSignal;
  onProgress(ratio: number, label: string): void;
  fetchOriginal(assetId: string, signal?: AbortSignal): Promise<{ blob: Blob; ext: string } | null>;
  renderFrame?(frameId: string, signal: AbortSignal): Promise<Blob | null>;
  sink?: WritableStream<Uint8Array>;
  limits?: Partial<ZipLimits>;
  now?: () => Date;
}

export interface ZipResult {
  /** The archive; null when a sink received it. */
  blob: Blob | null;
  summary: ExportSummary;
  fileCount: number;
  estimatedBytes: number;
}

type Skipped = { assetId: string; title: string; reason: string };
type ManifestFile = { path: string; bytes: number; kind: "original" | "credits" | "palette" | "frame" | "readme"; assetId?: string };

const oneLine = (s: string): string => s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").trim();

function readme(title: string, at: Date, o: { hasCredits: boolean; palette: "none" | "files" | "off"; hasFrames: boolean; skipped: Skipped[]; notes: string[] }): string {
  const lines = [`${oneLine(title) || "Board"}`, `Exported from Atelier on ${at.toISOString().slice(0, 10)}`, "", "What is in this ZIP", "- originals/: the original file of each picture and video on the board, exactly as it was added."];
  if (o.hasCredits) lines.push("- credits.csv: source, credit and licence for each picture that has them. Opens in any spreadsheet.");
  if (o.palette === "files") lines.push("- palette/: the board's colours as .ase (Adobe), .swatches (Procreate), CSS variables, Tailwind and JSON.");
  if (o.hasFrames) lines.push("- frames/: each frame as a PNG picture, in presentation order.");
  lines.push("- manifest.json: a list of every file.");
  if (o.palette === "none") lines.push("", "No palette: this board has no palette and no pictures to take colours from, so there are no palette files.");
  if (o.skipped.length) {
    lines.push("", `Left out (${o.skipped.length})`);
    for (const s of o.skipped) lines.push(`- ${oneLine(s.title) || s.assetId}: ${s.reason}`);
  }
  if (o.notes.length) {
    lines.push("", "Notes");
    for (const n of o.notes) lines.push(`- ${oneLine(n)}`);
  }
  return `${lines.join("\n")}\n`;
}

export async function buildZip(o: ZipOptions, d: ZipDeps): Promise<ZipResult> {
  const limits: ZipLimits = { ...ZIP_LIMITS, ...d.limits };
  const signal = d.signal;
  if (signal.aborted) throw abortError();

  const estimatedBytes = estimateZipBytes(o.assets);
  // Counts and sizes are checked against the real limits; a test lowers the per-file and running caps, not these.
  const guard = zipGuard({ count: o.assets.length, estimatedBytes, frames: o.frames?.length ?? 0 }, { hasSink: !!d.sink, limits: { maxAssets: limits.maxAssets, maxFrames: limits.maxFrames } });
  if (!guard.ok) throw new ZipRefused(guard.reason);

  const abortP = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(abortError()), { once: true }));
  abortP.catch(() => {});
  const raceAbort = <T>(p: Promise<T>): Promise<T> => Promise.race([p, abortP]);

  const zip = new ZipWriter({ sink: d.sink });
  const summary = emptySummary();
  const skipped: Skipped[] = [];
  const files: ManifestFile[] = [];
  const notes: string[] = [];
  const fileOfAsset = new Map<string, string>();
  const used = new Set<string>();
  const now = (d.now?.() ?? new Date());
  const hasFrames = !!(o.frames && o.frames.length && d.renderFrame);
  const originalsEnd = hasFrames ? 0.7 : 0.9;

  try {
    // -- originals: downloaded up to `concurrency` at a time, written in order -------------------------------------------
    const n = o.assets.length;
    const started: Promise<{ blob: Blob; ext: string } | null>[] = [];
    let next = 0;
    const start = (i: number) => {
      started[i] = (async () => {
        try {
          return await d.fetchOriginal(o.assets[i].assetId, signal);
        } catch {
          return null;
        }
      })();
    };
    let written = 0;
    for (let i = 0; i < n; i++) {
      while (next < n && next - i < limits.concurrency) start(next++);
      const a = o.assets[i];
      d.onProgress((i / Math.max(n, 1)) * originalsEnd, `Original ${i + 1} of ${n}`);
      const got = await raceAbort(started[i]);
      started[i] = undefined as never; // let the Blob go once it is written
      if (signal.aborted) throw abortError();
      if (!got) {
        skipped.push({ assetId: a.assetId, title: a.title, reason: "Could not be downloaded" });
        continue;
      }
      if (got.blob.size > limits.perFileBytes) {
        skipped.push({ assetId: a.assetId, title: a.title, reason: `Too large to include (${fmtMB(got.blob.size)}; the limit for one file is ${fmtMB(limits.perFileBytes)})` });
        continue;
      }
      if (written + got.blob.size > limits.totalBytes) {
        skipped.push({ assetId: a.assetId, title: a.title, reason: "Left out: the ZIP reached its 4 GB size limit" });
        continue;
      }
      const name = uniqueFileName(a.title || "image", got.ext, used);
      const path = `originals/${name}`;
      await raceAbort(zip.addBlob(path, got.blob, { store: true, signal }));
      written += got.blob.size;
      fileOfAsset.set(a.assetId, path);
      files.push({ path, bytes: got.blob.size, kind: "original", assetId: a.assetId });
    }
    if (skipped.some((s) => s.reason.includes("4 GB size limit"))) notes.push("The ZIP reached the 4 GB limit, so later files were left out.");

    // -- frames as PNG ---------------------------------------------------------------------------------------------------
    if (hasFrames) {
      const frames = o.frames!;
      const usedFrames = new Set<string>();
      for (let k = 0; k < frames.length; k++) {
        const f = frames[k];
        d.onProgress(originalsEnd + (k / frames.length) * 0.22, `Frame ${k + 1} of ${frames.length}`);
        let blob: Blob | null = null;
        try {
          blob = await raceAbort(d.renderFrame!(f.frameId, signal));
        } catch (e) {
          if (signal.aborted || (e instanceof DOMException && e.name === "AbortError")) throw abortError();
          blob = null;
        }
        if (!blob) {
          const msg = `Frame "${oneLine(f.name) || "Frame"}" could not be drawn and is not in the ZIP.`;
          summary.warnings.push(msg);
          notes.push(msg);
          continue;
        }
        const path = `frames/${uniqueFileName(`${String(k + 1).padStart(2, "0")}-${f.name.trim() || "Frame"}`, "png", usedFrames)}`;
        await raceAbort(zip.addBlob(path, blob, { store: true, signal }));
        files.push({ path, bytes: blob.size, kind: "frame" });
      }
    }

    // -- palette ---------------------------------------------------------------------------------------------------------
    let paletteState: "none" | "files" | "off" = "off";
    if (o.includePalette) {
      if (o.palette.length === 0) paletteState = "none";
      else {
        paletteState = "files";
        const exportedAt = now.toISOString();
        let dropped = 0;
        for (const f of PALETTE_FORMATS) {
          const r = exportPalette(f.id, o.palette, { name: o.boardTitle || "palette", boardTitle: o.boardTitle, exportedAt });
          dropped = Math.max(dropped, r.skipped);
          const path = `palette/${r.filename}`;
          await zip.addBytes(path, r.bytes, { store: f.id === "procreate", signal });
          files.push({ path, bytes: typeof r.bytes === "string" ? new TextEncoder().encode(r.bytes).length : r.bytes.length, kind: "palette" });
        }
        if (dropped) notes.push(`${dropped} palette entr${dropped === 1 ? "y was" : "ies were"} not a colour and ${dropped === 1 ? "was" : "were"} left out of the palette files.`);
      }
    }

    // -- credits ---------------------------------------------------------------------------------------------------------
    if (o.credits) {
      const rows = o.credits((id) => fileOfAsset.get(id) ?? "(not in this ZIP)");
      const csv = creditsCsv(rows, { bom: true });
      await zip.addBytes("credits.csv", csv, { signal });
      files.push({ path: "credits.csv", bytes: new TextEncoder().encode(csv).length, kind: "credits" });
    }

    // -- manifest and README ---------------------------------------------------------------------------------------------
    d.onProgress(0.95, "Writing the file list");
    summary.failedAssets = skipped.map((s) => s.assetId);
    if (skipped.length) summary.warnings.push(`${skipped.length} file${skipped.length === 1 ? " was" : "s were"} left out (see README.txt in the ZIP).`);
    const manifest = {
      format: "atelier-export",
      version: 1,
      boardTitle: o.boardTitle,
      createdAt: now.toISOString(),
      files,
      skipped: skipped.map((s) => ({ assetId: s.assetId, title: s.title, reason: s.reason })),
    };
    await zip.addBytes("manifest.json", JSON.stringify(manifest, null, 2), { signal });
    await zip.addBytes("README.txt", readme(o.boardTitle, now, { hasCredits: !!o.credits, palette: paletteState, hasFrames: files.some((f) => f.kind === "frame"), skipped, notes }), { signal });

    d.onProgress(0.98, "Finishing");
    const blob = await raceAbort(zip.finish());
    d.onProgress(1, "Done");
    return { blob, summary, fileCount: zip.entries, estimatedBytes };
  } catch (e) {
    await zip.abort();
    throw e;
  }
}
