"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import "highlight.js/styles/github-dark.css";

interface ArticleContentProps {
  content?: string | null;
  summary?: string | null;
  link: string;
}

export function ArticleContent({ content, summary, link }: ArticleContentProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [sanitized, setSanitized] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!content) {
      setSanitized(null);
      return;
    }

    (async () => {
      const DOMPurify = (await import("dompurify")).default;
      DOMPurify.addHook("afterSanitizeAttributes", (node) => {
        if (node.tagName === "A") {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
        if (node.tagName === "IMG") {
          node.setAttribute("loading", "lazy");
        }
      });
      const clean = DOMPurify.sanitize(content, {
        ADD_ATTR: ["target"],
      });
      if (!cancelled) setSanitized(clean);
    })();

    return () => {
      cancelled = true;
    };
  }, [content]);

  React.useEffect(() => {
    if (!sanitized || !containerRef.current) return;
    (async () => {
      const hljs = (await import("highlight.js")).default;
      containerRef.current
        ?.querySelectorAll("pre code")
        .forEach((block) => hljs.highlightElement(block as HTMLElement));
    })();
  }, [sanitized]);

  if (!content && summary) {
    return (
      <div className="space-y-4">
        <p className="text-base leading-relaxed text-foreground/90">{summary}</p>
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
        >
          Read full article <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    );
  }

  if (!sanitized) {
    return (
      <div className="space-y-3">
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "prose prose-neutral max-w-none dark:prose-invert",
        "prose-img:rounded-lg prose-img:w-full",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-pre:rounded-lg prose-pre:bg-muted"
      )}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
