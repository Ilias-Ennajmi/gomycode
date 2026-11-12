/** Performance mark for "the first visible objects are on screen and the board is interactive" (read by the e2e perf test). */
export const BOARD_READY_MARK = "atelier:board-ready";

/**
 * Marks BOARD_READY_MARK after the first frame in which the canvas holds an object (or after the first frame when the
 * board is empty). Gives up after `timeoutMs` and marks anyway, with `detail.timedOut`, so a measurement never hangs.
 * Returns the function that cancels it.
 */
export function markBoardReady(root: Element, expectObjects: boolean, opts: { timeoutMs?: number } = {}): () => void {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const start = performance.now();
  let raf = 0;
  let done = false;
  const finish = (timedOut: boolean) => {
    if (done) return;
    done = true;
    try {
      performance.mark(BOARD_READY_MARK, timedOut ? { detail: { timedOut: true } } : undefined);
    } catch {
      /* no User Timing */
    }
  };
  const tick = () => {
    if (done) return;
    if (!expectObjects || root.querySelector("[data-object-id]")) return finish(false);
    if (performance.now() - start > timeoutMs) return finish(true);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    done = true;
    cancelAnimationFrame(raf);
  };
}
