export const ARTICLE_FEED_INCLUDE = {
  feed: { select: { id: true, title: true, faviconUrl: true, categoryId: true, type: true } },
} as const;

/**
 * Drops heavy server-only fields before sending to the client: the embedding
 * (~256 floats) and the cached full page, which the reader loads on its own.
 */
export function serializeArticle<T extends { embedding?: number[]; fullContent?: string | null }>(
  article: T
) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { embedding, fullContent, ...rest } = article;
  return rest;
}
