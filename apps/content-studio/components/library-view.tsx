"use client";

import { useState, useTransition } from "react";
import { createAsset, deleteAsset } from "@/lib/actions/assets";
import { createProductionCardFromAxis } from "@/lib/actions/production";
import { CHARTE_ITEMS } from "@/lib/constants/charte";
import { FEED_AXES, STORY_AXES, type ContentAxis } from "@/lib/constants/content-axes";

type Brand = { id: string; name: string; tier: string | null; marketSharePct: string | null; isCatalog: boolean };
type Asset = { id: string; title: string; url: string; brandId: string | null };

const TIER_COLORS: Record<string, string> = {
  "Tier 1": "#8657D6",
  "Tier 2": "#1E88A8",
  "Tier 3": "#9AA2AF",
  Custom: "#C98A1E",
};

export function LibraryView({ brands, assets }: { brands: Brand[]; assets: Asset[] }) {
  const [modalBrandId, setModalBrandId] = useState<string | null | "none">(null);

  const tieredBrands = brands.filter((b) => b.name !== "Général");
  const general = brands.find((b) => b.name === "Général");

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">Marques &amp; ressources</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tieredBrands.map((b) => (
            <BrandCard
              key={b.id}
              brand={b}
              assets={assets.filter((a) => a.brandId === b.id)}
              onAddLink={() => setModalBrandId(b.id)}
            />
          ))}
          {general && (
            <BrandCard
              brand={general}
              assets={assets.filter((a) => a.brandId === general.id || a.brandId === null)}
              onAddLink={() => setModalBrandId("none")}
            />
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">Axes de contenu — Feed</h2>
        <div className="flex flex-col gap-2">
          {FEED_AXES.map((axis) => (
            <AxisRow key={axis.category} axis={axis} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">Axes de contenu — Stories</h2>
        <div className="flex flex-col gap-2">
          {STORY_AXES.map((axis) => (
            <AxisRow key={axis.category} axis={axis} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-zinc-900">Charte éditoriale</h2>
        <div className="flex flex-col gap-1.5 rounded-lg border border-zinc-200 bg-white p-4">
          {CHARTE_ITEMS.map((item) => (
            <div key={item} className="text-sm text-zinc-700">
              • {item}
            </div>
          ))}
        </div>
      </section>

      {modalBrandId !== null && (
        <AddAssetModal
          brandId={modalBrandId === "none" ? null : modalBrandId}
          onClose={() => setModalBrandId(null)}
        />
      )}
    </div>
  );
}

function BrandCard({
  brand,
  assets,
  onAddLink,
}: {
  brand: Brand;
  assets: Asset[];
  onAddLink: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const pct = brand.marketSharePct ? parseFloat(brand.marketSharePct) : null;
  const color = brand.tier ? TIER_COLORS[brand.tier] ?? "#9AA2AF" : "#9AA2AF";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-zinc-900">{brand.name}</span>
        {brand.tier && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
            style={{ backgroundColor: color }}
          >
            {brand.tier}
          </span>
        )}
      </div>
      {pct !== null && (
        <>
          <div className="mb-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 2.4)}%`, backgroundColor: color }} />
          </div>
          <div className="mb-2 text-right text-[11px] text-zinc-500">{pct}% du catalogue</div>
        </>
      )}
      <div className="flex flex-col gap-1">
        {assets.length === 0 && <div className="text-xs text-zinc-400">Aucun lien</div>}
        {assets.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 text-sm">
            <a href={a.url} target="_blank" rel="noreferrer" className="truncate text-blue-600 hover:underline">
              {a.title}
            </a>
            <button
              disabled={isPending}
              onClick={() => startTransition(() => deleteAsset(a.id))}
              className="shrink-0 text-xs text-zinc-400 hover:text-red-600"
            >
              Suppr.
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={onAddLink}
        className="mt-3 rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        + Lien
      </button>
    </div>
  );
}

function AxisRow({ axis }: { axis: ContentAxis }) {
  const [isPending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-2.5">
      <span className="w-44 shrink-0 font-medium text-zinc-900">{axis.category}</span>
      <span className="flex-1 text-sm text-zinc-500">{axis.description}</span>
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await createProductionCardFromAxis(axis);
            setAdded(true);
            setTimeout(() => setAdded(false), 1500);
          })
        }
        className="shrink-0 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {added ? "Ajouté ✓" : "Utiliser cet axe"}
      </button>
    </div>
  );
}

function AddAssetModal({ brandId, onClose }: { brandId: string | null; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!title.trim() || !url.trim()) return onClose();
    startTransition(async () => {
      await createAsset({ title, url, brandId });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">Ajouter un lien</h3>
        <div className="flex flex-col gap-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Guide de marque Planet Sport"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button
            disabled={isPending}
            onClick={submit}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}
