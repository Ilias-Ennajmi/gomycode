"use client";

import { useState, useTransition } from "react";
import {
  createCampaign,
  createCampaignItem,
  deleteCampaign,
  deleteCampaignItem,
  updateCampaign,
  updateCampaignItemStatus,
} from "@/lib/actions/campaigns";
import { CARD_STATUS_OPTIONS } from "@/lib/constants/type-options";

type CampaignItem = { id: string; title: string; status: string; date: string | null };
type Campaign = {
  id: string;
  name: string;
  period: string | null;
  start: string | null;
  end: string | null;
  items: CampaignItem[];
  calendarStats: { total: number; published: number };
};

export function CampaignsView({ campaigns }: { campaigns: Campaign[] }) {
  const [creating, setCreating] = useState(false);

  const dated = campaigns.filter((c) => c.start && c.end);
  const minDay = dated.length ? Math.min(...dated.map((c) => toDays(c.start!))) : 0;
  const maxDay = dated.length ? Math.max(...dated.map((c) => toDays(c.end!))) : 1;
  const span = Math.max(1, maxDay - minDay);
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Campagnes</h2>
        <button
          onClick={() => setCreating(true)}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white"
        >
          + Nouvelle campagne
        </button>
      </div>

      {dated.length > 0 && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-zinc-700">Frise chronologique</h3>
          <div className="flex flex-col gap-2">
            {dated.map((c) => {
              const left = ((toDays(c.start!) - minDay) / span) * 100;
              const width = Math.max(2, ((toDays(c.end!) - toDays(c.start!)) / span) * 100);
              const isPast = (c.end ?? "") < todayKey;
              return (
                <div key={c.id} className="flex items-center gap-3 text-xs">
                  <div className="w-32 shrink-0 truncate font-medium text-zinc-700">{c.name}</div>
                  <div className="relative h-4 flex-1 rounded-md bg-zinc-100">
                    <div
                      className="absolute top-0 bottom-0 rounded-md bg-red-500"
                      style={{ left: `${left}%`, width: `${width}%`, opacity: isPast ? 0.45 : 1 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {campaigns.map((camp) => (
          <CampaignBoard key={camp.id} campaign={camp} />
        ))}
      </div>

      {creating && <CampaignModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function toDays(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

function CampaignBoard({ campaign }: { campaign: Campaign }) {
  const [editing, setEditing] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [isPending, startTransition] = useTransition();

  const doneN = campaign.items.filter((it) => it.status === "Publié").length;
  const totalN = campaign.items.length;
  const pct = totalN ? Math.round((doneN / totalN) * 100) : 0;
  const sortedItems = [...campaign.items].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-zinc-900">{campaign.name}</div>
          <div className="text-xs text-zinc-500">{campaign.period}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button onClick={() => setEditing(true)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50">
            Modifier
          </button>
          <button
            disabled={isPending}
            onClick={() => {
              if (!confirm(`Supprimer la campagne "${campaign.name}" et tout son contenu ?`)) return;
              startTransition(() => deleteCampaign(campaign.id));
            }}
            className="rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-red-50 hover:text-red-600"
          >
            Suppr.
          </button>
        </div>
      </div>

      <div className="mb-1 text-xs text-zinc-500">
        {doneN}/{totalN} publiés
      </div>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div className="h-full rounded-full bg-red-500" style={{ width: `${pct}%` }} />
      </div>
      {campaign.start && campaign.end && (
        <div className="mb-3 text-xs text-zinc-500">
          {campaign.calendarStats.published}/{campaign.calendarStats.total} contenus calendrier publiés sur la période
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sortedItems.map((item) => (
          <CampaignItemRow key={item.id} item={item} />
        ))}
      </div>

      <button
        onClick={() => setAddingItem(true)}
        className="mt-3 rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        + Idée / Contenu
      </button>

      {editing && <CampaignModal campaign={campaign} onClose={() => setEditing(false)} />}
      {addingItem && <CampaignItemModal campaignId={campaign.id} campaignName={campaign.name} onClose={() => setAddingItem(false)} />}
    </div>
  );
}

function CampaignItemRow({ item }: { item: CampaignItem }) {
  const [isPending, startTransition] = useTransition();
  const dateLabel = item.date ? item.date.split("-").reverse().join("/") : "Sans date";

  return (
    <div className="rounded-md border border-zinc-100 bg-zinc-50 p-2.5">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] text-zinc-400">{dateLabel}</div>
          <div className="text-sm text-zinc-800">{item.title}</div>
        </div>
        <button
          disabled={isPending}
          onClick={() => startTransition(() => deleteCampaignItem(item.id))}
          className="shrink-0 text-xs text-zinc-400 hover:text-red-600"
        >
          ✕
        </button>
      </div>
      <select
        value={item.status}
        disabled={isPending}
        onChange={(e) => startTransition(() => updateCampaignItemStatus(item.id, e.target.value as (typeof CARD_STATUS_OPTIONS)[number]))}
        className="rounded-md border border-zinc-300 px-1.5 py-1 text-xs"
      >
        {CARD_STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

function CampaignModal({ campaign, onClose }: { campaign?: Campaign; onClose: () => void }) {
  const [name, setName] = useState(campaign?.name ?? "");
  const [period, setPeriod] = useState(campaign?.period ?? "");
  const [start, setStart] = useState(campaign?.start ?? "");
  const [end, setEnd] = useState(campaign?.end ?? "");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return onClose();
    startTransition(async () => {
      if (campaign) {
        await updateCampaign(campaign.id, { name, period, start: start || null, end: end || null });
      } else {
        await createCampaign({ name, period, start: start || null, end: end || null });
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">{campaign ? "Modifier la campagne" : "Nouvelle campagne"}</h3>
        <div className="flex flex-col gap-3">
          <Field label="Nom">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Ramadan" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Période (texte affiché)">
            <input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="Ex: Février – Mars" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Date de début">
            <input type="date" value={start ?? ""} onChange={(e) => setStart(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Date de fin">
            <input type="date" value={end ?? ""} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button disabled={isPending} onClick={submit} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            {campaign ? "Enregistrer" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignItemModal({ campaignId, campaignName, onClose }: { campaignId: string; campaignName: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return onClose();
    startTransition(async () => {
      await createCampaignItem(campaignId, { title, date: date || null });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">Contenu pour {campaignName}</h3>
        <div className="flex flex-col gap-3">
          <Field label="Titre">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Post ouverture soldes" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Date (optionnel)">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
      {label}
      {children}
    </label>
  );
}
