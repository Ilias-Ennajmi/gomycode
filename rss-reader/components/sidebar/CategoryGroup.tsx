"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { FeedItem } from "@/components/sidebar/FeedItem";
import type { CategorySummary } from "@/lib/types";

interface CategoryGroupProps {
  category: CategorySummary;
  categories: CategorySummary[];
  activeView: { type: string; id?: string };
  onSelectCategory: (category: CategorySummary) => void;
  onSelectFeed: (feedId: string, title: string) => void;
  onChanged: () => void;
}

export function CategoryGroup({
  category,
  categories,
  activeView,
  onSelectCategory,
  onSelectFeed,
  onChanged,
}: CategoryGroupProps) {
  const [expanded, setExpanded] = React.useState(true);

  return (
    <div>
      <div
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-accent/60",
          activeView.type === "category" && activeView.id === category.id && "bg-accent"
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label={expanded ? "Collapse category" : "Expand category"}
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform duration-150", expanded && "rotate-90")}
          />
        </button>
        <button
          type="button"
          onClick={() => onSelectCategory(category)}
          className="flex flex-1 items-center gap-2 truncate text-left font-medium"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          <span className="truncate">{category.name}</span>
        </button>
        {!!category.unreadCount && (
          <Badge
            variant="secondary"
            className="h-5 min-w-5 justify-center rounded-full bg-primary/10 px-1.5 text-[11px] font-semibold text-primary"
          >
            {category.unreadCount > 99 ? "99+" : category.unreadCount}
          </Badge>
        )}
      </div>
      {expanded && (
        <div className="mt-0.5 space-y-0.5 overflow-hidden">
          {category.feeds.length === 0 ? (
            <p className="py-1 pl-8 text-xs text-muted-foreground">No feeds yet</p>
          ) : (
            category.feeds.map((feed) => (
              <FeedItem
                key={feed.id}
                id={feed.id}
                title={feed.title}
                faviconUrl={feed.faviconUrl}
                unreadCount={feed.unreadCount}
                errorCount={feed.errorCount}
                active={activeView.type === "feed" && activeView.id === feed.id}
                categories={categories}
                onClick={() => onSelectFeed(feed.id, feed.title)}
                onChanged={onChanged}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
