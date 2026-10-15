"use client";

import * as React from "react";
import { Bell, BookOpenCheck, Headphones, Inbox } from "lucide-react";
import { useCounts } from "@/lib/hooks/useArticles";
import { useReviewStatus } from "@/lib/hooks/useReview";
import { useReaderState, type ViewState } from "@/lib/hooks/useReaderState";

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The top of For You: a greeting and what's waiting, each a tap away. It scrolls away with
 * the list, so it costs no screen space once you're reading.
 */
export function ForYouGreeting() {
  const { setView } = useReaderState();
  const { unread, alerts, listening } = useCounts();
  const { data: review } = useReviewStatus();
  const reviewCount = review?.highlights.length ?? 0;

  // Rendered on the client only: the time of day isn't known on the server.
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => setText(greeting()), []);

  const items: { key: string; label: string; icon: React.ReactNode; view: ViewState }[] = [];
  if (alerts > 0) {
    items.push({
      key: "alerts",
      label: `${alerts} alert${alerts === 1 ? "" : "s"}`,
      icon: <Bell className="h-3.5 w-3.5" />,
      view: { type: "alerts", label: "Alerts" },
    });
  }
  if (reviewCount > 0) {
    items.push({
      key: "review",
      label: "Review ready",
      icon: <BookOpenCheck className="h-3.5 w-3.5" />,
      view: { type: "review", label: "Daily review" },
    });
  }
  if (listening > 0) {
    items.push({
      key: "listening",
      label: `${listening} episode${listening === 1 ? "" : "s"} in progress`,
      icon: <Headphones className="h-3.5 w-3.5" />,
      view: { type: "podcasts", label: "Podcasts" },
    });
  }

  if (!text) return <div className="h-[72px]" aria-hidden />;
  return (
    <div className="px-4 pb-1 pt-4">
      <h2 className="text-xl font-semibold tracking-tight">{text}</h2>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Inbox className="h-3.5 w-3.5" />
        {unread > 0 ? `${unread} unread` : "You're all caught up"}
      </p>
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setView(item.view)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
