"use client";

import { useEffect, useState } from "react";
import { cx } from "./cx";

/**
 * A QR code as an SVG. Always dark ink on light paper (brand tokens), in every theme,
 * because that is what cameras read. The generator loads only when a code is shown.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const [made, setMade] = useState<{ value: string; size: number; path: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void import("qrcode-generator").then((mod) => {
      if (!alive) return;
      const qr = (mod.default ?? mod)(0, "M");
      qr.addData(value);
      qr.make();
      const n = qr.getModuleCount();
      let path = "";
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
      setMade({ value, size: n, path });
    });
    return () => {
      alive = false;
    };
  }, [value]);

  const ready = made && made.value === value ? made : null;
  return (
    <div role="img" aria-label={label} className={cx("aspect-square w-full rounded-lg bg-brand-paper p-4", !ready && "shimmer", className)}>
      {ready && (
        <svg viewBox={`0 0 ${ready.size} ${ready.size}`} shapeRendering="crispEdges" className="h-full w-full" aria-hidden>
          <path d={ready.path} style={{ fill: "var(--brand-ink)" }} />
        </svg>
      )}
    </div>
  );
}
