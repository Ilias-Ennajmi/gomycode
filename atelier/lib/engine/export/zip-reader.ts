// A defensive ZIP reader: it reads only the central directory (the end of the file) up front, checks names, counts and sizes
// before anything is inflated, and inflates entries one at a time through a stream that is cut off the moment it would exceed
// what the directory declared. Written for `.atelier` imports, where the file may be hostile.

export type ZipErrorCode = "not-zip" | "truncated" | "too-large" | "bad-entry-name" | "zip-bomb" | "corrupt";

export class ZipError extends Error {
  constructor(
    readonly code: ZipErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ZipError";
  }
}

export interface ZipEntry {
  name: string;
  /** 0 stored, 8 deflate. */
  method: number;
  compSize: number;
  size: number;
  offset: number;
}

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;

async function bytesOf(file: Blob, from: number, to: number): Promise<DataView> {
  const buf = await file.slice(from, to).arrayBuffer();
  return new DataView(buf);
}

/** The entries of a ZIP, from its central directory. `maxEntries` is checked before the directory is read. */
export async function readCentralDirectory(file: Blob, o: { maxEntries: number }): Promise<ZipEntry[]> {
  if (file.size < 22) throw new ZipError("not-zip", "That is not a zip file");
  const head = await bytesOf(file, 0, 4);
  const startsLikeZip = head.getUint32(0, true) === LOC || head.getUint32(0, true) === EOCD;
  if (!startsLikeZip) throw new ZipError("not-zip", "That is not a zip file");
  const tailLen = Math.min(file.size, 22 + 65535);
  const tail = await bytesOf(file, file.size - tailLen, file.size);
  let at = -1;
  for (let i = tailLen - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD) {
      at = i;
      break;
    }
  }
  if (at < 0) throw new ZipError("truncated", "The file is incomplete (its end is missing)");
  const total = tail.getUint16(at + 10, true);
  const cdSize = tail.getUint32(at + 12, true);
  const cdOffset = tail.getUint32(at + 16, true);
  if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new ZipError("too-large", "That archive is too large to open");
  if (total > o.maxEntries) throw new ZipError("too-large", `That archive has too many files (${total})`);
  if (cdOffset + cdSize > file.size) throw new ZipError("truncated", "The file is incomplete");
  const cd = await bytesOf(file, cdOffset, cdOffset + cdSize);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < total; i++) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== CEN) throw new ZipError("corrupt", "The archive's file list is damaged");
    const method = cd.getUint16(p + 10, true);
    const compSize = cd.getUint32(p + 20, true);
    const size = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    const offset = cd.getUint32(p + 42, true);
    if (p + 46 + nameLen > cd.byteLength) throw new ZipError("corrupt", "The archive's file list is damaged");
    const name = new TextDecoder("utf-8").decode(new Uint8Array(cd.buffer, p + 46, nameLen));
    entries.push({ name, method, compSize, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * The bytes of one entry as a Blob. Stored entries are returned as a slice of the file (nothing is read into memory);
 * deflated ones are inflated through a stream that stops with `zip-bomb` as soon as the output passes the declared size.
 */
export async function readEntry(file: Blob, e: ZipEntry, o: { signal?: AbortSignal } = {}): Promise<Blob> {
  const loc = await bytesOf(file, e.offset, Math.min(file.size, e.offset + 30));
  if (loc.byteLength < 30 || loc.getUint32(0, true) !== LOC) throw new ZipError("corrupt", `The entry "${e.name}" is damaged`);
  const start = e.offset + 30 + loc.getUint16(26, true) + loc.getUint16(28, true);
  if (start + e.compSize > file.size) throw new ZipError("truncated", "The file is incomplete");
  const raw = file.slice(start, start + e.compSize);
  if (e.method === 0) {
    if (e.compSize !== e.size) throw new ZipError("corrupt", `The entry "${e.name}" is damaged`);
    return raw;
  }
  if (e.method !== 8) throw new ZipError("corrupt", `The entry "${e.name}" uses an unsupported compression`);
  const reader = raw.stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  try {
    for (;;) {
      if (o.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      n += value.length;
      if (n > e.size) throw new ZipError("zip-bomb", `The entry "${e.name}" is larger than the archive says`);
      parts.push(value);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    if (err instanceof ZipError || (err instanceof DOMException && err.name === "AbortError")) throw err;
    throw new ZipError("corrupt", `The entry "${e.name}" is damaged`);
  }
  if (n !== e.size) throw new ZipError("corrupt", `The entry "${e.name}" is damaged`);
  return new Blob(parts as BlobPart[]);
}
