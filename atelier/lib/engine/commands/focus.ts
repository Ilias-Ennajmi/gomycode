import { clampZoom, fitRect, type Camera } from "../geometry/camera";
import type { Rect } from "../model/types";

/**
 * Where the camera must go to show `rect` (canvas coordinates), or null when it is already in view. The zoom stays
 * as it is while the rect fits; otherwise it zooms out just enough (never in): jumping through search results or
 * layers should not make the board lurch.
 */
export function cameraToReveal(cam: Camera, viewport: { w: number; h: number }, rect: Rect, marginPx = 48): Camera | null {
  const z = clampZoom(cam.z);
  const left = (rect.x - cam.x) * z;
  const top = (rect.y - cam.y) * z;
  const right = left + rect.w * z;
  const bottom = top + rect.h * z;
  const inside = left >= marginPx && top >= marginPx && right <= viewport.w - marginPx && bottom <= viewport.h - marginPx;
  if (inside) return null;
  return fitRect(rect, viewport, marginPx, z);
}
