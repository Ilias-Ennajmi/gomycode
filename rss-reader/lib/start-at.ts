// A link into a moment of an episode or video (?article=…&t=120): the reader starts there
// instead of where it was left. Taken once, by whichever player opens that article.

const pending = new Map<string, number>();

export function requestStartAt(articleId: string, seconds: number) {
  if (Number.isFinite(seconds) && seconds >= 0) pending.set(articleId, seconds);
}

export function takeStartAt(articleId: string): number | null {
  const seconds = pending.get(articleId);
  if (seconds === undefined) return null;
  pending.delete(articleId);
  return seconds;
}
