"use client";

import * as React from "react";
import { haptic } from "@/lib/native";

// Pages instead of a scroll, the way an e-reader turns them: the reader's scroll area is
// frozen, its content laid out in columns as tall as the area, and one column shows at a
// time. Tap the right third (swipe left, →, Space) for the next page, the left third for
// the previous. Nothing in the reader's tree changes; only styles on the existing nodes.

const GAP = 48;

export function usePagedLayout(
  containerRef: React.RefObject<HTMLElement>,
  enabled: boolean,
  resetKey: string | undefined
) {
  const [page, setPage] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const pagesRef = React.useRef(1);
  pagesRef.current = pages;

  React.useEffect(() => setPage(0), [resetKey, enabled]);

  const go = React.useCallback((delta: number) => {
    setPage((p) => {
      const next = Math.min(pagesRef.current - 1, Math.max(0, p + delta));
      if (next !== p) haptic();
      return next;
    });
  }, []);

  // Lay the content out in columns and keep the page count right as pictures load.
  React.useEffect(() => {
    const container = containerRef.current;
    const content = container?.firstElementChild as HTMLElement | null;
    if (!enabled || !container || !content) return;
    container.scrollTop = 0;
    const measure = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      Object.assign(content.style, {
        width: `${width}px`,
        height: `${height}px`,
        maxWidth: "none",
        columnWidth: `${width}px`,
        columnGap: `${GAP}px`,
        columnFill: "auto",
        boxSizing: "border-box",
      });
      content.classList.add("paged-columns");
      requestAnimationFrame(() => {
        const total = Math.max(1, Math.round((content.scrollWidth + GAP) / (width + GAP)));
        setPages(total);
        setPage((p) => Math.min(p, total - 1));
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    const mo = new MutationObserver(measure);
    mo.observe(content, { childList: true, subtree: true });
    const onLoad = () => measure();
    content.addEventListener("load", onLoad, true);
    return () => {
      ro.disconnect();
      mo.disconnect();
      content.removeEventListener("load", onLoad, true);
      content.classList.remove("paged-columns");
      for (const prop of [
        "width",
        "height",
        "maxWidth",
        "columnWidth",
        "columnGap",
        "columnFill",
        "boxSizing",
        "transform",
        "transition",
      ]) {
        content.style.removeProperty(prop.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`));
      }
    };
  }, [containerRef, enabled, resetKey]);

  // Turn the page: slide the columns sideways.
  React.useEffect(() => {
    const container = containerRef.current;
    const content = container?.firstElementChild as HTMLElement | null;
    if (!enabled || !container || !content) return;
    content.style.transition = "transform 280ms ease-out";
    content.style.transform = `translateX(${-page * (container.clientWidth + GAP)}px)`;
  }, [containerRef, enabled, page, pages]);

  // Taps, swipes and keys.
  React.useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;
    let touch: { x: number; y: number } | null = null;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest("a, button, input, textarea, [role=button], img, mark, video, iframe"))
        return;
      if (window.getSelection()?.toString()) return;
      const x = event.clientX - container.getBoundingClientRect().left;
      const third = container.clientWidth / 3;
      if (x > third * 2) go(1);
      else if (x < third) go(-1);
    };
    const onTouchStart = (event: TouchEvent) => {
      touch = { x: event.touches[0].clientX, y: event.touches[0].clientY };
    };
    const onTouchEnd = (event: TouchEvent) => {
      const start = touch;
      touch = null;
      if (!start) return;
      const dx = event.changedTouches[0].clientX - start.x;
      const dy = event.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.key === "ArrowRight" || event.key === " " || event.key === "PageDown") {
        event.preventDefault();
        go(1);
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        go(-1);
      }
    };
    container.addEventListener("click", onClick);
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchend", onTouchEnd);
    window.addEventListener("keydown", onKey);
    return () => {
      container.removeEventListener("click", onClick);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [containerRef, enabled, go]);

  return {
    enabled,
    page,
    pages,
    progress: pages > 1 ? Math.round(((page + 1) / pages) * 100) : enabled ? 100 : 0,
    go,
  };
}
