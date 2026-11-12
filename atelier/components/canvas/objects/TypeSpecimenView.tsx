"use client";

import { useEffect, useSyncExternalStore } from "react";
import { FALLBACK_STACK, getFontLoader, isValidFontName, type FontLoader, type FontStatus } from "@/lib/engine/fonts/font-loader";
import type { TypeSpecimenObj } from "@/lib/engine/model/types";

const isWebUrl = (v: string): boolean => {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

/** What a chip says; text, never colour alone. Null = nothing to say. */
function chipText(valid: boolean, empty: boolean, status: FontStatus): string | null {
  if (empty) return null;
  if (!valid) return "Not a valid font name";
  if (status === "fallback") return "Font unavailable offline";
  if (status === "not-found") return "Font not found";
  return null;
}

/** Subscribes to one family's status in the shared loader. */
export function useFontStatus(loader: FontLoader, family: string): FontStatus {
  return useSyncExternalStore(
    (cb) => loader.subscribe(cb),
    () => loader.status(family),
    () => "idle" as FontStatus,
  );
}

/**
 * A type specimen card: the sample text in the chosen family, size and weight, and a caption with the family name and
 * the licence / source. The object is only mounted while it is near the viewport (ObjectLayer culls), so mounting is the
 * moment its font is requested, and only that font. Until the font arrives (or when it cannot) the sample shows in a
 * system stack; the card never waits for the network.
 */
export function TypeSpecimenView({ obj, loader }: { obj: TypeSpecimenObj; loader?: FontLoader }) {
  const fonts = loader ?? getFontLoader();
  const family = obj.family.trim();
  const valid = isValidFontName(family);
  const status = useFontStatus(fonts, valid ? family : "");

  useEffect(() => {
    if (!valid) return;
    void fonts.load(family, [obj.weight], obj.italic);
  }, [fonts, valid, family, obj.weight, obj.italic]);

  const chip = chipText(valid, family === "", status);
  const stack = valid ? `"${family}", ${FALLBACK_STACK}` : FALLBACK_STACK;
  const source = obj.sourceUrl && isWebUrl(obj.sourceUrl) ? obj.sourceUrl : null;

  return (
    <div
      role="group"
      aria-label={`Type specimen: ${family || "no family"}, ${obj.weight}${obj.italic ? " italic" : ""}`}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--color-surface)",
        color: "var(--color-ink)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--elev-1)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden", padding: "var(--space-4)" }}>
        <p
          style={{
            margin: 0,
            fontFamily: stack,
            fontSize: obj.size,
            fontWeight: obj.weight,
            fontStyle: obj.italic ? "italic" : "normal",
            lineHeight: 1.15,
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
            userSelect: "none",
          }}
        >
          {obj.sample}
        </p>
      </div>
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          gap: "var(--space-1) var(--space-3)",
          padding: "var(--space-2) var(--space-4)",
          borderTop: "1px solid var(--color-border)",
          fontSize: "var(--text-xs)",
          lineHeight: 1.4,
          color: "var(--color-muted)",
        }}
      >
        <span style={{ color: "var(--color-ink)", fontWeight: 500 }}>
          {family || "No family"} · {obj.weight}
          {obj.italic ? " italic" : ""}
        </span>
        {chip ? (
          <span
            role="status"
            style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", padding: "0 var(--space-2)", color: "var(--color-ink)" }}
          >
            {chip}
          </span>
        ) : null}
        {obj.licenceNote ? <span>{obj.licenceNote}</span> : null}
        {source ? (
          <a href={source} target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)", pointerEvents: "none", textDecoration: "underline" }}>
            Source
          </a>
        ) : null}
      </div>
    </div>
  );
}
