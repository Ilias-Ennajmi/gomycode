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
import { ReaderStateProvider, useReaderState } from "@/lib/hooks/useReaderState";
import { refreshFeeds } from "@/lib/hooks/useFeeds";
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
  const [refreshing, setRefreshing] = React.useState(false);

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
              toast.success(
                result.errors.length > 0
                  ? `Refreshed with ${result.errors.length} error(s)`
                  : "Refreshed — feeds are up to date"
              );
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

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background">
      <div className={cn("h-full w-full shrink-0 md:w-[240px]", mobilePane !== "sidebar" && "hidden md:block")}>
        <Sidebar
          onAddFeed={() => setAddFeedOpen(true)}
          onManageCategories={() => setManageCategoriesOpen(true)}
          onImportOpml={() => setImportOpmlOpen(true)}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
      </div>

      <div
        className={cn(
          "h-full w-full shrink-0 border-r md:w-[380px]",
          mobilePane !== "list" && "hidden md:block"
        )}
      >
        <ArticleList onAddFeed={() => setAddFeedOpen(true)} />
      </div>

      <div className={cn("h-full min-w-0 flex-1", mobilePane !== "reader" && "hidden md:block")}>
        <ArticleReader />
      </div>

      <AddFeedDialog open={addFeedOpen} onOpenChange={setAddFeedOpen} />
      <ManageCategoriesDialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <ImportOpmlDialog open={importOpmlOpen} onOpenChange={setImportOpmlOpen} />
    </div>
  );
}
