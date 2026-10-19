"use client";

import * as React from "react";
import { reducedMotion } from "@/lib/motion";

/** A number that counts from its last value to the new one instead of jumping. */
export function Ticker({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = React.useState(value);
  const from = React.useRef(value);
  React.useEffect(() => {
    const start = from.current;
    if (start === value || reducedMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    const began = performance.now();
    const duration = Math.min(600, 200 + Math.abs(value - start) * 12);
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - began) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <span className={className} aria-label={String(value)}>
      {shown > 99 ? "99+" : shown}
    </span>
  );
}
