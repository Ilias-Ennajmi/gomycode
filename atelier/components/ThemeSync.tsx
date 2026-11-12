"use client";

import { useEffect } from "react";
import { watchSystemTheme } from "@/lib/theme";

/** Keeps the theme in step with the operating system while the choice is "System". Renders nothing. */
export function ThemeSync() {
  useEffect(() => watchSystemTheme(), []);
  return null;
}
