"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronRight, Orbit, Shrink } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { cx } from "@/components/ui/cx";
import { SPACE_BG, spaceVar, type SpaceColor } from "@/components/ui/space";
import { cardText } from "@/components/library/SaveGrid";
import { haptic } from "@/lib/haptics";
import { tokenMs } from "@/lib/motionTokens";
import { useMotionOK } from "@/lib/hooks/useMotionOK";
import { fetchGalaxy, onGalaxyChange, readGalaxyCache, type Galaxy } from "@/lib/galaxy";
import {
  HOME,
  hitTest,
  lerpView,
  nearestCluster,
  pan,
  toScreen,
  zoomAt,
  zoomToCluster,
  type Size,
  type View,
} from "@/lib/galaxyMath";
import type { SaveItem, Space } from "@/lib/data";

const MIN_SAVES = 5;
const TAP_SLOP = 8; // px a finger may wander and still count as a tap


/**
 * Library → Galaxy. Saves as dots, grouped by meaning and labelled by topic (laid
 * out by the worker's `galaxy` job). Drag to pan, pinch or wheel to zoom, tap a
 * label to zoom into its group, tap a dot to open the save. Below the map, the same
 * groups and saves as a list (TalkBack, keyboard, and 48 px targets).
 */
export function GalaxyView({
  saves,
  spacesById,
  onOpen,
}: {
  saves: SaveItem[];
  spacesById: Map<string, Space>;
  onOpen: (s: SaveItem) => void;
}) {
  const motionOK = useMotionOK();
  const [galaxy, setGalaxy] = useState<Galaxy | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>(HOME);
  const [focus, setFocus] = useState<number | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const box = useRef<HTMLDivElement>(null);
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const anim = useRef<number | null>(null);

  // Cached copy first, then the network; refresh when the worker writes a new layout.
  useEffect(() => {
    const cached = readGalaxyCache();
    // localStorage is only readable after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (cached) setGalaxy(cached);
    const load = () =>
      fetchGalaxy()
        .then(setGalaxy)
        .catch(() => {})
        .finally(() => setLoaded(true));
    void load();
    return onGalaxyChange(() => void load());
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [galaxy]);

  const byId = useMemo(() => new Map(saves.map((s) => [s.id, s])), [saves]);
  // Only saves still in the Library (archived and deleted ones drop out at once).
  const points = useMemo(
    () => (galaxy?.points ?? []).filter((p) => {
      const s = byId.get(p.saveId);
      return s && !s.archivedAt;
    }),
    [galaxy, byId],
  );
  const clusters = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of points) counts.set(p.cluster, (counts.get(p.cluster) ?? 0) + 1);
    return (galaxy?.clusters ?? []).filter((c) => counts.get(c.cluster)).map((c) => ({ ...c, size: counts.get(c.cluster) ?? 0 }));
  }, [galaxy, points]);

  const colorOf = useCallback(
    (saveId: string): SpaceColor => {
      const s = byId.get(saveId);
      return (s?.spaceId && spacesById.get(s.spaceId)?.color) || "inbox";
    },
    [byId, spacesById],
  );

  const animateTo = useCallback(
    (target: View) => {
      if (anim.current) cancelAnimationFrame(anim.current);
      const from = viewRef.current;
      const ms = motionOK ? tokenMs("--dur-screen") : 0;
      if (!ms) {
        setView(target);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = (now - start) / ms;
        setView(lerpView(from, target, t));
        anim.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      anim.current = requestAnimationFrame(step);
    },
    [motionOK],
  );
  useEffect(() => () => {
    if (anim.current) cancelAnimationFrame(anim.current);
  }, []);

  const zoomInto = useCallback(
    (cluster: number) => {
      setFocus(cluster);
      haptic();
      animateTo(zoomToCluster(points, cluster, size));
    },
    [animateTo, points, size],
  );
  const reset = () => {
    setFocus(null);
    animateTo(HOME);
  };

  // --- Gestures: one finger pans, two pinch, a still tap opens a dot or zooms a group.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; at: number; moved: boolean; pinch: number | null }>({
    startX: 0,
    startY: 0,
    at: 0,
    moved: false,
    pinch: null,
  });

  const local = (e: ReactPointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (anim.current) cancelAnimationFrame(anim.current);
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) gesture.current = { startX: p.x, startY: p.y, at: performance.now(), moved: false, pinch: null };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      gesture.current.moved = true;
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size >= 2 && gesture.current.pinch) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const factor = d / gesture.current.pinch;
      gesture.current.pinch = d;
      setView((v) => zoomAt(v, size, factor, (a.x + b.x) / 2, (a.y + b.y) / 2));
      return;
    }
    if (Math.hypot(p.x - gesture.current.startX, p.y - gesture.current.startY) > TAP_SLOP) gesture.current.moved = true;
    if (gesture.current.moved) setView((v) => pan(v, size, p.x - prev.x, p.y - prev.y));
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = local(e);
    pointers.current.delete(e.pointerId);
    if (pointers.current.size > 0) return;
    const g = gesture.current;
    if (g.moved || performance.now() - g.at > 500) return;
    const dot = hitTest(points, view, size, p.x, p.y);
    if (dot) {
      const s = byId.get(dot.saveId);
      if (s) {
        haptic();
        onOpen(s);
      }
      return;
    }
    const c = nearestCluster(clusters, view, size, p.x, p.y);
    if (c) zoomInto(c.cluster);
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const p = { x: e.clientX - box.current!.getBoundingClientRect().left, y: e.clientY - box.current!.getBoundingClientRect().top };
    setView((v) => zoomAt(v, size, Math.exp(-e.deltaY / 400), p.x, p.y));
  };

  // --- States
  const readyCount = saves.filter((s) => s.status === "ready" && !s.archivedAt).length;
  if (!galaxy && !loaded) {
    return (
      <div className="px-4">
        <Skeleton shape="block" className="aspect-square w-full rounded-xl" />
      </div>
    );
  }
  if (!points.length) {
    return (
      <section aria-label="Galaxy" className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-raised text-fg-muted">
          <Orbit size={24} strokeWidth={2} aria-hidden />
        </span>
        <h2 className="text-heading">{readyCount >= MIN_SAVES ? "Your Galaxy is being drawn" : "Your Galaxy forms at 5 saves"}</h2>
        <p className="max-w-xs text-body text-fg-muted">
          {readyCount >= MIN_SAVES
            ? "Saves that mean similar things gather into labelled groups. It appears here in a minute."
            : `Saves that mean similar things gather into labelled groups. ${Math.max(0, MIN_SAVES - readyCount)} more to go.`}
        </p>
      </section>
    );
  }

  const r = Math.max(5, Math.min(9, 6 * Math.sqrt(view.scale)));
  const focused = focus === null ? null : clusters.find((c) => c.cluster === focus) ?? null;
  const focusSaves = focused
    ? points.filter((p) => p.cluster === focused.cluster).map((p) => byId.get(p.saveId)).filter((s): s is SaveItem => Boolean(s))
    : [];

  return (
    <section aria-label="Galaxy" className="flex flex-col gap-3 px-4">
      <div
        ref={box}
        className="relative aspect-square w-full touch-none select-none overflow-hidden rounded-xl bg-surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => pointers.current.delete(e.pointerId)}
        onWheel={onWheel}
      >
        {size.width > 0 && (
          <svg width={size.width} height={size.height} className="block" aria-hidden>
            {points.map((p) => {
              const s = toScreen(view, size, p.x, p.y);
              const dim = focus !== null && p.cluster !== focus;
              return (
                <circle
                  key={p.saveId}
                  cx={s.x}
                  cy={s.y}
                  r={r}
                  style={{ fill: `var(${spaceVar(colorOf(p.saveId))})`, opacity: dim ? 0.25 : 0.9 }}
                />
              );
            })}
            {clusters.map((c) => {
              const s = toScreen(view, size, c.cx, c.cy);
              const dim = focus !== null && c.cluster !== focus;
              return (
                <text
                  key={c.cluster}
                  x={s.x}
                  y={s.y - r - 8}
                  textAnchor="middle"
                  className="text-label"
                  style={{
                    fill: "var(--text-secondary)",
                    stroke: "var(--surface)",
                    strokeWidth: 4,
                    paintOrder: "stroke",
                    opacity: dim ? 0.3 : 1,
                  }}
                >
                  {c.label}
                </text>
              );
            })}
          </svg>
        )}
        {(view.scale > 1.01 || focus !== null) && (
          <IconButton label="Show the whole Galaxy" icon={Shrink} variant="raised" className="absolute top-2 right-2" onClick={reset} />
        )}
      </div>

      <p className="text-caption text-fg-muted">Pinch to zoom · tap a label to open its group · tap a dot to watch</p>

      {focused ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-heading">{focused.label}</h2>
            <button type="button" onClick={reset} className="tap px-2 text-label text-fg underline">
              All groups
            </button>
          </div>
          <ul className="flex flex-col gap-1">
            {focusSaves.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onOpen(s)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-card px-2 text-left hover:bg-raised"
                >
                  <span aria-hidden className={cx("h-2.5 w-2.5 shrink-0 rounded-full", SPACE_BG[colorOf(s.id)])} />
                  <span className="line-clamp-2 flex-1 text-body text-fg">{cardText(s)}</span>
                  <ChevronRight size={20} strokeWidth={2} aria-hidden className="shrink-0 text-fg-subtle" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul aria-label="Groups" className="flex flex-col gap-1">
          {clusters
            .slice()
            .sort((a, b) => b.size - a.size)
            .map((c) => (
              <li key={c.cluster}>
                <button
                  type="button"
                  onClick={() => zoomInto(c.cluster)}
                  className="flex min-h-12 w-full items-center gap-3 rounded-card px-2 text-left hover:bg-raised"
                >
                  <span className="flex-1 text-body text-fg">{c.label}</span>
                  <span className="text-caption text-fg-muted">
                    {c.size} {c.size === 1 ? "save" : "saves"}
                  </span>
                  <ChevronRight size={20} strokeWidth={2} aria-hidden className="shrink-0 text-fg-subtle" />
                </button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
