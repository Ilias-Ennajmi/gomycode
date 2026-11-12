"use client";

import { createContext, useContext } from "react";

/** Zoom-dependent rendering inputs, changed only when the camera settles (not per frame). */
export type LodState = { zoom: number; dpr: number };

export const LodContext = createContext<LodState>({ zoom: 1, dpr: 1 });

export function useLod(): LodState {
  return useContext(LodContext);
}

/** Below this zoom text renders as grey bars. */
export const TEXT_BARS_ZOOM = 0.15;
/** Image variant switch: w1024 up to this many device pixels across. */
export const W1024_LIMIT = 1024;
