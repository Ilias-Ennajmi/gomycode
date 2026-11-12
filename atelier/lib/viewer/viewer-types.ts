// What a visitor's browser receives for a board: plain, validated, redacted JSON. Types only (no runtime code), no imports from
// the Yjs document, Tiptap or the export engine, so the light viewer can depend on this file and nothing heavy comes with it.
// The server builds it in lib/server/viewer-board.ts.
import type { CanvasObject } from "@/lib/engine/model/types";
import type { VariantName } from "@/lib/assets/variants";

export type ViewerMark = "bold" | "italic" | "underline" | "strike";

/** One styled stretch of text. Always drawn as a React text node; `href` is http(s) or mailto only (checked on the server). */
export interface ViewerRun {
  text: string;
  marks: ViewerMark[];
  href?: string;
  /** Explicit font size in px. */
  size?: number;
}

/** A paragraph, heading or list item. The same shape as the export engine's `RichBlock` (the server asserts they stay assignable). */
export interface ViewerBlock {
  kind: "p" | "h1" | "h2" | "h3" | "li";
  listType?: "bullet" | "ordered";
  index?: number;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  runs: ViewerRun[];
}

/**
 * A canvas object as the viewer gets it. It has the shape of the owner's `CanvasObject`, so the viewer and the export code
 * read it the same way, but nothing the viewer should not know is in it: `locked`, `createdAt` and `updatedAt` are constants
 * (false, 0, 0), a frame's presenter `notes` are "", `provenance` is null unless the link shows credits, and rich text is
 * in `blocks` (runs of plain text, never HTML).
 */
export type ViewerObject = CanvasObject & { blocks?: ViewerBlock[] };

export interface ViewerSlide {
  id: string;
  name: string;
  /** The frame's bounding box on the canvas. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Absolute URLs of the pre-rendered preview images of a published round (null in live mode or when it has none). */
  previewW480: string | null;
  previewW1280: string | null;
}

/** An image or video the exposed objects use. Files live at `${assetBase}/a/{id}/w{N}.webp` and `${assetBase}/a/{id}/original`. */
export interface ViewerAsset {
  w: number;
  h: number;
  kind: "image" | "video" | "gif";
  /** Variant files that exist, ascending. The original always exists. */
  variants: VariantName[];
  /** "Credit · Licence" line, only when the link shows credits. */
  credit: string | null;
  /** Source link (http or https), only when the link shows credits. */
  sourceUrl: string | null;
}

export interface ViewerBoard {
  board: { title: string; background: string | null };
  /** The published round being shown; null for a live link. */
  round: { id: string; number: number; label: string; publishedAt: string } | null;
  /** Frames in presentation order. */
  slides: ViewerSlide[];
  /** In paint order (parents before their children, siblings by z-order). */
  objects: ViewerObject[];
  /** Only the assets the objects above use. */
  assets: Record<string, ViewerAsset>;
  /** `https://{public R2 host}` or "" when none is configured. */
  assetBase: string;
  options: {
    permission: "view" | "react" | "comment";
    allowDownload: boolean;
    watermark: boolean;
    showCredits: boolean;
    blindVotes: boolean;
    votesRevealed: boolean;
    welcomeNote: string;
  };
  /** What changed since the visitor last looked, per exposed frame; null for a first visit or when nothing was published since. */
  changed: { sinceRound: number; byFrame: Record<string, { added: number; changed: number }> } | null;
  visitor: { id: string; name: string | null };
}
