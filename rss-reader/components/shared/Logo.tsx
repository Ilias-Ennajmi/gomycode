"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** The app mark: the RSS glyph on a violet tile, matching the home-screen icon. */
export function Logo({ className }: { className?: string }) {
  // Unique per instance: a duplicate id in a hidden copy would blank this one.
  const gradientId = `logo-gradient-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 512 512" aria-hidden className={cn("h-7 w-7 shrink-0", className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7C3AED" />
          <stop offset="1" stopColor="#C026D3" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${gradientId})`} />
      <g fill="none" stroke="#fff" strokeWidth="44" strokeLinecap="round">
        <path d="M150 238a124 124 0 0 1 124 124" />
        <path d="M150 142a220 220 0 0 1 220 220" />
      </g>
      <circle cx="162" cy="350" r="34" fill="#fff" />
    </svg>
  );
}
