"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ArticleList } from "@/components/articles/ArticleList";
import { ArticleReader } from "@/components/articles/ArticleReader";
import { DiscoverDialog } from "@/components/discover/DiscoverDialog";
import { ManageCategoriesDialog } from "@/components/dialogs/ManageCategoriesDialog";
import { KeyboardShortcutsDialog } from "@/components/dialogs/KeyboardShortcutsDialog";
import { ImportOpmlDialog } from "@/components/dialogs/ImportOPMLDialog";
import { ContentFiltersDialog } from "@/components/dialogs/ContentFiltersDialog";
import { TopBar } from "@/components/layout/TopBar";
import { SaveLinkDialog } from "@/components/dialogs/SaveLinkDialog";
import { SettingsPanel } from "@/components/layout/SettingsPanel";
import { SourcesManager } from "@/components/sources/SourcesManager";
import { NewsView } from "@/components/news/NewsView";
import { TodayView } from "@/components/today/TodayView";
import { NewsSourcesDialog } from "@/components/news/NewsSourcesDialog";
import { X } from "lucide-react";
import { ReaderStateProvider, useReaderState } from "@/lib/hooks/useReaderState";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { AppUpdateBanner } from "@/components/layout/AppUpdateBanner";
import { refreshFeeds, refreshToastMessage, useAutoRefresh, useFeeds } from "@/lib/hooks/useFeeds";
import { useSWRConfig } from "swr";
import type { DiscoverKind } from "@/lib/discover/catalog";

export function AppShell() {
  return (
    <ReaderStateProvider>
      <AppShellInner />
    </ReaderStateProvider>
  );
}

function AppShellInner() {
  const {
    mobilePane,
    setMobilePane,
    selectedArticleId,
    setSelectedArticleId,
    view,
    addRequested,
    clearAddRequest,
  } = useReaderState();
  // Full-width pages with the reader as a panel on top: the News front page and the briefing.
  const newsFront = view.type === "news" && !view.id;
  const fullPage = newsFront || view.type === "briefing";
  const [newsSources, setNewsSources] = React.useState<{ open: boolean; setup: boolean }>({
    open: false,
    setup: false,
  });
  const { mutate: globalMutate } = useSWRConfig();

  const [discoverOpen, setDiscoverOpen] = React.useState(false);
  const [discoverKind, setDiscoverKind] = React.useState<DiscoverKind>("all");
  const [manageCategoriesOpen, setManageCategoriesOpen] = React.useState(false);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [importOpmlOpen, setImportOpmlOpen] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [saveLinkOpen, setSaveLinkOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  // Android back (and browser back) closes the open dialog first.
  useBackToClose(discoverOpen, () => setDiscoverOpen(false));
  useBackToClose(saveLinkOpen, () => setSaveLinkOpen(false));
  useBackToClose(sourcesOpen, () => setSourcesOpen(false));
  useBackToClose(newsSources.open, () => setNewsSources((prev) => ({ ...prev, open: false })));
  useBackToClose(manageCategoriesOpen, () => setManageCategoriesOpen(false));
  useBackToClose(shortcutsOpen, () => setShortcutsOpen(false));
  useBackToClose(importOpmlOpen, () => setImportOpmlOpen(false));
  useBackToClose(filtersOpen, () => setFiltersOpen(false));

  // The "Add source" shortcut on the app icon.
  React.useEffect(() => {
    if (!addRequested) return;
    clearAddRequest();
    setDiscoverKind("all");
    setDiscoverOpen(true);
  }, [addRequested, clearAddRequest]);

  // With nothing followed yet, start in Discover (once per visit).
  const { feeds, isLoading: feedsLoading } = useFeeds();
  React.useEffect(() => {
    if (feedsLoading || feeds.length > 0) return;
    try {
      if (sessionStorage.getItem("discover-shown")) return;
      sessionStorage.setItem("discover-shown", "1");
    } catch {
      // Storage unavailable: still show it.
    }
    setDiscoverKind("all");
    setDiscoverOpen(true);
  }, [feedsLoading, feeds.length]);

  useAutoRefresh((result) => {
    globalMutate(() => true, undefined, { revalidate: true });
    if (result.newArticles > 0) toast.success(refreshToastMessage(result));
  });

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
      // Keys pressed inside a menu or dialog belong to it (e.g. Escape closes
      // the menu, not the article behind it).
      if (target instanceof HTMLElement && target.closest('[role="dialog"], [role="menu"]')) return;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) {
          if (event.key === "Escape") target.blur();
          return;
        }
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        document.getElementById("sidebar-search")?.focus();
      } else if (event.key === "?") {
        setShortcutsOpen((v) => !v);
      } else if (event.key.toLowerCase() === "r") {
        if (!refreshing) {
          setRefreshing(true);
          refreshFeeds()
            .then((result) => {
              globalMutate(() => true, undefined, { revalidate: true });
              toast.success(refreshToastMessage(result));
            })
            .catch((error) =>
              toast.error(error instanceof Error ? error.message : "Could not refresh feeds")
            )
            .finally(() => setRefreshing(false));
        }
      } else if (event.key === "Escape") {
        setSelectedArticleId(null);
        setMobilePane((prev) => (prev === "reader" ? "list" : prev));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshing]);

  const dialogActions = {
    onAddFeed: (kind: DiscoverKind = "all") => {
      setDiscoverKind(kind);
      setDiscoverOpen(true);
    },
    onManageSources: () => setSourcesOpen(true),
    onManageCategories: () => setManageCategoriesOpen(true),
    onContentFilters: () => setFiltersOpen(true),
    onImportOpml: () => setImportOpmlOpen(true),
    onShowShortcuts: () => setShortcutsOpen(true),
  };

  const hideTopBarOnPhone = mobilePane === "reader";

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <AppUpdateBanner />
      <TopBar
        className={cn("md:hidden", hideTopBarOnPhone && "hidden")}
        onSaveLink={() => setSaveLinkOpen(true)}
        onAddFeed={dialogActions.onAddFeed}
        onManageNews={() => setNewsSources({ open: true, setup: false })}
      />
      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "h-full w-full shrink-0 md:w-[260px]",
            mobilePane !== "sidebar" && "hidden md:block"
          )}
        >
          <Sidebar {...dialogActions} />
        </div>

        <div
          className={cn(
            "min-w-0 flex-1 flex-col",
            mobilePane === "sidebar" || mobilePane === "settings" ? "hidden md:flex" : "flex"
          )}
        >
          <TopBar
            className="hidden md:block"
            onSaveLink={() => setSaveLinkOpen(true)}
            onAddFeed={dialogActions.onAddFeed}
            onManageNews={() => setNewsSources({ open: true, setup: false })}
          />
          {fullPage ? (
            <div className="relative flex min-h-0 flex-1">
              <div
                className={cn(
                  "h-full min-w-0 flex-1",
                  mobilePane === "reader" && "hidden md:block"
                )}
              >
                {newsFront ? (
                  <NewsView
                    onManageSources={(setup = false) => setNewsSources({ open: true, setup })}
                  />
                ) : (
                  <TodayView />
                )}
              </div>
              {selectedArticleId && (
                <div
                  className={cn(
                    "h-full min-w-0 bg-background",
                    // Phones: full screen. Desktop: a panel over the front page.
                    mobilePane === "reader"
                      ? "w-full animate-pane-in md:animate-none"
                      : "hidden md:block",
                    "md:absolute md:inset-y-0 md:right-0 md:z-20 md:w-[min(760px,62%)] md:border-l md:shadow-2xl"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedArticleId(null)}
                    className="absolute left-3 top-3 z-10 hidden h-9 w-9 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow ring-1 ring-border backdrop-blur hover:text-foreground md:flex"
                    aria-label="Close article"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <ArticleReader />
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <div
                className={cn(
                  "h-full w-full shrink-0 md:w-[420px] md:border-r",
                  mobilePane !== "list" && "hidden md:block"
                )}
              >
                <ArticleList
                  onAddFeed={dialogActions.onAddFeed}
                  onSaveLink={() => setSaveLinkOpen(true)}
                />
              </div>

              <div
                className={cn(
                  "h-full min-w-0 flex-1",
                  mobilePane === "reader" ? "animate-pane-in md:animate-none" : "hidden md:block"
                )}
              >
                <ArticleReader />
              </div>
            </div>
          )}
        </div>

        {mobilePane === "settings" && (
          <div className="h-full w-full md:hidden">
            <SettingsPanel {...dialogActions} />
          </div>
        )}
      </div>

      <SaveLinkDialog open={saveLinkOpen} onOpenChange={setSaveLinkOpen} />
      <DiscoverDialog
        open={discoverOpen}
        onOpenChange={setDiscoverOpen}
        initialKind={discoverKind}
      />
      <NewsSourcesDialog
        open={newsSources.open}
        setup={newsSources.setup}
        onOpenChange={(open) => setNewsSources((prev) => ({ ...prev, open }))}
      />
      <SourcesManager
        open={sourcesOpen}
        onOpenChange={setSourcesOpen}
        onAddFeed={dialogActions.onAddFeed}
      />
      <ManageCategoriesDialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <ImportOpmlDialog open={importOpmlOpen} onOpenChange={setImportOpmlOpen} />
      <ContentFiltersDialog open={filtersOpen} onOpenChange={setFiltersOpen} />
    </div>
  );
}
