"use client";

import * as React from "react";
import type { ArticleFilter, ArticleListParams, ArticleSort, LaterTab } from "@/lib/types";
import { useHistorySync, type NavSnapshot } from "@/lib/hooks/useHistorySync";
import { rememberAppLaunch } from "@/lib/native";

export type ViewType =
  | "foryou"
  | "briefing"
  | "news"
  | "rss"
  | "youtube"
  | "newsletters"
  | "later"
  | "all"
  | "today"
  | "saved"
  | "feed"
  | "category";

export interface ViewState {
  type: ViewType;
  id?: string;
  label: string;
}

export type MobilePane = "sidebar" | "list" | "reader" | "settings";

/** The tabs that list one kind of source, and can be narrowed to a category. */
export type SourceTab = "rss" | "youtube" | "newsletters";
export const SOURCE_TAB_FEED_TYPE = {
  rss: "rss",
  youtube: "youtube",
  newsletters: "newsletter",
} as const;

export function isSourceTab(type: ViewType): type is SourceTab {
  return type === "rss" || type === "youtube" || type === "newsletters";
}

interface ReaderStateValue {
  view: ViewState;
  setView: (view: ViewState) => void;
  selectedArticleId: string | null;
  setSelectedArticleId: React.Dispatch<React.SetStateAction<string | null>>;
  filterTab: ArticleFilter;
  setFilterTab: React.Dispatch<React.SetStateAction<ArticleFilter>>;
  sort: ArticleSort;
  setSort: React.Dispatch<React.SetStateAction<ArticleSort>>;
  laterTab: LaterTab;
  setLaterTab: React.Dispatch<React.SetStateAction<LaterTab>>;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  mobilePane: MobilePane;
  setMobilePane: React.Dispatch<React.SetStateAction<MobilePane>>;
  /** Category chip per source tab: a category id, "none" for uncategorized, or null for all. */
  tabCategory: Record<SourceTab, string | null>;
  setTabCategory: (tab: SourceTab, categoryId: string | null) => void;
  listParams: ArticleListParams;
  /** Set when the app was opened to add a source (?add=1, e.g. the Android shortcut). */
  addRequested: boolean;
  clearAddRequest: () => void;
}

const DEFAULT_VIEW: ViewState = { type: "foryou", label: "For You" };

// Views that links, shortcuts and the Android app can open with ?view=.
const LINKABLE_VIEWS: Record<string, ViewState> = {
  foryou: DEFAULT_VIEW,
  news: { type: "news", label: "News" },
  briefing: { type: "briefing", label: "Today's briefing" },
  rss: { type: "rss", label: "RSS" },
  youtube: { type: "youtube", label: "YouTube" },
  newsletters: { type: "newsletters", label: "Newsletters" },
  later: { type: "later", label: "Later" },
  today: { type: "today", label: "Today" },
  all: { type: "all", label: "All articles" },
};

const ReaderStateContext = React.createContext<ReaderStateValue | null>(null);

export function ReaderStateProvider({ children }: { children: React.ReactNode }) {
  const [view, setViewState] = React.useState<ViewState>(DEFAULT_VIEW);
  const [selectedArticleId, setSelectedArticleId] = React.useState<string | null>(null);
  const [filterTab, setFilterTab] = React.useState<ArticleFilter>("all");
  const [sort, setSort] = React.useState<ArticleSort>("newest");
  const [laterTab, setLaterTab] = React.useState<LaterTab>("queue");
  const [search, setSearch] = React.useState("");
  const [mobilePane, setMobilePane] = React.useState<MobilePane>("list");
  // Kept across tab switches, so each tab reopens on the chip it was left on.
  const [tabCategory, setTabCategories] = React.useState<Record<SourceTab, string | null>>({
    rss: null,
    youtube: null,
    newsletters: null,
  });
  const setTabCategory = React.useCallback((tab: SourceTab, categoryId: string | null) => {
    setTabCategories((prev) => ({ ...prev, [tab]: categoryId }));
    setSelectedArticleId(null);
  }, []);

  const [addRequested, setAddRequested] = React.useState(false);
  const clearAddRequest = React.useCallback(() => setAddRequested(false), []);

  // Links into the app: ?view=news, ?article=<id>, ?add=1, and the Android app's
  // ?source=android&v=. Read once, then the address goes back to plain /reader.
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    rememberAppLaunch(params);
    const linked = LINKABLE_VIEWS[params.get("view") ?? ""];
    if (linked) setViewState(linked);
    const articleId = params.get("article");
    if (articleId) {
      setSelectedArticleId(articleId);
      setMobilePane("reader");
    }
    if (params.get("add") === "1") setAddRequested(true);
    if (params.toString())
      window.history.replaceState(window.history.state, "", window.location.pathname);
    setReady(true);
  }, []);

  const navSnapshot = React.useMemo<NavSnapshot>(
    () => ({ view, articleId: selectedArticleId, pane: mobilePane }),
    [view, selectedArticleId, mobilePane]
  );
  const applyNav = React.useCallback((nav: NavSnapshot) => {
    setViewState(nav.view);
    setSelectedArticleId(nav.articleId);
    setMobilePane(nav.pane);
  }, []);
  useHistorySync(navSnapshot, applyNav, ready);

  const setView = React.useCallback((next: ViewState) => {
    setViewState(next);
    setSelectedArticleId(null);
    setFilterTab("all");
    setMobilePane("list");
  }, []);

  const listParams = React.useMemo<ArticleListParams>(() => {
    const params: ArticleListParams = {};
    // The briefing opens stories from For You's pool.
    if (view.type === "foryou" || view.type === "briefing") params.view = "foryou";
    if (view.type === "news") params.news = view.id ?? "all";
    if (view.type === "rss") params.source = "rss";
    if (view.type === "youtube") params.source = "youtube";
    if (view.type === "newsletters") params.source = "newsletter";
    if (view.type === "later") params.later = laterTab;
    if (view.type === "feed") params.feedId = view.id;
    if (view.type === "category") params.categoryId = view.id;
    if (view.type === "today") params.today = true;
    if (view.type === "saved") params.saved = true;
    if (isSourceTab(view.type) && tabCategory[view.type]) {
      params.categoryId = tabCategory[view.type] ?? undefined;
    }
    if (filterTab === "unread") params.unread = true;
    if (filterTab === "saved") params.saved = true;
    if (search.trim()) params.search = search.trim();
    return params;
  }, [view, filterTab, search, laterTab, tabCategory]);

  const value: ReaderStateValue = {
    view,
    setView,
    selectedArticleId,
    setSelectedArticleId,
    filterTab,
    setFilterTab,
    sort,
    setSort,
    laterTab,
    setLaterTab,
    search,
    setSearch,
    mobilePane,
    setMobilePane,
    tabCategory,
    setTabCategory,
    listParams,
    addRequested,
    clearAddRequest,
  };

  return <ReaderStateContext.Provider value={value}>{children}</ReaderStateContext.Provider>;
}

export function useReaderState() {
  const ctx = React.useContext(ReaderStateContext);
  if (!ctx) throw new Error("useReaderState must be used within ReaderStateProvider");
  return ctx;
}
