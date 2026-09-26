export const ARTICLE_FEED_INCLUDE = {
  feed: { select: { id: true, title: true, faviconUrl: true, categoryId: true, type: true } },
} as const;

/** Drops server-only fields (the embedding is ~256 floats) before sending to the client. */
export function serializeArticle<T extends { embedding?: number[] }>(article: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { embedding, ...rest } = article;
  return rest;
}
