"use client";

/*
 * Thumbnail → item: the tapped thumbnail grows into the item's player with the
 * browser's View Transitions API (document.startViewTransition). The grid marks its
 * cards with data-morph-src="<save id>", the item page marks its player with
 * data-morph-dst="<save id>" and the same view-transition-name. Without support,
 * with reduce motion (system or in-app), or if the page is slow, it is a plain
 * navigation: nothing breaks. Duration and easing come from the motion tokens
 * (styles/globals.css, ::view-transition-group).
 */

type Router = { push: (href: string) => void };
type VTDocument = Document & { startViewTransition?: (cb: () => Promise<void> | void) => { finished: Promise<void> } };

export const morphName = (saveId: string) => `save-${saveId.replace(/[^a-zA-Z0-9-]/g, "")}`;

export function motionAllowed(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.dataset.reduceMotion === "true") return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function waitFor(selector: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (document.querySelector(selector) || performance.now() - start > timeoutMs) resolve();
      else requestAnimationFrame(tick);
    };
    tick();
  });
}

export function morphTo(router: Router, href: string, saveId: string): void {
  const doc = document as VTDocument;
  const src = document.querySelector<HTMLElement>(`[data-morph-src="${CSS.escape(saveId)}"]`);
  if (!src || typeof doc.startViewTransition !== "function" || !motionAllowed()) {
    router.push(href);
    return;
  }
  const name = morphName(saveId);
  src.style.viewTransitionName = name;
  try {
    doc.startViewTransition(async () => {
      // The old snapshot is taken; the name now belongs to the item page's player.
      src.style.viewTransitionName = "";
      router.push(href);
      await waitFor(`[data-morph-dst="${CSS.escape(saveId)}"]`, 600);
    });
  } catch {
    src.style.viewTransitionName = "";
    router.push(href);
  }
}
