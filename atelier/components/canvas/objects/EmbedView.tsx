"use client";

import { CirclePlay, Frame, X, type LucideIcon } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { isAllowedEmbedUrl } from "@/lib/engine/links/embed";
import { liveEmbeds } from "@/lib/engine/links/live-embed";
import { hostnameOf } from "@/lib/engine/links/url";
import type { EmbedObj, EmbedProvider } from "@/lib/engine/model/types";

const PROVIDERS: Record<EmbedProvider, { label: string; icon: LucideIcon }> = {
  youtube: { label: "YouTube", icon: CirclePlay },
  vimeo: { label: "Vimeo", icon: CirclePlay },
  figma: { label: "Figma", icon: Frame },
};

/** The one set of iframe attributes: as little as the providers' players work with. */
const SANDBOX = "allow-scripts allow-same-origin allow-presentation allow-popups";
const ALLOW = "fullscreen; picture-in-picture; encrypted-media";

const box = { position: "absolute", inset: 0, borderRadius: "var(--radius-sm)", overflow: "hidden" } as const;

function Placeholder() {
  return <div aria-hidden="true" data-placeholder="" style={{ ...box, background: "var(--color-border)" }} />;
}

/**
 * An embedded video or design. It is a facade (provider, title and a Play button) until it is played, and the facade
 * makes no request to any third party. Playing (the button, double-click or Enter on the canvas) mounts the only iframe
 * this view ever creates, from `embedUrl` after `isAllowedEmbedUrl` has accepted it again; a value that fails the check
 * (a tampered document) renders a quiet placeholder instead. One player at a time: playing another embed returns this
 * one to its facade. Used by the editor and by the read-only share viewer alike.
 */
export function EmbedView({ obj }: { obj: EmbedObj }) {
  const active = useSyncExternalStore(liveEmbeds.subscribe, () => liveEmbeds.active, () => null);
  const id = obj.id;
  // Scrolling the embed out of view unmounts it: free the player slot.
  useEffect(() => () => liveEmbeds.deactivate(id), [id]);

  if (!isAllowedEmbedUrl(obj.embedUrl)) return <Placeholder />;
  const p = PROVIDERS[obj.provider] ?? PROVIDERS.youtube;
  const name = obj.title || `${p.label} embed`;

  if (active === id) {
    return (
      <div style={{ ...box, background: "var(--color-ink)" }}>
        <iframe
          src={obj.embedUrl}
          title={name}
          sandbox={SANDBOX}
          referrerPolicy="strict-origin-when-cross-origin"
          allow={ALLOW}
          loading="lazy"
          allowFullScreen
          style={{ width: "100%", height: "100%", border: 0, display: "block", pointerEvents: "auto" }}
        />
        {/* data-editing-surface: the canvas leaves presses on this button alone, so a click reaches it. */}
        <button
          type="button"
          data-editing-surface=""
          aria-label="Stop and show the preview again"
          onClick={() => liveEmbeds.deactivate(id)}
          style={{
            position: "absolute",
            top: "var(--space-2)",
            right: "var(--space-2)",
            pointerEvents: "auto",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "var(--target-coarse)",
            height: "var(--target-coarse)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-ink)",
            cursor: "pointer",
          }}
        >
          <X aria-hidden="true" size={18} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  const Icon = p.icon;
  return (
    <div
      data-embed-facade=""
      role="group"
      aria-label={name}
      style={{
        ...box,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-3)",
        padding: "var(--space-4)",
        background: "var(--color-surface)",
        color: "var(--color-ink)",
        border: "1px solid var(--color-border)",
        boxSizing: "border-box",
        fontFamily: "var(--font-ui)",
        textAlign: "center",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", color: "var(--color-muted)", fontSize: "var(--text-sm)" }}>
        <Icon aria-hidden="true" size={18} strokeWidth={1.75} />
        {p.label}
      </span>
      {obj.title ? (
        <span style={{ fontSize: "var(--text-md)", fontWeight: 600, maxWidth: "100%", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere" }}>
          {obj.title.slice(0, 200)}
        </span>
      ) : (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)", overflowWrap: "anywhere" }}>{hostnameOf(obj.url)}</span>
      )}
      <button
        type="button"
        data-editing-surface=""
        aria-label={`Play ${name}`}
        onClick={() => liveEmbeds.activate(id)}
        style={{
          pointerEvents: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: "var(--space-2)",
          minHeight: "var(--target-coarse)",
          padding: "0 var(--space-5)",
          borderRadius: "var(--radius-md)",
          border: "none",
          background: "var(--color-accent)",
          color: "var(--color-on-accent)",
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <CirclePlay aria-hidden="true" size={18} strokeWidth={1.75} />
        Play
      </button>
    </div>
  );
}
