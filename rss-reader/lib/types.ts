export type FeedType = "rss" | "youtube" | "newsletter";

export interface FeedSummary {
  id: string;
  type: FeedType;
  muted: boolean;
  title: string;
  url: string;
  siteUrl: string | null;
  description: string | null;
  faviconUrl: string | null;
  coverUrl: string | null;
  categoryId: string | null;
  lastFetched: string | null;
  errorCount: number;
  unreadCount: number;
}

export interface CategoryFeedSummary {
  id: string;
  type: FeedType;
  muted: boolean;
  title: string;
  url: string;
  faviconUrl: string | null;
  errorCount: number;
  unreadCount: number;
}

export interface CategorySummary {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  order: number;
  feeds: CategoryFeedSummary[];
  unreadCount: number;
}

export interface ArticleFeedRef {
  id: string;
  title: string;
  faviconUrl: string | null;
  categoryId: string | null;
}

export interface ArticleSummary {
  id: string;
  feedId: string;
  feed: ArticleFeedRef;
  title: string;
  link: string;
  summary: string | null;
  content: string | null;
  imageUrl: string | null;
  author: string | null;
  publishedAt: string;
  isRead: boolean;
  isSaved: boolean;
  isVideo: boolean;
  readAt: string | null;
  savedAt: string | null;
  createdAt: string;
}

export interface FilterRuleSummary {
  id: string;
  action: "hide" | "boost";
  match: "keyword" | "feed";
  value: string;
}

export type ArticleFilter ="all" | "unread" | "saved";
export type ArticleSort = "newest" | "oldest";

export interface ArticleListParams {
  feedId?: string;
  categoryId?: string;
  saved?: boolean;
  today?: boolean;
  unread?: boolean;
  search?: string;
  sort?: ArticleSort;
}
