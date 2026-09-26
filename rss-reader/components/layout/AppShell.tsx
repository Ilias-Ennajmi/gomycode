"use client";

import * as React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ArticleList } from "@/components/articles/ArticleList";
import { ArticleReader } from "@/components/articles/ArticleReader";
import { AddFeedDialog } from "@/components/dialogs/AddFeedDialog";
import { ManageCategoriesDialog } from "@/components/dialogs/ManageCategoriesDialog";
import { KeyboardShortcutsDialog } from "@/components/dialogs/KeyboardShortcutsDialog";
import { ImportOpmlDialog } from "@/components/dialogs/ImportOPMLDialog";
import { ContentFiltersDialog } from "@/components/dialogs/ContentFiltersDialog";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { SettingsPanel } from "@/components/layout/SettingsPanel";
import { ReaderStateProvider, useReaderState } from "@/lib/hooks/useReaderState";
import { refreshFeeds, refreshToastMessage, useAutoRefresh } from "@/lib/hooks/useFeeds";
import { useSWRConfig } from "swr";

export function AppShell() {
  return (
    <ReaderStateProvider>
      <AppShellInner />
    </ReaderStateProvider>
  );
}

function AppShellInner() {
  const { mobilePane, setMobilePane, setSelectedArticleId } = useReaderState();
  const { mutate: globalMutate } = useSWRConfig();

  const [addFeedOpen, setAddFeedOpen] = React.useState(false);
  const [manageCategoriesOpen, setManageCategoriesOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [importOpmlOpen, setImportOpmlOpen] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  useAutoRefresh((result) => {
    globalMutate(() => true, undefined, { revalidate: true });
    if (result.newArticles > 0) toast.success(refreshToastMessage(result));
  });

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target;
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
            .catch((error) => toast.error(error instanceof Error ? error.message : "Could not refresh feeds"))
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
    onAddFeed: () => setAddFeedOpen(true),
    onManageCategories: () => setManageCategoriesOpen(true),
    onContentFilters: () => setFiltersOpen(true),
    onImportOpml: () => setImportOpmlOpen(true),
    onShowShortcuts: () => setShortcutsOpen(true),
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1">
        <div className={cn("h-full w-full shrink-0 md:w-[260px]", mobilePane !== "sidebar" && "hidden md:block")}>
          <Sidebar {...dialogActions} />
        </div>

        <div
          className={cn(
            "h-full w-full shrink-0 md:w-[400px] md:border-r",
            mobilePane !== "list" && "hidden md:block"
          )}
        >
          <ArticleList onAddFeed={dialogActions.onAddFeed} />
        </div>

        <div
          className={cn(
            "h-full min-w-0 flex-1",
            mobilePane === "reader" ? "animate-pane-in md:animate-none" : "hidden md:block"
          )}
        >
          <ArticleReader />
        </div>

        {mobilePane === "settings" && (
          <div className="h-full w-full md:hidden">
            <SettingsPanel {...dialogActions} />
          </div>
        )}
      </div>

      {mobilePane !== "reader" && <BottomTabBar />}

      <AddFeedDialog open={addFeedOpen} onOpenChange={setAddFeedOpen} />
      <ManageCategoriesDialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <ImportOpmlDialog open={importOpmlOpen} onOpenChange={setImportOpmlOpen} />
      <ContentFiltersDialog open={filtersOpen} onOpenChange={setFiltersOpen} />
    </div>
  );
}
