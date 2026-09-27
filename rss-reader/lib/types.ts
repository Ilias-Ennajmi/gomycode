export type FeedType = "rss" | "youtube" | "newsletter" | "manual";

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
  language: string | null;
  /** The News section this source feeds, or null when it isn't a News source. */
  newsDesk: string | null;
  region: string | null;
  lastFetched: string | null;
  errorCount: number;
  unreadCount: number;
  /** Date of the newest article, or null before the first one. */
  lastPublished: string | null;
  createdAt: string;
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
  type?: FeedType;
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
  boosted?: boolean;
  isPromo?: boolean;
  archivedAt?: string | null;
  readProgress?: number;
  aiSummary?: string | null;
  topicId?: string | null;
  /** Present in For You when other sources cover the same story. */
  topic?: {
    id: string;
    sources: string[];
    related: ArticleSummary[];
  };
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

export type LaterTab = "queue" | "archive";
export type ArticleFilter = "all" | "unread" | "saved";
export type ArticleSort = "newest" | "oldest";

export interface ArticleListParams {
  view?: "foryou";
  /** News sources: "all" or one section id. */
  news?: string;
  source?: FeedType;
  later?: LaterTab;
  feedId?: string;
  categoryId?: string;
  saved?: boolean;
  today?: boolean;
  unread?: boolean;
  search?: string;
  sort?: ArticleSort;
}
