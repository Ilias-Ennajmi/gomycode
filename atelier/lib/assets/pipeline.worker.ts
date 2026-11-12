/// <reference lib="webworker" />
import { browserEnv, ImageError, runPipeline } from "./pipeline-core";

/** Runs decoding and WebP encoding off the main thread. Protocol: { id, file } in; { id, ok, result | reason, message } out. */
self.onmessage = async (e: MessageEvent<{ id: number; file: Blob }>) => {
  const { id, file } = e.data;
  try {
    const result = await runPipeline(file, browserEnv());
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    const reason = err instanceof ImageError ? err.reason : "unsupported";
    const message = err instanceof Error ? err.message : "could not process the image";
    self.postMessage({ id, ok: false, reason, message });
  }
};
