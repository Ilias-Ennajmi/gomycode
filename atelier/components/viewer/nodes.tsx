"use client";

import { createContext, memo, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { EmbedView } from "@/components/canvas/objects/EmbedView";
import { LinkView } from "@/components/canvas/objects/LinkView";
import { dashArray, safeColor } from "@/components/canvas/objects/style";
import { headShape } from "@/lib/engine/geometry/arrow-heads";
import { arrowPath } from "@/lib/engine/geometry/arrow-path";
import { strokeOutline } from "@/lib/engine/geometry/stroke-outline";
import { hostnameOf, parseHttpUrl } from "@/lib/engine/links/url";
import { pickPosterVariant } from "@/lib/engine/media/poster";
import { formatColor } from "@/lib/engine/model/color";
import { STICKY_COLORS, STICKY_FONT_PX, STICKY_LINE_HEIGHT } from "@/lib/engine/model/defaults";
import { imageClip, imageStyle } from "@/lib/engine/model/image-style";
import type { ObjectType } from "@/lib/engine/model/types";
import { pickVariant, TIERS, type ChosenVariant } from "@/lib/engine/render/variant";
import type { LoadTracker } from "@/lib/viewer/load-tracker";
import type { TreeNode } from "@/lib/viewer/scene";
import type { ViewerResolver } from "@/lib/viewer/viewer-resolver";
import type { ViewerObject } from "@/lib/viewer/viewer-types";
import { BlockText } from "./BlockText";

type VO<T extends ObjectType> = Extract<ViewerObject, { type: T }>;

export interface NodeContext {
  resolver: ViewerResolver;
  byId: ReadonlyMap<string, ViewerObject>;
  /** A pre-rendered preview lies underneath: frames paint no background and no label of their own. */
  underlay: boolean;
  /** Draw the credit line of each picture (only ever true when the link shows credits). */
  credits: boolean;
  dpr: number;
  tracker: LoadTracker | null;
}

export const NodeCtx = createContext<NodeContext | null>(null);

function useNodeCtx(): NodeContext {
  const c = useContext(NodeCtx);
  if (!c) throw new Error("NodeCtx is missing");
  return c;
}

const fill: CSSProperties = { position: "absolute", inset: 0 };
const FONT_FAMILY = /^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/;
const FALLBACK_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const grey: CSSProperties = { ...fill, background: "var(--color-border)", borderRadius: "var(--radius-sm)" };
const card: CSSProperties = {
  ...fill,
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxSizing: "border-box",
  background: "var(--color-surface)",
  color: "var(--color-ink)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  boxShadow: "var(--elev-1)",
  fontFamily: "var(--font-ui)",
};

// ---- pictures -----------------------------------------------------------------------------------------------------

const tierOfUrl = (resolver: ViewerResolver, id: string, url: string | null): ChosenVariant | null => (url === null ? null : (TIERS.find((t) => resolver.url(id, t) === url) ?? null));

export function ImageNode({ obj, scale, gesture }: { obj: VO<"image">; scale: number; gesture: boolean }) {
  const ctx = useNodeCtx();
  const { resolver, tracker } = ctx;
  const avail = resolver.available(obj.assetId);
  const crop = obj.crop && obj.crop.w > 0 ? Math.min(1, obj.crop.w) : 1;
  const choose = (loaded: ChosenVariant | null) =>
    pickVariant({
      onScreenPx: Math.max(obj.w, obj.h) * scale,
      dpr: ctx.dpr,
      cropFraction: crop,
      available: avail?.variants ?? [],
      originalLongest: avail ? Math.max(avail.width, avail.height) : 0,
      loaded,
      gesture,
    });
  // `shown` is the file that is actually on screen. The next one is fetched off screen and swapped in when it has loaded, so a
  // sharper variant never flashes blank; and "what is loaded" for the choice is simply what is shown.
  const [shown, setShown] = useState<string | null>(() => resolver.url(obj.assetId, choose(null)));
  const tier = choose(tierOfUrl(resolver, obj.assetId, shown));
  const target = resolver.url(obj.assetId, tier);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!target || target === shown) return;
    let cancelled = false;
    tracker?.start();
    const img = new Image();
    const finish = (ok: boolean) => {
      tracker?.done();
      if (!cancelled && ok) setShown(target);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = target;
    return () => {
      cancelled = true;
    };
    // `shown` is deliberately not a dependency: it changes only here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, tracker]);

  // The first load counts towards "the layer is ready" (upgrades above are counted by their own preloads).
  const src = shown ?? target;
  const counted = useRef<"none" | "open" | "done">("none");
  useEffect(() => {
    if (counted.current !== "none" || !tracker) return;
    counted.current = "open";
    tracker.start();
  }, [tracker]);
  const settle = () => {
    if (counted.current === "open") {
      counted.current = "done";
      tracker?.done();
    }
  };
  useEffect(() => {
    if (!src) settle();
  });

  if (!src || failed) return <div aria-hidden="true" style={grey} />;
  const credit = ctx.credits ? resolver.assetCredit(obj.assetId) : null;
  return (
    <div style={{ ...fill, ...imageClip(obj) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- bitmaps come from R2, already sized */}
      <img
        src={src}
        alt={obj.title || credit || "Image"}
        data-variant={tierOfUrl(resolver, obj.assetId, src) ?? tier}
        decoding="async"
        draggable={false}
        onLoad={settle}
        onError={() => {
          settle();
          setFailed(true);
        }}
        onContextMenu={(e) => e.preventDefault()}
        style={imageStyle(obj, false)}
      />
      {credit ? (
        <span className="vw-credit" style={{ fontSize: 11 / Math.max(scale, 0.01) }}>
          {credit}
        </span>
      ) : null}
    </div>
  );
}

function VideoNode({ obj, scale }: { obj: VO<"video">; scale: number }) {
  const ctx = useNodeCtx();
  const posterId = obj.posterAssetId ?? obj.assetId;
  const avail = ctx.resolver.available(posterId);
  const variant = pickPosterVariant(avail?.variants ?? ["w1024"], obj.w * scale * ctx.dpr);
  const poster = variant ? ctx.resolver.url(posterId, variant) : null;
  const original = ctx.resolver.url(obj.assetId, "original");
  const credit = ctx.credits ? ctx.resolver.assetCredit(obj.assetId) : null;
  if (!poster && !original) return <div aria-hidden="true" style={grey} />;
  return (
    <div style={{ ...fill, overflow: "hidden", borderRadius: "var(--radius-sm)", background: "var(--color-ink)", pointerEvents: "auto" }} data-no-tap="">
      {obj.kind === "gif" ? (
        poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt="Animated image (still frame)" decoding="async" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : null
      ) : (
        <video
          src={original ?? undefined}
          poster={poster ?? undefined}
          controls
          preload="none"
          playsInline
          muted={obj.muted}
          loop={obj.loop}
          aria-label="Video"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      )}
      {credit ? (
        <span className="vw-credit" style={{ fontSize: 11 / Math.max(scale, 0.01) }}>
          {credit}
        </span>
      ) : null}
    </div>
  );
}

// ---- text-like ----------------------------------------------------------------------------------------------------

function TextNode({ obj }: { obj: VO<"text"> }) {
  return (
    <div
      style={{
        width: obj.autoWidth ? undefined : obj.w,
        minWidth: obj.autoWidth ? obj.w : undefined,
        minHeight: obj.h,
        color: safeColor(obj.color, "var(--color-ink)"),
        fontSize: obj.fontSize,
        lineHeight: obj.lineHeight,
        textAlign: obj.align,
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
      }}
    >
      <BlockText blocks={obj.blocks} />
    </div>
  );
}

function StickyNode({ obj }: { obj: VO<"sticky"> }) {
  return (
    <div
      style={{
        boxSizing: "border-box",
        width: obj.w,
        minHeight: obj.h,
        background: `var(${STICKY_COLORS[obj.fill] ?? STICKY_COLORS.yellow})`,
        color: "var(--color-ink)",
        borderRadius: "var(--radius-sm)",
        boxShadow: "var(--elev-1)",
        fontSize: STICKY_FONT_PX[obj.size] ?? STICKY_FONT_PX.M,
        lineHeight: STICKY_LINE_HEIGHT,
        overflowWrap: "anywhere",
        whiteSpace: "pre-wrap",
        padding: "var(--space-4)",
      }}
    >
      <BlockText blocks={obj.blocks} />
    </div>
  );
}

function polygonPoints(kind: ShapeKind, w: number, h: number): string | null {
  const hw = w / 2;
  const hh = h / 2;
  switch (kind) {
    case "triangle":
      return `${hw},0 ${w},${h} 0,${h}`;
    case "diamond":
      return `${hw},0 ${w},${hh} ${hw},${h} 0,${hh}`;
    case "star": {
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 1 : 0.382;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push(`${hw + Math.cos(a) * hw * r},${hh + Math.sin(a) * hh * r}`);
      }
      return pts.join(" ");
    }
    default:
      return null;
  }
}
type ShapeKind = VO<"shape">["kind"];

function ShapeNode({ obj }: { obj: VO<"shape"> }) {
  const { w, h } = obj;
  const stroke = obj.stroke && obj.strokeWidth > 0 ? safeColor(obj.stroke, "var(--color-ink)") : "none";
  const common = {
    fill: obj.fill ? safeColor(obj.fill, "none") : "none",
    stroke,
    strokeWidth: obj.strokeWidth,
    strokeDasharray: dashArray(obj.strokeStyle, obj.strokeWidth),
    strokeLinecap: obj.strokeStyle === "dotted" ? ("round" as const) : undefined,
    strokeLinejoin: "round" as const,
  };
  const points = polygonPoints(obj.kind, w, h);
  const radius = obj.kind === "roundRect" ? (obj.cornerRadius > 0 ? obj.cornerRadius : Math.min(w, h) * 0.12) : obj.cornerRadius;
  return (
    <>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }} aria-hidden="true">
        {obj.kind === "ellipse" ? (
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />
        ) : points ? (
          <polygon points={points} {...common} />
        ) : (
          <rect x={0} y={0} width={w} height={h} rx={Math.min(radius, w / 2, h / 2)} {...common} />
        )}
      </svg>
      {obj.blocks && obj.blocks.length > 0 ? (
        <div
          style={{
            ...fill,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            boxSizing: "border-box",
            padding: "var(--space-2)",
            textAlign: "center",
            color: "var(--color-ink)",
            fontSize: "var(--text-md)",
            overflowWrap: "anywhere",
            whiteSpace: "pre-wrap",
          }}
        >
          <BlockText blocks={obj.blocks} />
        </div>
      ) : null}
    </>
  );
}

function ArrowNode({ obj }: { obj: VO<"arrow"> }) {
  const ctx = useNodeCtx();
  const geom = arrowPath(obj, (id) => ctx.byId.get(id));
  const color = safeColor(obj.stroke, "var(--color-ink)");
  const width = Math.max(obj.strokeWidth, 0);
  const headSize = Math.max(10, width * 4);
  const startHead = headShape(obj.startHead, geom.start, geom.startDir, headSize);
  const endHead = headShape(obj.endHead, geom.end, geom.endDir, headSize);
  const dash = obj.strokeStyle === "solid" ? undefined : dashArray(obj.strokeStyle, width);
  return (
    <>
      <svg width={1} height={1} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: geom.dangling ? 0.5 : undefined }} aria-hidden="true">
        <path d={geom.d} fill="none" stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap={obj.strokeStyle === "dotted" ? "round" : "butt"} strokeLinejoin="round" />
        {[startHead, endHead].map((hd, i) =>
          hd ? <path key={i} d={hd.d} fill={hd.filled ? color : "none"} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" /> : null,
        )}
      </svg>
      {obj.label ? (
        <div
          style={{
            position: "absolute",
            left: geom.labelAt.x,
            top: geom.labelAt.y,
            transform: "translate(-50%, -50%)",
            padding: "2px var(--space-2)",
            background: "var(--color-surface)",
            boxShadow: "var(--elev-1)",
            borderRadius: "var(--radius-sm)",
            color: "var(--color-ink)",
            fontSize: "var(--text-sm)",
            whiteSpace: "pre",
          }}
        >
          {obj.label}
        </div>
      ) : null}
    </>
  );
}

function StrokeNode({ obj, scale }: { obj: VO<"stroke">; scale: number }) {
  const d = strokeOutline(obj, scale < 0.1);
  const highlighter = obj.tool === "highlighter";
  return (
    <svg width={obj.w} height={obj.h} viewBox={`0 0 ${obj.w} ${obj.h}`} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: highlighter ? 0.4 : undefined, mixBlendMode: highlighter ? "multiply" : undefined }}>
      <path d={d} fill={safeColor(obj.color, "var(--color-ink)")} />
    </svg>
  );
}

// ---- cards ----------------------------------------------------------------------------------------------------------

function SwatchNode({ obj }: { obj: VO<"swatch"> }) {
  const value = formatColor(obj.hex, obj.format);
  return (
    <div role="group" aria-label={`Colour ${obj.name || obj.hex}`} style={card}>
      <div style={{ flex: "1 1 auto", minHeight: 0, background: safeColor(obj.hex, "var(--color-border)"), borderBottom: "1px solid var(--color-border)" }} />
      <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 2, padding: "var(--space-2) var(--space-3)", minWidth: 0 }}>
        {obj.name ? <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obj.name}</span> : null}
        <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)", lineHeight: 1.25, overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{value}</span>
      </div>
    </div>
  );
}

const pct = (w: number) => `${Math.round(Math.min(1, Math.max(0, w)) * 100)}%`;

function PaletteNode({ obj }: { obj: VO<"palette"> }) {
  const grid = obj.layout === "grid";
  return (
    <div style={{ ...card, flexDirection: "row" }}>
      <ul
        aria-label="Palette colours"
        style={{ listStyle: "none", margin: 0, padding: 0, flex: 1, minWidth: 0, display: grid ? "grid" : "flex", gridTemplateColumns: grid ? "repeat(auto-fill, minmax(72px, 1fr))" : undefined, gridAutoRows: grid ? "minmax(0, 1fr)" : undefined, gap: 1, background: "var(--color-border)" }}
      >
        {obj.swatches.map((s) => (
          <li key={s.hex} style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, flex: grid ? undefined : `${Math.max(s.weight, 0.11)} 1 0`, background: "var(--color-surface)" }}>
            <div style={{ flex: "1 1 auto", minHeight: 12, background: safeColor(s.hex, "var(--color-border)") }} />
            <div style={{ padding: "var(--space-1) var(--space-2)", fontSize: "var(--text-xs)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {s.name || s.hex}
              {obj.showWeights ? ` · ${pct(s.weight)}` : ""}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SpecimenNode({ obj }: { obj: VO<"typeSpecimen"> }) {
  const family = obj.family.trim();
  const stack = FONT_FAMILY.test(family) ? `"${family}", ${FALLBACK_STACK}` : FALLBACK_STACK;
  return (
    <div style={card}>
      <div style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden", padding: "var(--space-4)" }}>
        <p style={{ margin: 0, fontFamily: stack, fontSize: obj.size, fontWeight: obj.weight, fontStyle: obj.italic ? "italic" : "normal", lineHeight: 1.15, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{obj.sample}</p>
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", flexWrap: "wrap", gap: "var(--space-1) var(--space-3)", padding: "var(--space-2) var(--space-4)", borderTop: "1px solid var(--color-border)", fontSize: "var(--text-xs)", lineHeight: 1.4, color: "var(--color-muted)" }}>
        <span style={{ color: "var(--color-ink)", fontWeight: 500 }}>
          {family || "No family"} · {obj.weight}
          {obj.italic ? " italic" : ""}
        </span>
        {obj.licenceNote ? <span>{obj.licenceNote}</span> : null}
      </div>
    </div>
  );
}

function LinkNode({ obj }: { obj: VO<"link"> }) {
  const ctx = useNodeCtx();
  const href = parseHttpUrl(obj.url)?.href ?? null;
  return (
    <>
      <div aria-hidden="true" style={fill}>
        <LinkView obj={obj} assets={ctx.resolver} pending={false} />
      </div>
      {href ? (
        <a
          className="vw-cover"
          href={href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          data-open-url={href}
          aria-label={`Open ${obj.title || hostnameOf(obj.url)} in a new tab`}
          draggable={false}
          style={{ ...fill, pointerEvents: "auto" }}
        />
      ) : null}
    </>
  );
}

// ---- tree -----------------------------------------------------------------------------------------------------------

function FrameNode({ obj, children }: { obj: VO<"frame">; children: ReactNode }) {
  const ctx = useNodeCtx();
  const cx = obj.x + obj.w / 2;
  const cy = obj.y + obj.h / 2;
  const inverse = obj.rotation === 0 ? `translate(${-obj.x}px, ${-obj.y}px)` : `translate(${obj.w / 2}px, ${obj.h / 2}px) rotate(${-obj.rotation}rad) translate(${-cx}px, ${-cy}px)`;
  return (
    <>
      {ctx.underlay ? null : (
        <div
          data-frame-label=""
          style={{ position: "absolute", left: 0, bottom: "100%", maxWidth: `max(80px, calc(${obj.w}px * var(--zoom, 1)))`, paddingBottom: "var(--space-1)", transformOrigin: "0 100%", transform: "scale(var(--inv-zoom, 1))", color: "var(--color-muted)", fontSize: "var(--text-xs)", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
        >
          {obj.name}
        </div>
      )}
      <div style={{ ...fill, overflow: obj.clip ? "hidden" : "visible", background: ctx.underlay ? "transparent" : safeColor(obj.background, "var(--color-surface)"), boxShadow: ctx.underlay ? undefined : "var(--elev-1)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: inverse }}>{children}</div>
      </div>
    </>
  );
}

function bodyOf(node: TreeNode, scale: number, gesture: boolean): ReactNode {
  const o = node.obj;
  switch (o.type) {
    case "image":
      return <ImageNode obj={o} scale={scale} gesture={gesture} />;
    case "video":
      return <VideoNode obj={o} scale={scale} />;
    case "text":
      return <TextNode obj={o} />;
    case "sticky":
      return <StickyNode obj={o} />;
    case "shape":
      return <ShapeNode obj={o} />;
    case "arrow":
      return <ArrowNode obj={o} />;
    case "stroke":
      return <StrokeNode obj={o} scale={scale} />;
    case "swatch":
      return <SwatchNode obj={o} />;
    case "palette":
      return <PaletteNode obj={o} />;
    case "typeSpecimen":
      return <SpecimenNode obj={o} />;
    case "link":
      return <LinkNode obj={o} />;
    case "embed":
      return (
        <div style={{ ...fill, pointerEvents: "auto" }} data-no-tap="">
          <EmbedView obj={o} />
        </div>
      );
    default:
      return null;
  }
}

/** One object and what is nested in it. Memoised: while the camera moves only `scale` and `gesture` change, and only pictures read them. */
export const TreeView = memo(function TreeView({ node, scale, gesture }: { node: TreeNode; scale: number; gesture: boolean }) {
  const o = node.obj;
  const kids = node.children.map((c) => <TreeView key={c.obj.id} node={c} scale={scale} gesture={gesture} />);
  if (o.type === "group") return <>{kids}</>;
  const placed = o.type !== "arrow";
  return (
    <div
      data-object-id={o.id}
      data-object-type={o.type}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: placed ? o.w : 1,
        height: placed ? o.h : 1,
        transformOrigin: "50% 50%",
        transform: placed ? `translate(${o.x}px, ${o.y}px) rotate(${o.rotation}rad)` : undefined,
        opacity: o.opacity < 1 ? o.opacity : undefined,
      }}
    >
      {o.type === "frame" ? <FrameNode obj={o}>{kids}</FrameNode> : bodyOf(node, scale, gesture)}
      {o.type !== "frame" ? kids : null}
    </div>
  );
});
