"use client";

import { useState } from "react";
import { STATUS_COLORS, CAT_COLORS, AVATAR_COLORS } from "@/lib/constants/type-options";

type BrandRow = { label: string; feed: number; story: number; count: number };
type Row = { label: string; count: number };
type ContentStats = { total: number; status: Row[]; category: Row[]; responsable: Row[] };

const BRAND_BAR_COLOR = "#8657D6";

export function StatsView({ brandRows, contentStats }: { brandRows: BrandRow[]; contentStats: ContentStats }) {
  const [tab, setTab] = useState<"marques" | "contenu">("marques");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Stats</h2>
        <div className="flex rounded-md border border-zinc-300 p-0.5 text-sm">
          {(["marques", "contenu"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2.5 py-1 ${tab === t ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {t === "marques" ? "Marques" : "Contenu"}
            </button>
          ))}
        </div>
      </div>

      {tab === "marques" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">Contenu par marque (tout le calendrier)</h3>
          <BarChart
            rows={brandRows.map((r) => ({ label: r.label, count: r.count, color: BRAND_BAR_COLOR, sub: `${r.feed} Feed · ${r.story} Stories` }))}
          />
        </div>
      )}

      {tab === "contenu" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-700">Statuts (marque active)</h3>
            <DonutChart segments={contentStats.status.map((s) => ({ label: s.label, count: s.count, color: STATUS_COLORS[s.label] ?? "#999" }))} />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-zinc-700">Catégories (marque active)</h3>
            <BarChart rows={contentStats.category.map((c) => ({ label: c.label, count: c.count, color: CAT_COLORS[c.label] ?? "#9AA2AF" }))} />
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 lg:col-span-2">
            <h3 className="mb-3 text-sm font-semibold text-zinc-700">Charge de travail par responsable (marque active)</h3>
            <BarChart rows={contentStats.responsable.map((r) => ({ label: r.label, count: r.count, color: AVATAR_COLORS[r.label] ?? "#9AA2AF" }))} />
          </div>
        </div>
      )}
    </div>
  );
}

function BarChart({ rows }: { rows: { label: string; count: number; color: string; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.some((r) => r.count > 0)) return <p className="text-xs text-zinc-400">Pas encore de données.</p>;

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3 text-xs">
          <div className="w-32 shrink-0 truncate font-medium text-zinc-700">{r.label}</div>
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, backgroundColor: r.color }} />
          </div>
          <div className="w-24 shrink-0 text-right text-zinc-500">{r.sub ?? r.count}</div>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ segments }: { segments: { label: string; count: number; color: string }[] }) {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  if (!total) return <p className="text-xs text-zinc-400">Pas encore de données.</p>;

  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = segments
    .filter((s) => s.count > 0)
    .map((s) => {
      const frac = s.count / total;
      const dash = frac * circumference;
      const arc = { ...s, dash, gap: circumference - dash, dashoffset: -offset };
      offset += dash;
      return arc;
    });

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-[120px] w-[120px] shrink-0">
        <svg width="120" height="120" viewBox="0 0 120 120">
          {arcs.map((a) => (
            <circle
              key={a.label}
              r={radius}
              cx="60"
              cy="60"
              fill="transparent"
              strokeWidth="16"
              stroke={a.color}
              strokeDasharray={`${a.dash.toFixed(2)} ${a.gap.toFixed(2)}`}
              strokeDashoffset={a.dashoffset.toFixed(2)}
              transform="rotate(-90 60 60)"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-xl font-semibold text-zinc-900">{total}</div>
          <div className="text-[10px] text-zinc-400">Total</div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-zinc-700">{s.label}</span>
            <span className="text-zinc-400">
              {s.count} ({total ? Math.round((s.count / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
