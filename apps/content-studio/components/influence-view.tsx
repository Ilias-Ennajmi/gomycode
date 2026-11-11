"use client";

import { useState, useTransition } from "react";
import { createInfluencer, deleteInfluencer, updateInfluencer } from "@/lib/actions/influence";
import { INFLUENCER_PLATFORM_OPTIONS, INFLUENCER_STATUS_OPTIONS, INFLUENCE_STATUS_COLORS } from "@/lib/constants/type-options";

type Campaign = { id: string; name: string };
type Influencer = {
  id: string;
  name: string;
  platform: string;
  category: string;
  campaignId: string | null;
  campaign: Campaign | null;
  status: string;
  contact: string | null;
  followers: string | null;
  notes: string | null;
  followUpDate: string | null;
};

const CATEGORY_OPTIONS = ["Campaigns Content", "Brands Collections Content", "Planet Sport Content", "Educational Content", "Autre"];

function dueLabel(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffH = (d.getTime() - today.getTime()) / 3600000;
  if (diffH < 0) return { label: "En retard", bg: "#FCEBEB", fg: "#A32D2D" };
  if (diffH <= 48) return { label: "Bientôt", bg: "#FEF3DC", fg: "#93650B" };
  return null;
}

export function InfluenceView({ influencers, campaigns }: { influencers: Influencer[]; campaigns: Campaign[] }) {
  const [view, setView] = useState<"list" | "pipeline">("list");
  const [editing, setEditing] = useState<Influencer | "new" | null>(null);
  const [, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Influence</h2>
        <div className="flex rounded-md border border-zinc-300 p-0.5 text-sm">
          {(["list", "pipeline"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded px-2.5 py-1 ${view === v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {v === "list" ? "Liste" : "Pipeline"}
            </button>
          ))}
        </div>
        <button onClick={() => setEditing("new")} className="ml-auto rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
          + Nouvel influenceur
        </button>
      </div>

      {influencers.length === 0 && <p className="text-sm text-zinc-500">Aucun influenceur suivi pour le moment. Ajoutez vos contacts en prospection ou déjà actifs.</p>}

      {influencers.length > 0 && view === "list" && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="px-3 py-2">Nom</th>
                <th className="px-3 py-2">Plateforme</th>
                <th className="px-3 py-2">Catégorie</th>
                <th className="px-3 py-2">Campagne</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2">Relance</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {influencers.map((inf) => {
                const sc = INFLUENCE_STATUS_COLORS[inf.status] ?? INFLUENCE_STATUS_COLORS.Prospection;
                const due = dueLabel(inf.followUpDate);
                return (
                  <tr key={inf.id} onClick={() => setEditing(inf)} className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                    <td className="px-3 py-2 font-medium text-zinc-900">{inf.name}</td>
                    <td className="px-3 py-2 text-zinc-600">{inf.platform}</td>
                    <td className="px-3 py-2 text-zinc-600">{inf.category}</td>
                    <td className="px-3 py-2 text-zinc-600">{inf.campaign?.name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: sc.bg, color: sc.fg }}>
                        {inf.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {inf.followUpDate ? (
                        <span className="flex items-center gap-1.5">
                          {inf.followUpDate.split("-").reverse().join("/")}
                          {due && (
                            <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: due.bg, color: due.fg }}>
                              {due.label}
                            </span>
                          )}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{inf.contact}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm("Supprimer cet influenceur ?")) return;
                          startTransition(() => deleteInfluencer(inf.id));
                        }}
                        className="text-zinc-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {influencers.length > 0 && view === "pipeline" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {INFLUENCER_STATUS_OPTIONS.map((status) => {
            const items = influencers.filter((i) => i.status === status);
            return (
              <div key={status} className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-zinc-700">
                  <span>{status}</span>
                  <span className="text-zinc-400">{items.length}</span>
                </div>
                {items.map((inf) => {
                  const due = dueLabel(inf.followUpDate);
                  return (
                    <div key={inf.id} onClick={() => setEditing(inf)} className="cursor-pointer rounded-md border border-zinc-200 bg-white p-2.5 text-xs">
                      <div className="font-semibold text-zinc-900">{inf.name}</div>
                      <div className="text-zinc-500">
                        {inf.platform}
                        {inf.campaign ? ` · ${inf.campaign.name}` : ""}
                      </div>
                      {inf.followUpDate && (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-400">
                          {due && (
                            <span className="rounded-full px-1.5 py-0.5 font-medium" style={{ backgroundColor: due.bg, color: due.fg }}>
                              {due.label}
                            </span>
                          )}
                          Relance {inf.followUpDate.split("-").reverse().join("/")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {editing && <InfluencerModal influencer={editing === "new" ? null : editing} campaigns={campaigns} onClose={() => setEditing(null)} />}
    </div>
  );
}

function InfluencerModal({ influencer, campaigns, onClose }: { influencer: Influencer | null; campaigns: Campaign[]; onClose: () => void }) {
  const isNew = !influencer;
  const [name, setName] = useState(influencer?.name ?? "");
  const [platform, setPlatform] = useState<(typeof INFLUENCER_PLATFORM_OPTIONS)[number]>((influencer?.platform as (typeof INFLUENCER_PLATFORM_OPTIONS)[number]) ?? "Instagram");
  const [category, setCategory] = useState(influencer?.category ?? "Brands Collections Content");
  const [campaignId, setCampaignId] = useState(influencer?.campaignId ?? "");
  const [status, setStatus] = useState<(typeof INFLUENCER_STATUS_OPTIONS)[number]>((influencer?.status as (typeof INFLUENCER_STATUS_OPTIONS)[number]) ?? "Prospection");
  const [contact, setContact] = useState(influencer?.contact ?? "");
  const [followers, setFollowers] = useState(influencer?.followers ?? "");
  const [followUpDate, setFollowUpDate] = useState(influencer?.followUpDate ?? "");
  const [notes, setNotes] = useState(influencer?.notes ?? "");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!name.trim()) return onClose();
    const input = {
      name,
      platform,
      category,
      campaignId: campaignId || null,
      status,
      contact,
      followers,
      notes,
      followUpDate: followUpDate || null,
    };
    startTransition(async () => {
      if (influencer) await updateInfluencer(influencer.id, input);
      else await createInfluencer(input);
      onClose();
    });
  }

  function del() {
    if (!influencer || !confirm("Supprimer cet influenceur ?")) return;
    startTransition(async () => {
      await deleteInfluencer(influencer.id);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">{isNew ? "Nouvel influenceur" : "Modifier l'influenceur"}</h3>
        <div className="flex flex-col gap-3">
          <Field label="Nom">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: @coureur_maroc" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Plateforme">
            <select value={platform} onChange={(e) => setPlatform(e.target.value as (typeof INFLUENCER_PLATFORM_OPTIONS)[number])} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {INFLUENCER_PLATFORM_OPTIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </Field>
          <Field label="Catégorie de contenu">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campagne associée">
            <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Aucune</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Statut">
            <select value={status} onChange={(e) => setStatus(e.target.value as (typeof INFLUENCER_STATUS_OPTIONS)[number])} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {INFLUENCER_STATUS_OPTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Contact (email / téléphone / DM)">
            <input value={contact} onChange={(e) => setContact(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Followers (optionnel)">
            <input value={followers} onChange={(e) => setFollowers(e.target.value)} placeholder="Ex: 24K" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Date de relance (optionnel)">
            <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
        </div>
        <div className="mt-4 flex items-center justify-between">
          {!isNew ? (
            <button disabled={isPending} onClick={del} className="text-sm text-red-600 hover:underline">
              Supprimer
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100">
              Annuler
            </button>
            <button disabled={isPending} onClick={submit} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
              {isNew ? "Ajouter" : "Enregistrer"}
            </button>
          </div>
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
