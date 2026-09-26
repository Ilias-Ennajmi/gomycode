"use client";

import * as React from "react";
import type { ArticleFilter, ArticleListParams, ArticleSort } from "@/lib/types";

export type ViewType = "foryou" | "all" | "today" | "saved" | "feed" | "category";

export interface ViewState {
  type: ViewType;
  id?: string;
  label: string;
}

export type MobilePane = "sidebar" | "list" | "reader" | "settings";

interface ReaderStateValue {
  view: ViewState;
  setView: (view: ViewState) => void;
  selectedArticleId: string | null;
  setSelectedArticleId: React.Dispatch<React.SetStateAction<string | null>>;
  filterTab: ArticleFilter;
  setFilterTab: React.Dispatch<React.SetStateAction<ArticleFilter>>;
  sort: ArticleSort;
  setSort: React.Dispatch<React.SetStateAction<ArticleSort>>;
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  mobilePane: MobilePane;
  setMobilePane: React.Dispatch<React.SetStateAction<MobilePane>>;
  listParams: ArticleListParams;
}

const DEFAULT_VIEW: ViewState = { type: "foryou", label: "For You" };

const ReaderStateContext = React.createContext<ReaderStateValue | null>(null);

export function ReaderStateProvider({ children }: { children: React.ReactNode }) {
  const [view, setViewState] = React.useState<ViewState>(DEFAULT_VIEW);
  const [selectedArticleId, setSelectedArticleId] = React.useState<string | null>(null);
  const [filterTab, setFilterTab] = React.useState<ArticleFilter>("all");
  const [sort, setSort] = React.useState<ArticleSort>("newest");
  const [search, setSearch] = React.useState("");
  const [mobilePane, setMobilePane] = React.useState<MobilePane>("list");

  const setView = React.useCallback((next: ViewState) => {
    setViewState(next);
    setSelectedArticleId(null);
    setFilterTab("all");
    setMobilePane("list");
  }, []);

  const listParams = React.useMemo<ArticleListParams>(() => {
    const params: ArticleListParams = {};
    if (view.type === "foryou") params.view = "foryou";
    if (view.type === "feed") params.feedId = view.id;
    if (view.type === "category") params.categoryId = view.id;
    if (view.type === "today") params.today = true;
    if (view.type === "saved") params.saved = true;
    if (filterTab === "unread") params.unread = true;
    if (filterTab === "saved") params.saved = true;
    if (search.trim()) params.search = search.trim();
    return params;
  }, [view, filterTab, search]);

  const value: ReaderStateValue = {
    view,
    setView,
    selectedArticleId,
    setSelectedArticleId,
    filterTab,
    setFilterTab,
    sort,
    setSort,
    search,
    setSearch,
    mobilePane,
    setMobilePane,
    listParams,
  };

  return <ReaderStateContext.Provider value={value}>{children}</ReaderStateContext.Provider>;
}

export function useReaderState() {
  const ctx = React.useContext(ReaderStateContext);
  if (!ctx) throw new Error("useReaderState must be used within ReaderStateProvider");
  return ctx;
}
