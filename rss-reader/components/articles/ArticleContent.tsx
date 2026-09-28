"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { youTubeEmbedUrl, youTubeVideoId } from "@/lib/youtube";
import {
  READER_FONTS,
  READER_LEADING,
  READER_SIZES,
  useReaderPrefs,
} from "@/lib/hooks/useReaderPrefs";
import "highlight.js/styles/github-dark.css";

interface ArticleContentProps {
  content?: string | null;
  summary?: string | null;
  link: string;
  isVideo?: boolean;
}

type Purifier = typeof import("dompurify").default;
let purifierPromise: Promise<Purifier> | null = null;

// DOMPurify hooks are global and additive, so configure the instance once.
function getPurifier(): Promise<Purifier> {
  purifierPromise ??= import("dompurify").then(({ default: DOMPurify }) => {
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
      if (node.tagName === "IMG") node.setAttribute("loading", "lazy");
    });
    return DOMPurify;
  });
  return purifierPromise;
}

function VideoPlayer({
  videoId,
  summary,
  link,
}: {
  videoId: string;
  summary?: string | null;
  link: string;
}) {
  return (
    <div className="space-y-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-sm">
        <iframe
          src={youTubeEmbedUrl(videoId)}
          title="YouTube video player"
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      {summary && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {summary}
        </p>
      )}
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        Watch on YouTube <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

export function ArticleContent({ content, summary, link, isVideo }: ArticleContentProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const { prefs } = useReaderPrefs();
  // prose sizes everything in em, so one font-size scales the whole article.
  const readerStyle: React.CSSProperties = {
    fontFamily: READER_FONTS[prefs.font],
    fontSize: READER_SIZES[prefs.size],
    lineHeight: READER_LEADING[prefs.spacing],
  };
  const [sanitized, setSanitized] = React.useState<string | null>(null);
  const videoId = isVideo ? youTubeVideoId(link) : null;

  React.useEffect(() => {
    let cancelled = false;
    setSanitized(null);
    if (!content) return;

    getPurifier().then((DOMPurify) => {
      if (!cancelled) setSanitized(DOMPurify.sanitize(content, { ADD_ATTR: ["target"] }));
    });

    return () => {
      cancelled = true;
    };
  }, [content]);

  React.useEffect(() => {
    if (!sanitized || !containerRef.current) return;
    const blocks = containerRef.current.querySelectorAll("pre code");
    if (blocks.length === 0) return;
    import("highlight.js/lib/common").then(({ default: hljs }) => {
      dropBrokenLanguages(hljs);
      blocks.forEach((block) => {
        try {
          hljs.highlightElement(block as HTMLElement);
        } catch {
          // Unhighlighted code is still readable.
        }
      });
    });
  }, [sanitized]);

  if (videoId) return <VideoPlayer videoId={videoId} summary={summary} link={link} />;

  if (!content) {
    return (
      <div className="space-y-4">
        {summary && (
          <p className="text-foreground/90" style={readerStyle}>
            {summary}
          </p>
        )}
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
      style={readerStyle}
      className={cn(
        "reader-content prose prose-neutral max-w-none dark:prose-invert",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-p:leading-[inherit] prose-li:leading-[inherit]",
        "prose-img:mx-auto prose-img:rounded-lg",
        "prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:text-muted-foreground",
        "prose-blockquote:border-l-primary prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-foreground/80",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-pre:rounded-lg prose-pre:bg-muted prose-code:before:content-none prose-code:after:content-none",
        "prose-table:block prose-table:overflow-x-auto prose-hr:border-border"
      )}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

let languagesChecked = false;

/**
 * The production minifier corrupts at least one grammar's regex (it compiles fine in Node),
 * and one bad grammar makes auto-detection throw for every block. Drop the ones that fail.
 */
function dropBrokenLanguages(hljs: typeof import("highlight.js/lib/common").default) {
  if (languagesChecked) return;
  languagesChecked = true;
  for (const language of hljs.listLanguages()) {
    try {
      hljs.highlight("x", { language, ignoreIllegals: true });
    } catch {
      hljs.unregisterLanguage(language);
    }
  }
}
