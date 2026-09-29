"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTheme } from "next-themes";
import {
  BookmarkPlus,
  CalendarDays,
  CalendarRange,
  Clock,
  Compass,
  Highlighter,
  Inbox,
  Keyboard,
  Mail,
  Moon,
  Newspaper,
  Plus,
  RefreshCw,
  Rss,
  Search,
  Settings2,
  Sparkles,
  Sun,
  MonitorPlay,
  AlarmClock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeeds, useCategories } from "@/lib/hooks/useFeeds";
import { useReaderState, type ViewState } from "@/lib/hooks/useReaderState";
import type { LaterTab } from "@/lib/types";

interface Command {
  id: string;
  group: string;
  label: string;
  icon: React.ReactNode;
  keywords?: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddFeed: () => void;
  onSaveLink: () => void;
  onEmailNewsletter: () => void;
  onManageSources: () => void;
  onShowShortcuts: () => void;
  onRefresh: () => void;
}

const ICON = "h-4 w-4";

function foldText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** ⌘K / Ctrl+K: jump anywhere, run any action, or search, from the keyboard. */
export function CommandPalette({
  open,
  onOpenChange,
  onAddFeed,
  onSaveLink,
  onEmailNewsletter,
  onManageSources,
  onShowShortcuts,
  onRefresh,
}: CommandPaletteProps) {
  const { setView, setLaterTab, setSearch, setSelectedArticleId, setMobilePane } = useReaderState();
  const { feeds } = useFeeds();
  const { categories } = useCategories();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const commands = React.useMemo<Command[]>(() => {
    const go = (view: ViewState, laterTab?: LaterTab) => () => {
      setSearch("");
      setView(view);
      if (laterTab) setLaterTab(laterTab);
    };
    const pages: Command[] = [
      {
        id: "foryou",
        label: "For You",
        icon: <Sparkles className={ICON} />,
        run: go({ type: "foryou", label: "For You" }),
        keywords: "home feed",
      },
      {
        id: "news",
        label: "News",
        icon: <Newspaper className={ICON} />,
        run: go({ type: "news", label: "News" }),
      },
      {
        id: "briefing",
        label: "Today's briefing",
        icon: <CalendarDays className={ICON} />,
        run: go({ type: "briefing", label: "Today's briefing" }),
        keywords: "morning digest",
      },
      {
        id: "rss",
        label: "RSS",
        icon: <Rss className={ICON} />,
        run: go({ type: "rss", label: "RSS" }),
        keywords: "blogs",
      },
      {
        id: "youtube",
        label: "YouTube",
        icon: <MonitorPlay className={ICON} />,
        run: go({ type: "youtube", label: "YouTube" }),
        keywords: "videos",
      },
      {
        id: "newsletters",
        label: "Newsletters",
        icon: <Mail className={ICON} />,
        run: go({ type: "newsletters", label: "Newsletters" }),
        keywords: "substack email",
      },
      {
        id: "later",
        label: "Later",
        icon: <Clock className={ICON} />,
        run: go({ type: "later", label: "Later" }, "queue"),
        keywords: "saved read later queue",
      },
      {
        id: "snoozed",
        label: "Snoozed",
        icon: <AlarmClock className={ICON} />,
        run: go({ type: "later", label: "Later" }, "snoozed"),
      },
      {
        id: "highlights",
        label: "Highlights",
        icon: <Highlighter className={ICON} />,
        run: go({ type: "later", label: "Later" }, "highlights"),
        keywords: "notes quotes",
      },
      {
        id: "recap",
        label: "Weekly recap",
        icon: <CalendarRange className={ICON} />,
        run: go({ type: "recap", label: "Weekly recap" }),
        keywords: "week stats",
      },
      {
        id: "today",
        label: "Today",
        icon: <CalendarDays className={ICON} />,
        run: go({ type: "today", label: "Today" }),
      },
      {
        id: "all",
        label: "All articles",
        icon: <Inbox className={ICON} />,
        run: go({ type: "all", label: "All Articles" }),
      },
    ].map((command) => ({ ...command, group: "Go to" }));

    const dark = resolvedTheme === "dark";
    const actions: Command[] = [
      {
        id: "add",
        label: "Add a source",
        icon: <Plus className={ICON} />,
        run: onAddFeed,
        keywords: "follow subscribe discover feed channel",
      },
      {
        id: "save",
        label: "Save a link",
        icon: <BookmarkPlus className={ICON} />,
        run: onSaveLink,
        keywords: "url read later",
      },
      {
        id: "email",
        label: "Add an email newsletter",
        icon: <Mail className={ICON} />,
        run: onEmailNewsletter,
        keywords: "inbox address",
      },
      {
        id: "refresh",
        label: "Refresh feeds",
        icon: <RefreshCw className={ICON} />,
        run: onRefresh,
        hint: "R",
      },
      {
        id: "sources",
        label: "Manage sources",
        icon: <Settings2 className={ICON} />,
        run: onManageSources,
        keywords: "feeds unfollow categories",
      },
      {
        id: "theme",
        label: dark ? "Light theme" : "Dark theme",
        icon: dark ? <Sun className={ICON} /> : <Moon className={ICON} />,
        run: () => setTheme(dark ? "light" : "dark"),
        keywords: "appearance mode",
      },
      {
        id: "shortcuts",
        label: "Keyboard shortcuts",
        icon: <Keyboard className={ICON} />,
        run: onShowShortcuts,
        hint: "?",
      },
    ].map((command) => ({ ...command, group: "Actions" }));

    const places: Command[] = [
      ...categories.map((category) => ({
        id: `category:${category.id}`,
        group: "Sources",
        label: category.name,
        icon: <Compass className={ICON} />,
        keywords: "category",
        run: go({ type: "category", id: category.id, label: category.name }),
      })),
      ...feeds.map((feed) => ({
        id: `feed:${feed.id}`,
        group: "Sources",
        label: feed.title,
        icon: feed.faviconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={feed.faviconUrl} alt="" className="h-4 w-4 rounded-sm object-cover" />
        ) : feed.type === "youtube" ? (
          <MonitorPlay className={ICON} />
        ) : feed.type === "newsletter" ? (
          <Mail className={ICON} />
        ) : (
          <Rss className={ICON} />
        ),
        keywords: feed.type,
        run: go({ type: "feed", id: feed.id, label: feed.title }),
      })),
    ];
    return [...pages, ...actions, ...places];
  }, [
    categories,
    feeds,
    resolvedTheme,
    setTheme,
    setView,
    setLaterTab,
    setSearch,
    onAddFeed,
    onSaveLink,
    onEmailNewsletter,
    onRefresh,
    onManageSources,
    onShowShortcuts,
  ]);

  const results = React.useMemo<Command[]>(() => {
    const q = query.trim();
    if (!q) return commands.filter((command) => command.group !== "Sources");
    const words = foldText(q).split(/\s+/).filter(Boolean);
    const matches = commands
      .map((command) => {
        const label = foldText(command.label);
        const haystack = `${label} ${foldText(command.keywords ?? "")}`;
        if (!words.every((word) => haystack.includes(word))) return null;
        // Labels that start with the query first, then labels containing it, then keywords.
        const score = label.startsWith(words[0]) ? 0 : label.includes(words[0]) ? 1 : 2;
        return { command, score };
      })
      .filter((match): match is { command: Command; score: number } => match !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 30)
      .map((match) => match.command);
    const searchCommand: Command = {
      id: "search",
      group: "Search",
      label: `Search articles for “${q}”`,
      icon: <Search className={ICON} />,
      run: () => {
        setSelectedArticleId(null);
        setSearch(q);
        setMobilePane("list");
      },
    };
    // Searching comes first unless the query is clearly a place or action.
    return matches.length > 0 && foldText(matches[0].label).startsWith(words[0])
      ? [...matches, searchCommand]
      : [searchCommand, ...matches];
  }, [commands, query, setSearch, setSelectedArticleId, setMobilePane]);

  React.useEffect(() => setActive(0), [query]);

  React.useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(command: Command | undefined) {
    if (!command) return;
    onOpenChange(false);
    // After the palette closes, so a dialog it opens takes focus.
    requestAnimationFrame(command.run);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % Math.max(results.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(results[active]);
    }
  }

  let lastGroup = "";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className="fixed left-1/2 top-[max(1rem,12vh)] z-50 flex max-h-[min(70vh,520px)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl border bg-popover text-popover-foreground shadow-2xl data-[state=open]:animate-fade-in"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <div className="flex items-center gap-3 border-b px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Go to, add, search…"
              className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              aria-label="Command"
              aria-controls="command-list"
              aria-activedescendant={results[active] ? `command-${results[active].id}` : undefined}
              autoFocus
            />
            <kbd className="hidden rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:block">
              Esc
            </kbd>
          </div>
          <div
            ref={listRef}
            id="command-list"
            role="listbox"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {results.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing found</p>
            )}
            {results.map((command, index) => {
              const heading = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <React.Fragment key={command.id}>
                  {heading && (
                    <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {heading}
                    </p>
                  )}
                  <button
                    type="button"
                    id={`command-${command.id}`}
                    role="option"
                    aria-selected={index === active}
                    data-index={index}
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(command)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm",
                      index === active ? "bg-accent text-accent-foreground" : "text-foreground/90"
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
                      {command.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{command.label}</span>
                    {command.hint && (
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {command.hint}
                      </kbd>
                    )}
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
