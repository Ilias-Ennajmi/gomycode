"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ArticleList } from "@/components/articles/ArticleList";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { useAppEvent } from "@/lib/app-events";
import { X } from "lucide-react";
import { ReaderStateProvider, useReaderState } from "@/lib/hooks/useReaderState";
import { useBackToClose } from "@/lib/hooks/useHistorySync";
import { AppUpdateBanner } from "@/components/layout/AppUpdateBanner";
import { NotificationPrompt } from "@/components/layout/NotificationPrompt";
import { OfflineSupport } from "@/components/layout/OfflineSupport";
import { ChromeCollapse } from "@/components/layout/ChromeCollapse";
import { showChrome } from "@/lib/hooks/useChrome";
import { useReaderPrefs } from "@/lib/hooks/useReaderPrefs";
import { AudioProvider } from "@/components/audio/AudioProvider";
import { NowPlayingBar } from "@/components/audio/NowPlayingBar";
import { NowPlayingSheet } from "@/components/audio/NowPlayingSheet";
import { WhatsNew } from "@/components/layout/WhatsNew";
import { ErrorBoundary } from "@/components/layout/ErrorBoundary";
import { refreshFeeds, refreshToastMessage, useAutoRefresh, useFeeds } from "@/lib/hooks/useFeeds";
import { useSWRConfig } from "swr";
import type { DiscoverKind } from "@/lib/discover/catalog";

// Dialogs and the less-used screens load right after the first paint instead of with the
// page, so the list shows up sooner.
const DiscoverDialog = dynamic(
  () => import("@/components/discover/DiscoverDialog").then((m) => m.DiscoverDialog),
  { ssr: false }
);
const ManageCategoriesDialog = dynamic(
  () => import("@/components/dialogs/ManageCategoriesDialog").then((m) => m.ManageCategoriesDialog),
  { ssr: false }
);
const KeyboardShortcutsDialog = dynamic(
  () =>
    import("@/components/dialogs/KeyboardShortcutsDialog").then((m) => m.KeyboardShortcutsDialog),
  { ssr: false }
);
const ImportOpmlDialog = dynamic(
  () => import("@/components/dialogs/ImportOPMLDialog").then((m) => m.ImportOpmlDialog),
  { ssr: false }
);
const ContentFiltersDialog = dynamic(
  () => import("@/components/dialogs/ContentFiltersDialog").then((m) => m.ContentFiltersDialog),
  { ssr: false }
);
const SaveLinkDialog = dynamic(
  () => import("@/components/dialogs/SaveLinkDialog").then((m) => m.SaveLinkDialog),
  { ssr: false }
);
const EmailNewsletterDialog = dynamic(
  () => import("@/components/dialogs/EmailNewsletterDialog").then((m) => m.EmailNewsletterDialog),
  { ssr: false }
);
const CommandPalette = dynamic(
  () => import("@/components/dialogs/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false }
);
const EpisodeSearch = dynamic(
  () => import("@/components/discover/EpisodeSearch").then((m) => m.EpisodeSearch),
  { ssr: false }
);
// The reader is most of the page's code and only needed once an article opens.
const ArticleReader = dynamic(
  () => import("@/components/articles/ArticleReader").then((m) => m.ArticleReader),
  { ssr: false, loading: () => <div className="h-full" /> }
);
const StarterPacks = dynamic(
  () => import("@/components/onboarding/StarterPacks").then((m) => m.StarterPacks),
  { ssr: false }
);
const SettingsPanel = dynamic(
  () => import("@/components/layout/SettingsPanel").then((m) => m.SettingsPanel),
  { ssr: false }
);
const SourcesManager = dynamic(
  () => import("@/components/sources/SourcesManager").then((m) => m.SourcesManager),
  { ssr: false }
);
const NewsView = dynamic(() => import("@/components/news/NewsView").then((m) => m.NewsView), {
  ssr: false,
});
const TodayView = dynamic(() => import("@/components/today/TodayView").then((m) => m.TodayView), {
  ssr: false,
});
const RecapView = dynamic(() => import("@/components/today/RecapView").then((m) => m.RecapView), {
  ssr: false,
});
const ReviewView = dynamic(
  () => import("@/components/review/ReviewView").then((m) => m.ReviewView),
  { ssr: false }
);
const AskView = dynamic(() => import("@/components/ask/AskView").then((m) => m.AskView), {
  ssr: false,
});
const StatsView = dynamic(() => import("@/components/stats/StatsView").then((m) => m.StatsView), {
  ssr: false,
});
const NewsSourcesDialog = dynamic(
  () => import("@/components/news/NewsSourcesDialog").then((m) => m.NewsSourcesDialog),
  { ssr: false }
);

export function AppShell() {
  return (
    <ReaderStateProvider>
      <AudioProvider>
        <AppShellInner />
      </AudioProvider>
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
    search,
  } = useReaderState();
  // Full-width pages with the reader as a panel on top: the News front page, the briefing
  // and the weekly recap.
  const newsFront = view.type === "news" && !view.id;
  // A search shows its results as a list, whatever page it started from.
  const fullPage =
    !search.trim() &&
    (newsFront ||
      view.type === "briefing" ||
      view.type === "recap" ||
      view.type === "review" ||
      view.type === "ask" ||
      view.type === "stats");
  const [newsSources, setNewsSources] = React.useState<{ open: boolean; setup: boolean }>({
    open: false,
    setup: false,
  });
  const { mutate: globalMutate } = useSWRConfig();

  const [discoverOpen, setDiscoverOpen] = React.useState(false);
  const [discoverKind, setDiscoverKind] = React.useState<DiscoverKind>("all");
  const [manageCategoriesOpen, setManageCategoriesOpen] = React.useState(false);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);
  const [sourcesAttention, setSourcesAttention] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [importOpmlOpen, setImportOpmlOpen] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [saveLinkOpen, setSaveLinkOpen] = React.useState(false);
  const [emailNewsletterOpen, setEmailNewsletterOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  useAppEvent("email-newsletter", () => {
    setDiscoverOpen(false);
    setEmailNewsletterOpen(true);
  });
  useAppEvent("content-filters", () => setFiltersOpen(true));
  const [episodeSearchOpen, setEpisodeSearchOpen] = React.useState(false);
  useAppEvent("find-episodes", () => setEpisodeSearchOpen(true));
  useAppEvent("sources-unused", () => {
    setSourcesChannel("unused");
    setSourcesOpen(true);
  });
  const [sourcesChannel, setSourcesChannel] = React.useState<"unused" | null>(null);

  // Android back (and browser back) closes the open dialog first.
  useBackToClose(discoverOpen, () => setDiscoverOpen(false));
  useBackToClose(saveLinkOpen, () => setSaveLinkOpen(false));
  useBackToClose(emailNewsletterOpen, () => setEmailNewsletterOpen(false));
  useBackToClose(sourcesOpen, () => setSourcesOpen(false));
  useBackToClose(newsSources.open, () => setNewsSources((prev) => ({ ...prev, open: false })));
  useBackToClose(manageCategoriesOpen, () => setManageCategoriesOpen(false));
  useBackToClose(shortcutsOpen, () => setShortcutsOpen(false));
  useBackToClose(importOpmlOpen, () => setImportOpmlOpen(false));
  useBackToClose(filtersOpen, () => setFiltersOpen(false));
  useBackToClose(paletteOpen, () => setPaletteOpen(false));

  // The "Add source" shortcut on the app icon.
  React.useEffect(() => {
    if (!addRequested) return;
    clearAddRequest();
    setDiscoverKind("all");
    setDiscoverOpen(true);
  }, [addRequested, clearAddRequest]);

  // With nothing followed yet, start with the starter packs (once per visit).
  const { feeds, isLoading: feedsLoading } = useFeeds();
  const [packsOpen, setPacksOpen] = React.useState(false);
  React.useEffect(() => {
    if (feedsLoading || feeds.length > 0) return;
    try {
      if (sessionStorage.getItem("discover-shown")) return;
      sessionStorage.setItem("discover-shown", "1");
    } catch {
      // Storage unavailable: still show it.
    }
    setPacksOpen(true);
  }, [feedsLoading, feeds.length]);

  useAutoRefresh((result) => {
    globalMutate(() => true, undefined, { revalidate: true });
    if (result.newArticles > 0) toast.success(refreshToastMessage(result));
  });

  const refreshingRef = React.useRef(false);
  const refreshNow = React.useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    refreshFeeds()
      .then((result) => {
        globalMutate(() => true, undefined, { revalidate: true });
        toast.success(refreshToastMessage(result));
      })
      .catch((error) =>
        toast.error(error instanceof Error ? error.message : "Could not refresh feeds")
      )
      .finally(() => {
        refreshingRef.current = false;
      });
  }, [globalMutate]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // ⌘K / Ctrl+K works from anywhere, even while typing.
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
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
        refreshNow();
      } else if (event.key === "Escape") {
        setSelectedArticleId(null);
        setMobilePane((prev) => (prev === "reader" ? "list" : prev));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [refreshNow, setMobilePane, setSelectedArticleId]);

  const dialogActions = {
    onAddFeed: (kind: DiscoverKind = "all") => {
      setDiscoverKind(kind);
      setDiscoverOpen(true);
    },
    // Buttons pass their click event: only a literal true opens on "Needs attention".
    onManageSources: (attention?: unknown) => {
      setSourcesAttention(attention === true);
      setSourcesOpen(true);
    },
    onManageCategories: () => setManageCategoriesOpen(true),
    onContentFilters: () => setFiltersOpen(true),
    onImportOpml: () => setImportOpmlOpen(true),
    onShowShortcuts: () => setShortcutsOpen(true),
  };

  // Stable, so the palette's command list isn't rebuilt on every render.
  const openDiscover = React.useCallback(() => dialogActions.onAddFeed("all"), []); // eslint-disable-line react-hooks/exhaustive-deps
  const openSaveLink = React.useCallback(() => setSaveLinkOpen(true), []);
  const openEmailNewsletter = React.useCallback(() => setEmailNewsletterOpen(true), []);
  const openSources = React.useCallback(() => {
    setSourcesAttention(false);
    setSourcesOpen(true);
  }, []);
  const openShortcuts = React.useCallback(() => setShortcutsOpen(true), []);

  const hideTopBarOnPhone = mobilePane === "reader";
  // Focus mode: with an article open, only the article (desktop loses the sidebar and list).
  const { prefs: readerPrefs } = useReaderPrefs();
  const focus = readerPrefs.focus && Boolean(selectedArticleId);
  // Coming back to a list (or another pane), the bars are there.
  React.useEffect(() => showChrome(), [mobilePane, view]);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <AppUpdateBanner />
      <OfflineSupport />
      <ChromeCollapse className={cn("md:hidden", hideTopBarOnPhone && "hidden")}>
        <TopBar
          phone
          onSaveLink={() => setSaveLinkOpen(true)}
          onAddFeed={dialogActions.onAddFeed}
          onManageNews={() => setNewsSources({ open: true, setup: false })}
        />
      </ChromeCollapse>
      <div className="flex min-h-0 flex-1">
        <div
          className={cn(
            "h-full w-full shrink-0 md:w-[260px]",
            mobilePane !== "sidebar" && "hidden md:block",
            focus && "md:hidden"
          )}
        >
          <Sidebar {...dialogActions} />
        </div>

        <div
          role="main"
          className={cn(
            "min-w-0 flex-1 flex-col",
            mobilePane === "sidebar" || mobilePane === "settings" ? "hidden md:flex" : "flex"
          )}
        >
          <TopBar
            landmark={false}
            className={cn("hidden md:block", focus && "md:hidden")}
            onSaveLink={() => setSaveLinkOpen(true)}
            onAddFeed={dialogActions.onAddFeed}
            onManageNews={() => setNewsSources({ open: true, setup: false })}
          />
          {!hideTopBarOnPhone && feeds.length > 0 && <NotificationPrompt />}
          {fullPage ? (
            <div className="relative flex min-h-0 flex-1">
              <div
                className={cn(
                  "h-full min-w-0 flex-1",
                  mobilePane === "reader" && "hidden md:block"
                )}
              >
                <ErrorBoundary name={view.type}>
                  {newsFront ? (
                    <NewsView
                      onManageSources={(setup = false) => setNewsSources({ open: true, setup })}
                    />
                  ) : view.type === "recap" ? (
                    <RecapView />
                  ) : view.type === "review" ? (
                    <ReviewView />
                  ) : view.type === "ask" ? (
                    <AskView />
                  ) : view.type === "stats" ? (
                    <StatsView />
                  ) : (
                    <TodayView />
                  )}
                </ErrorBoundary>
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
                  <ErrorBoundary name="reader">
                    <ArticleReader />
                  </ErrorBoundary>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              <div
                className={cn(
                  "h-full w-full shrink-0 md:w-[420px] md:border-r",
                  mobilePane !== "list" && "hidden md:block",
                  focus && "md:hidden"
                )}
              >
                <ErrorBoundary name="list">
                  <ArticleList
                    onAddFeed={dialogActions.onAddFeed}
                    onSaveLink={() => setSaveLinkOpen(true)}
                  />
                </ErrorBoundary>
              </div>

              <div
                className={cn(
                  "h-full min-w-0 flex-1",
                  mobilePane === "reader" ? "animate-pane-in md:animate-none" : "hidden md:block"
                )}
              >
                <ErrorBoundary name="reader">
                  <ArticleReader />
                </ErrorBoundary>
              </div>
            </div>
          )}
        </div>

        {mobilePane === "settings" && (
          <div role="main" className="h-full w-full md:hidden">
            <SettingsPanel {...dialogActions} />
          </div>
        )}
      </div>
      <NowPlayingBar />
      <BottomNav />
      <NowPlayingSheet />
      <WhatsNew />

      <SaveLinkDialog open={saveLinkOpen} onOpenChange={setSaveLinkOpen} />
      {packsOpen && <StarterPacks open firstRun onOpenChange={setPacksOpen} />}
      {episodeSearchOpen && <EpisodeSearch open onOpenChange={setEpisodeSearchOpen} />}
      <EmailNewsletterDialog open={emailNewsletterOpen} onOpenChange={setEmailNewsletterOpen} />
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
        attention={sourcesAttention}
        channel={sourcesChannel}
        onChannelShown={() => setSourcesChannel(null)}
      />
      <ManageCategoriesDialog open={manageCategoriesOpen} onOpenChange={setManageCategoriesOpen} />
      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onAddFeed={openDiscover}
        onSaveLink={openSaveLink}
        onEmailNewsletter={openEmailNewsletter}
        onManageSources={openSources}
        onShowShortcuts={openShortcuts}
        onRefresh={refreshNow}
      />
      <ImportOpmlDialog open={importOpmlOpen} onOpenChange={setImportOpmlOpen} />
      <ContentFiltersDialog open={filtersOpen} onOpenChange={setFiltersOpen} />
    </div>
  );
}
