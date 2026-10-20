"use client";

import useSWR from "swr";
import { useInView } from "react-intersection-observer";
import { ArrowUpRight, MessagesSquare } from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import type { DiscussionThread } from "@/app/api/articles/[id]/discussion/route";

/**
 * At the end of an article: the Hacker News and Reddit threads about it, one tap away.
 * Looked up only once the end of the article is in view, and left out when there are none.
 */
export function Discussion({ articleId }: { articleId: string }) {
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: "400px" });
  const { data } = useSWR<{ threads: DiscussionThread[] }>(
    inView ? `/api/articles/${articleId}/discussion` : null,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 }
  );
  const threads = data?.threads ?? [];
  return (
    <div ref={ref}>
      {threads.length > 0 && (
        <section aria-label="Discussion" className="mt-10">
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <MessagesSquare className="h-3.5 w-3.5 text-primary" /> Discussion
          </h2>
          <ul className="divide-y rounded-2xl border bg-card/60">
            {threads.map((thread) => (
              <li key={thread.id}>
                <a
                  href={thread.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 transition-colors hover:bg-accent/60"
                >
                  <span
                    aria-hidden
                    className={
                      thread.site === "hn"
                        ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ff6600] font-mono text-sm font-bold text-white"
                        : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ff4500] text-xs font-bold text-white"
                    }
                  >
                    {thread.site === "hn" ? "Y" : "r/"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-sm font-medium leading-snug">
                      {thread.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {thread.site === "hn" ? "Hacker News" : thread.where}
                      {" · "}
                      {thread.comments} comment{thread.comments === 1 ? "" : "s"}
                      {" · "}
                      {thread.points} point{thread.points === 1 ? "" : "s"}
                      {thread.at ? ` · ${formatRelativeTime(thread.at)}` : ""}
                    </span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
