/** Normalizes a URL for "is this the same source?" comparisons. */
export function sourceKey(url: string) {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/\/+$/, "");
}
