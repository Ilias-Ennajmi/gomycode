"use client";

import { useReducedMotion } from "framer-motion";
import { useAppearance } from "@/components/theme/ThemeProvider";

/** True when animation is allowed: neither the OS nor the in-app setting asks to reduce motion. */
export function useMotionOK(): boolean {
  const systemReduce = useReducedMotion();
  const { appearance } = useAppearance();
  return !systemReduce && !appearance.reduceMotion;
}
