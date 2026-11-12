// Saving a picture the studio allowed a visitor to keep. Cross-origin files cannot use the `download` attribute, so the file is
// fetched and saved from a blob; when the host refuses (no CORS) the file opens in a new tab instead. Never throws.
export function downloadName(label: string, url: string): string {
  const ext = /\.(webp|png|jpe?g|gif|mp4|webm)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase() ?? "webp";
  const base = label.normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "image";
  return `${base}.${ext}`;
}

export async function downloadUrl(url: string, filename: string, doc: Document = document): Promise<"saved" | "opened"> {
  try {
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error("bad status");
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = href;
    a.download = filename;
    a.rel = "noopener";
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return "saved";
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
    return "opened";
  }
}
