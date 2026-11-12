// Streaming ZIP writer over fflate: entries are pushed in slices, output is collected as chunks (a Blob at the end) or written
// to a WritableStream (a file chosen with the File System Access API), so memory stays bounded by the largest single slice
// when a sink is used. Stored entries (`store: true`) are not recompressed: pictures and videos already are.
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import { abortError } from "./protocol";

const SLICE = 1024 * 1024;

export class ZipWriter {
  private readonly zip: Zip;
  private readonly chunks: Uint8Array[] = [];
  private readonly writer: WritableStreamDefaultWriter<Uint8Array> | null;
  private writes: Promise<void> = Promise.resolve();
  private failure: Error | null = null;
  private done: (() => void) | null = null;
  private readonly finished: Promise<void>;
  /** Bytes written to the archive so far. */
  bytes = 0;
  entries = 0;

  constructor(opts: { sink?: WritableStream<Uint8Array> } = {}) {
    this.writer = opts.sink ? opts.sink.getWriter() : null;
    this.finished = new Promise<void>((resolve) => (this.done = resolve));
    this.zip = new Zip((err, chunk, final) => {
      if (err) {
        this.failure = err;
        this.done?.();
        return;
      }
      this.bytes += chunk.length;
      if (this.writer) this.writes = this.writes.then(() => this.writer!.write(chunk));
      else this.chunks.push(chunk);
      if (final) this.done?.();
    });
  }

  private check(signal?: AbortSignal): void {
    if (this.failure) throw this.failure;
    if (signal?.aborted) throw abortError();
  }

  /** A whole entry from memory. */
  async addBytes(name: string, data: Uint8Array | string, o: { store?: boolean; signal?: AbortSignal } = {}): Promise<void> {
    this.check(o.signal);
    const bytes = typeof data === "string" ? strToU8(data) : data;
    const file = o.store ? new ZipPassThrough(name) : new ZipDeflate(name, { level: 6 });
    this.zip.add(file);
    this.entries++;
    for (let i = 0; i < bytes.length || i === 0; i += SLICE) {
      file.push(bytes.subarray(i, i + SLICE), i + SLICE >= bytes.length);
      if (this.writer) await this.writes;
      this.check(o.signal);
    }
  }

  /** An entry streamed from a Blob in 1 MB slices (never held whole in memory by the writer). */
  async addBlob(name: string, blob: Blob, o: { store?: boolean; signal?: AbortSignal } = {}): Promise<void> {
    this.check(o.signal);
    const file = o.store === false ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
    this.zip.add(file);
    this.entries++;
    if (blob.size === 0) {
      file.push(new Uint8Array(0), true);
      return;
    }
    for (let at = 0; at < blob.size; at += SLICE) {
      const slice = new Uint8Array(await blob.slice(at, at + SLICE).arrayBuffer());
      file.push(slice, at + SLICE >= blob.size);
      if (this.writer) await this.writes;
      this.check(o.signal);
    }
  }

  /** Close the archive. Resolves with the Blob, or null when a sink received the bytes. */
  async finish(): Promise<Blob | null> {
    this.zip.end();
    await this.finished;
    if (this.failure) throw this.failure;
    if (this.writer) {
      await this.writes;
      await this.writer.close();
      return null;
    }
    return new Blob(this.chunks as BlobPart[], { type: "application/zip" });
  }

  /** Stop without producing a file (cancel): the sink, if any, is aborted. */
  async abort(): Promise<void> {
    try {
      this.zip.terminate();
    } catch {
      /* already ended */
    }
    this.chunks.length = 0;
    if (this.writer) await this.writer.abort().catch(() => {});
  }
}
