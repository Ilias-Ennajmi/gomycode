"use client";

import type { ReactNode } from "react";
import { LazyMotion } from "framer-motion";

// The animation engine (springs, drag, shared layout) is a separate chunk fetched after first
// paint. Components use `m.*`, which renders at once and starts animating when it arrives.
const features = () => import("./motionFeatures").then((mod) => mod.default);

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={features} strict>
      {children}
    </LazyMotion>
  );
}
