"use client";

import * as React from "react";
import { cn, getFaviconFallbackColor, getInitial } from "@/lib/utils";

interface FeedFaviconProps {
  title: string;
  faviconUrl?: string | null;
  size?: number;
  className?: string;
}

export function FeedFavicon({ title, faviconUrl, size = 16, className }: FeedFaviconProps) {
  const [errored, setErrored] = React.useState(false);

  if (!faviconUrl || errored) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", className)}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.55,
          backgroundColor: getFaviconFallbackColor(title),
        }}
        aria-hidden
      >
        {getInitial(title)}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-full object-cover", className)}
      style={{ width: size, height: size }}
      onError={() => setErrored(true)}
    />
  );
}
