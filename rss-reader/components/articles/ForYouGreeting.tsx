"use client";

import * as React from "react";
import { Inbox, Timer } from "lucide-react";
import { requestAppEvent } from "@/lib/app-events";
import { useCounts } from "@/lib/hooks/useArticles";
import { Ticker } from "@/components/ui/ticker";
import { GoalRing } from "@/components/shared/GoalRing";
import { usePersonal } from "@/lib/hooks/usePersonal";
import { useReviewStatus } from "@/lib/hooks/useReview";
import { useReaderState, type ViewState } from "@/lib/hooks/useReaderState";
import { useT } from "@/lib/i18n";

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The top of For You: a greeting with "5 min" beside it (a reading session that fits the
 * time), and one quiet line of what's waiting (unread, alerts, the review), each a tap
 * away. It scrolls away with the list, so it costs no screen space once you're reading.
 */
export function ForYouGreeting() {
  const { setView } = useReaderState();
  const { t } = useT();
  const { personal } = usePersonal();
  const { unread, alerts } = useCounts();
  const { data: review } = useReviewStatus();
  const reviewCount = review?.highlights.length ?? 0;

  // Rendered on the client only: the time of day isn't known on the server.
  const [text, setText] = React.useState<string | null>(null);
  React.useEffect(() => setText(greeting()), []);

  const links: { key: string; label: string; view: ViewState }[] = [];
  if (alerts > 0) {
    links.push({
      key: "alerts",
      label: `${alerts} alert${alerts === 1 ? "" : "s"}`,
      view: { type: "alerts", label: "Alerts" },
    });
  }
  if (reviewCount > 0) {
    links.push({
      key: "review",
      label: t("Review ready"),
      view: { type: "review", label: "Daily review" },
    });
  }

  if (!text) return <div className="h-[64px]" aria-hidden />;
  return (
    <div className="px-4 pb-2 pt-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">{t(text)}</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => requestAppEvent("time-pile")}
                aria-label={t("Got 5 minutes?")}
                title={t("Got 5 minutes?")}
                className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <Timer className="h-3.5 w-3.5" /> 5 min
              </button>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5" />
              {unread > 0 ? (
                <>
                  <Ticker value={unread} /> {t("unread")}
                </>
              ) : (
                t("You're all caught up")
              )}
            </span>
            {links.map((link) => (
              <React.Fragment key={link.key}>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  onClick={() => setView(link.view)}
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {link.label}
                </button>
              </React.Fragment>
            ))}
          </p>
        </div>
        {personal.ring && <GoalRing size={52} />}
      </div>
    </div>
  );
}
