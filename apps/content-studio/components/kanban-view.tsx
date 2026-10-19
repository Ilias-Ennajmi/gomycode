"use client";

import { useState, useTransition } from "react";
import {
  createProductionCard,
  deleteProductionCard,
  moveProductionCard,
  scheduleProductionCard,
  updateProductionCard,
} from "@/lib/actions/production";
import { AVATAR_COLORS, CONTENT_TYPES, RESPONSABLE_OPTIONS, TYPE_OPTIONS } from "@/lib/constants/type-options";

type Brand = { id: string; name: string };
type Campaign = { id: string; name: string };
type ProdCard = {
  id: string;
  column: "todo" | "inprogress" | "ready";
  kind: string;
  category: string;
  title: string;
  brandId: string | null;
  brand: Brand | null;
  contentType: string;
  responsable: string;
  campaignId: string | null;
  campaign: Campaign | null;
  dueDate: string | null;
  fromIdeaId: string | null;
};

const COLS: Array<{ key: ProdCard["column"]; label: string }> = [
  { key: "todo", label: "À faire" },
  { key: "inprogress", label: "En cours" },
  { key: "ready", label: "Prêt" },
];

export function KanbanView({ cards, brands, campaigns }: { cards: ProdCard[]; brands: Brand[]; campaigns: Campaign[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProdCard | null>(null);
  const [scheduling, setScheduling] = useState<ProdCard | null>(null);
  const [, startTransition] = useTransition();

  const total = cards.length;
  const ready = cards.filter((c) => c.column === "ready").length;
  const pct = total ? Math.round((ready / total) * 100) : 0;

  function handleDrop(e: React.DragEvent, column: ProdCard["column"]) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    startTransition(() => moveProductionCard(id, column));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Production</h2>
        <button onClick={() => setCreating(true)} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
          + Nouveau contenu
        </button>
      </div>

      <div>
        <div className="mb-1 text-xs text-zinc-500">
          {ready}/{total} prêts à programmer
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-red-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLS.map((col) => {
          const colCards = cards.filter((c) => c.column === col.key);
          const grouped = new Map<string, ProdCard[]>();
          const noCamp: ProdCard[] = [];
          colCards.forEach((c) => {
            if (c.campaignId) {
              const arr = grouped.get(c.campaignId) ?? [];
              arr.push(c);
              grouped.set(c.campaignId, arr);
            } else {
              noCamp.push(c);
            }
          });

          return (
            <div
              key={col.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, col.key)}
              className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3"
            >
              <div className="flex items-center justify-between text-sm font-semibold text-zinc-700">
                <span>{col.label}</span>
                <span className="text-zinc-400">{colCards.length}</span>
              </div>
              {[...grouped.entries()].map(([cid, groupCards]) => (
                <div key={cid} className="flex flex-col gap-2">
                  <div className="mt-1 text-[11px] font-semibold uppercase text-zinc-400">
                    {campaigns.find((c) => c.id === cid)?.name ?? "Campagne supprimée"}
                  </div>
                  {groupCards.map((card) => (
                    <KanCard key={card.id} card={card} onEdit={() => setEditing(card)} onSchedule={() => setScheduling(card)} />
                  ))}
                </div>
              ))}
              {grouped.size > 0 && noCamp.length > 0 && <div className="mt-1 text-[11px] font-semibold uppercase text-zinc-400">Sans campagne</div>}
              {noCamp.map((card) => (
                <KanCard key={card.id} card={card} onEdit={() => setEditing(card)} onSchedule={() => setScheduling(card)} />
              ))}
            </div>
          );
        })}
      </div>

      {creating && <ProductionFormModal brands={brands} campaigns={campaigns} onClose={() => setCreating(false)} />}
      {editing && <EditProductionModal card={editing} brands={brands} campaigns={campaigns} onClose={() => setEditing(null)} />}
      {scheduling && <ScheduleModal card={scheduling} brands={brands} onClose={() => setScheduling(null)} />}
    </div>
  );
}

function dueBadge(dueDate: string | null) {
  if (!dueDate) return null;
  const d = new Date(dueDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffH = (d.getTime() - today.getTime()) / 3600000;
  if (diffH < 0) return { label: "En retard", bg: "#FCEBEB", fg: "#A32D2D" };
  if (diffH <= 48) return { label: "Bientôt", bg: "#FEF3DC", fg: "#93650B" };
  return null;
}

function KanCard({ card, onEdit, onSchedule }: { card: ProdCard; onEdit: () => void; onSchedule: () => void }) {
  const [isPending, startTransition] = useTransition();
  const badge = dueBadge(card.dueDate);

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", card.id)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("select, input, button")) return;
        onEdit();
      }}
      className="cursor-pointer rounded-md border border-zinc-200 bg-white p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          {card.kind} · {card.category}
        </div>
        <button
          disabled={isPending}
          onClick={(e) => {
            e.stopPropagation();
            startTransition(() => deleteProductionCard(card.id));
          }}
          className="shrink-0 text-xs text-zinc-400 hover:text-red-600"
        >
          ✕
        </button>
      </div>
      <div className="my-1 font-medium text-zinc-900">{card.title}</div>
      <div className="mb-2 flex flex-wrap gap-1">
        {card.brand && <Tag>{card.brand.name}</Tag>}
        {card.campaign && <Tag>{card.campaign.name}</Tag>}
        {card.fromIdeaId && <Tag color={{ bg: "#EEEDFE", fg: "#3C3489" }}>💡 Depuis Idéation</Tag>}
        {badge && <Tag color={badge}>{badge.label}</Tag>}
      </div>
      <div className="mb-2 flex gap-1.5">
        <select
          value={card.contentType}
          disabled={isPending}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => startTransition(() => updateProductionCard(card.id, { contentType: e.target.value as (typeof CONTENT_TYPES)[number] }))}
          className="flex-1 rounded border border-zinc-200 px-1 py-0.5 text-[11px]"
        >
          {CONTENT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          value={card.responsable}
          disabled={isPending}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => startTransition(() => updateProductionCard(card.id, { responsable: e.target.value }))}
          className="flex-1 rounded border border-zinc-200 px-1 py-0.5 text-[11px]"
          style={{ color: AVATAR_COLORS[card.responsable] }}
        >
          {RESPONSABLE_OPTIONS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <input
        type="date"
        value={card.dueDate ?? ""}
        disabled={isPending}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => startTransition(() => updateProductionCard(card.id, { dueDate: e.target.value || null }))}
        className="w-full rounded border border-zinc-200 px-1 py-0.5 text-[11px]"
      />
      {card.column === "ready" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSchedule();
          }}
          className="mt-2 w-full rounded-md border border-zinc-300 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Programmer
        </button>
      )}
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color?: { bg: string; fg: string } }) {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: color?.bg ?? "#EEF1F7", color: color?.fg ?? "#444441" }}>
      {children}
    </span>
  );
}

function ProductionFormModal({ brands, campaigns, onClose }: { brands: Brand[]; campaigns: Campaign[]; onClose: () => void }) {
  const [typeKey, setTypeKey] = useState<string>(TYPE_OPTIONS[0].value);
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<(typeof CONTENT_TYPES)[number]>("Photo");
  const [responsable, setResponsable] = useState<(typeof RESPONSABLE_OPTIONS)[number]>("À assigner");
  const [brandId, setBrandId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const [kind, category] = typeKey.split("|") as [ProdCard["kind"], string];
    startTransition(async () => {
      await createProductionCard({
        kind: kind as "Feed" | "Story 1" | "Story 2" | "Story 3",
        category,
        title: title || "Nouveau contenu",
        brandId: brandId || null,
        contentType,
        responsable,
        campaignId: campaignId || null,
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">Nouveau contenu à produire</h3>
        <div className="flex flex-col gap-3">
          <Field label="Type">
            <select value={typeKey} onChange={(e) => setTypeKey(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Titre">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Type de contenu">
            <select value={contentType} onChange={(e) => setContentType(e.target.value as (typeof CONTENT_TYPES)[number])} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {CONTENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Qui va le faire">
            <select value={responsable} onChange={(e) => setResponsable(e.target.value as (typeof RESPONSABLE_OPTIONS)[number])} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {RESPONSABLE_OPTIONS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Marque">
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Général</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campagne">
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Aucune</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button disabled={isPending} onClick={submit} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            Ajouter
          </button>
        </div>
      </div>
    </div>
  );
}

function EditProductionModal({
  card,
  brands,
  campaigns,
  onClose,
}: {
  card: ProdCard;
  brands: Brand[];
  campaigns: Campaign[];
  onClose: () => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [brandId, setBrandId] = useState(card.brandId ?? "");
  const [campaignId, setCampaignId] = useState(card.campaignId ?? "");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      await updateProductionCard(card.id, { title, brandId: brandId || null, campaignId: campaignId || null });
      onClose();
    });
  }

  function del() {
    if (!confirm("Supprimer ce contenu ?")) return;
    startTransition(async () => {
      await deleteProductionCard(card.id);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">Modifier le contenu</h3>
        <div className="flex flex-col gap-3">
          <Field label="Titre">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Marque">
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Général</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campagne">
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Aucune</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button disabled={isPending} onClick={del} className="text-sm text-red-600 hover:underline">
            Supprimer
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
              Annuler
            </button>
            <button disabled={isPending} onClick={submit} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleModal({ card, brands, onClose }: { card: ProdCard; brands: Brand[]; onClose: () => void }) {
  const matching = card.brand ? brands.find((b) => b.name === card.brand!.name) : null;
  const [brandId, setBrandId] = useState(matching?.id ?? brands[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!date || !brandId) return onClose();
    startTransition(async () => {
      await scheduleProductionCard(card.id, { brandId, date });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">Programmer</h3>
        <div className="flex flex-col gap-3">
          <Field label="Calendrier">
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button disabled={isPending} onClick={submit} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            Ajouter au calendrier
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
      {label}
      {children}
    </label>
  );
}
