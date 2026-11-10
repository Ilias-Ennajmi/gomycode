import { Unzip, UnzipInflate, strFromU8 } from "fflate";

/**
 * Reads only the wanted entries of a ZIP, streaming it chunk by chunk, so a
 * multi-gigabyte data export (photos and videos included) never has to fit in
 * memory. Returns entry name → text.
 */
export async function readZipEntries(
  blob: Blob,
  wanted: (name: string) => boolean,
  onProgress?: (fraction: number) => void,
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const pending: Promise<void>[] = [];
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (file) => {
    if (!wanted(file.name)) return; // never inflated
    const parts: Uint8Array[] = [];
    pending.push(
      new Promise<void>((resolve, reject) => {
        file.ondata = (err, chunk, final) => {
          if (err) {
            reject(err);
            return;
          }
          parts.push(chunk);
          if (final) {
            const size = parts.reduce((n, p) => n + p.length, 0);
            const all = new Uint8Array(size);
            let at = 0;
            for (const p of parts) {
              all.set(p, at);
              at += p.length;
            }
            out[file.name] = strFromU8(all);
            resolve();
          }
        };
        file.start();
      }),
    );
  };

  const reader = blob.stream().getReader();
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      unzip.push(new Uint8Array(0), true);
      break;
    }
    read += value.length;
    unzip.push(value);
    onProgress?.(blob.size ? read / blob.size : 0);
  }
  await Promise.all(pending);
  return out;
}

export function isZip(name: string, type?: string): boolean {
  return /\.zip$/i.test(name) || type === "application/zip" || type === "application/x-zip-compressed";
}
