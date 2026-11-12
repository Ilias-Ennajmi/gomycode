/// <reference lib="webworker" />
import { browserEnv, ImageError, runAnalysis, runPipeline } from "./pipeline-core";

/**
 * Runs decoding, WebP encoding and colour analysis off the main thread.
 * Protocol: { id, file, op? } in (op "analyse" = colour analysis only; anything else = the full pipeline);
 * { id, ok: true, result } or { id, ok: false, reason, message } out.
 */
self.onmessage = async (e: MessageEvent<{ id: number; file: Blob; op?: "process" | "analyse" }>) => {
  const { id, file, op } = e.data;
  try {
    const result = op === "analyse" ? await runAnalysis(file, browserEnv()) : await runPipeline(file, browserEnv());
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    const reason = err instanceof ImageError ? err.reason : "unsupported";
    const message = err instanceof Error ? err.message : "could not process the image";
    self.postMessage({ id, ok: false, reason, message });
  }
};
