"use client";

import { RefreshCw } from "lucide-react";
import { useSyncExternalStore } from "react";
import type { AssetResolver } from "@/lib/assets/resolver-types";
import { linkRetry } from "@/lib/engine/links/retry-store";
import { hostnameOf, parseHttpUrl } from "@/lib/engine/links/url";
import type { LinkObj } from "@/lib/engine/model/types";

const MAX_TITLE = 300;
const MAX_DESCRIPTION = 400;
const MAX_SITE = 100;
const clamp = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const lines = (n: number) => ({ overflow: "hidden", display: "-webkit-box", WebkitLineClamp: n, WebkitBoxOrient: "vertical" }) as const;

/**
 * A link card: thumbnail, site, title and description, all rendered as plain text (a title like `<img onerror=...>` is
 * just characters here) and clamped again on top of the server's limits. Titles never come from the page as HTML. The
 * whole card is one anchor (new tab, no opener, no referrer, nofollow) that the canvas itself never follows: a plain
 * click selects the card; opening is a double-click, Enter, or the selection bar's "Open link".
 */
export function LinkView({ obj, assets, onRetry, pending = true }: { obj: LinkObj; assets: AssetResolver; onRetry?: () => void; /** Whether a preview fetch for this card is running in this session. A "loading" card with none (the board was reloaded mid-fetch) reads as unavailable. */ pending?: boolean }) {
  const status = obj.status === "loading" && !pending ? "failed" : obj.status;
  // The editor registers who retries; a read-only viewer has none and shows no button.
  const editorRetry = useSyncExternalStore(linkRetry.subscribe, linkRetry.get, () => null);
  const retry = onRetry ?? (editorRetry ? () => editorRetry(obj.id) : undefined);
  const href = parseHttpUrl(obj.url)?.href ?? null;
  const host = hostnameOf(obj.url);
  const title = clamp(obj.title || host, MAX_TITLE);
  const site = clamp(obj.siteName || host, MAX_SITE);
  const description = clamp(obj.description, MAX_DESCRIPTION);
  const src = obj.imageAssetId ? assets.url(obj.imageAssetId, "w1024") : null;
  // A card tall enough for a picture keeps its space while the picture is on the way.
  const hasPictureArea = obj.h >= 200;

  const body = (
    <>
      {hasPictureArea ? (
        <div style={{ position: "relative", flex: "0 0 52%", background: "var(--color-border)", overflow: "hidden" }}>
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- the thumbnail is an asset served by the resolver
            <img src={src} alt="" decoding="async" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block", userSelect: "none" }} />
          ) : status === "loading" ? (
            <div data-skeleton="" className="link-skeleton" style={{ position: "absolute", inset: 0, background: "var(--color-border)" }} />
          ) : null}
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "var(--space-1)", padding: "var(--space-3) var(--space-4)", overflow: "hidden" }}>
        {site !== title ? (
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{site}</span>
        ) : null}
        <span style={{ fontSize: "var(--text-md)", fontWeight: 600, lineHeight: 1.3, overflowWrap: "anywhere", ...lines(2) }}>{title}</span>
        {description ? <span style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", lineHeight: 1.35, overflowWrap: "anywhere", ...lines(hasPictureArea ? 2 : 3) }}>{description}</span> : null}
        {status !== "ready" ? (
          <span style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--color-muted)" }}>
            {status === "loading" ? "Loading preview…" : "Preview unavailable"}
            {status === "failed" && retry ? (
              // data-editing-surface: the canvas leaves presses on this button alone, so the click reaches it.
              <button
                type="button"
                data-editing-surface=""
                aria-label="Retry preview"
                onClick={retry}
                style={{
                  pointerEvents: "auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  minHeight: "var(--target-coarse)",
                  padding: "0 var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-ink)",
                  fontSize: "var(--text-xs)",
                  cursor: "pointer",
                }}
              >
                <RefreshCw aria-hidden="true" size={14} strokeWidth={1.75} />
                Retry
              </button>
            ) : null}
          </span>
        ) : null}
      </div>
    </>
  );

  const style = {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxSizing: "border-box",
    background: "var(--color-surface)",
    color: "var(--color-ink)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    fontFamily: "var(--font-ui)",
    textDecoration: "none",
  } as const;

  return href ? (
    <a
      data-link-card=""
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      tabIndex={-1}
      draggable={false}
      onClick={(e) => e.preventDefault()}
      style={style}
    >
      {body}
    </a>
  ) : (
    <div data-link-card="" style={style}>
      {body}
    </div>
  );
}
