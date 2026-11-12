// Messages between the export manager (main thread) and the export worker, and the shared result types.

export type JobKind = "raster" | "svg" | "pdf" | "zip" | "backup" | "import" | "jsoncanvas";

export type WorkerIn = { type: "start"; id: string; kind: JobKind; payload: unknown } | { type: "cancel"; id: string };

export interface ExportSummary {
  /** Asset ids whose picture could not be read (drawn as a placeholder, or left out). */
  failedAssets: string[];
  /** Font families that are not bundled and were drawn in Inter. */
  substitutedFonts: string[];
  /** Why the output is smaller than asked ("Reduced to 16,384 px wide (browser limit)"). */
  clampedReason?: string;
  warnings: string[];
  width?: number;
  height?: number;
  /** File extension of the result when the job decides it (a JSON Canvas export is a .zip when it carries pictures). */
  extension?: string;
}

export type WorkerOut =
  /** The worker has installed its message handler: only now can it be given work (a message sent earlier may be lost). */
  | { type: "ready" }
  | { type: "progress"; id: string; ratio: number; label: string }
  | { type: "done"; id: string; blob: Blob; summary: ExportSummary }
  | { type: "error"; id: string; message: string; name?: string };

/** Thrown (and rejected with) when a job is cancelled. */
export class ExportCancelled extends Error {
  constructor() {
    super("Export cancelled");
    this.name = "ExportCancelled";
  }
}

export const emptySummary = (): ExportSummary => ({ failedAssets: [], substitutedFonts: [], warnings: [] });

export const abortError = (): DOMException => new DOMException("Aborted", "AbortError");
