// The laser pointer's fading trail. Pure: the overlay draws it, nothing is saved.

export const LASER_FADE_MS = 600;
export const LASER_MAX_POINTS = 64;

export type LaserPoint = { x: number; y: number; alpha: number };

export class LaserTrail {
  private pts: { x: number; y: number; t: number }[] = [];

  add(p: { x: number; y: number }, nowMs: number): void {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(nowMs)) return;
    this.pts.push({ x: p.x, y: p.y, t: nowMs });
    if (this.pts.length > LASER_MAX_POINTS) this.pts.splice(0, this.pts.length - LASER_MAX_POINTS);
  }

  /** The points still visible at `nowMs`, oldest first, with alpha 1 (new) down to 0 (gone). Faded ones are dropped. */
  points(nowMs: number): LaserPoint[] {
    this.pts = this.pts.filter((p) => nowMs - p.t < LASER_FADE_MS);
    return this.pts.map((p) => ({ x: p.x, y: p.y, alpha: Math.min(1, Math.max(0, 1 - (nowMs - p.t) / LASER_FADE_MS)) }));
  }

  empty(nowMs: number): boolean {
    return this.points(nowMs).length === 0;
  }

  clear(): void {
    this.pts = [];
  }
}
