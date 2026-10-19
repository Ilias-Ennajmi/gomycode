"use client";

import { useMemo, useState, useTransition } from "react";
import { createIdea, deleteIdea, sendIdeaToProduction } from "@/lib/actions/ideas";
import { IDEA_BANK, type IdeaBankTemplate } from "@/lib/constants/idea-bank";
import { IDEA_PRIORITY_OPTIONS, IDEA_TAG_TYPE_OPTIONS } from "@/lib/constants/type-options";

type Idea = {
  id: string;
  title: string;
  note: string | null;
  image: string | null;
  link: string | null;
  tagType: string | null;
  tagDetail: string | null;
  priority: string;
};

const PRIORITY_COLORS: Record<string, { bg: string; fg: string }> = {
  Haute: { bg: "#FCEBEB", fg: "#A32D2D" },
  Moyenne: { bg: "#FEF3DC", fg: "#93650B" },
  Basse: { bg: "#EAF4EC", fg: "#1E703F" },
};
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  Produit: { bg: "#DCE6F1", fg: "#0C447C" },
  Campagne: { bg: "#F4CCCC", fg: "#791F1F" },
  Autre: { bg: "#EEF1F7", fg: "#444441" },
};

export function IdeationView({ ideas }: { ideas: Idea[] }) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [prefill, setPrefill] = useState<IdeaBankTemplate | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return ideas;
    const q = search.toLowerCase();
    return ideas.filter((i) => `${i.title} ${i.note ?? ""} ${i.tagDetail ?? ""}`.toLowerCase().includes(q));
  }, [ideas, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Idéation</h2>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une idée…"
          className="ml-auto w-56 rounded-md border border-zinc-300 px-3 py-1.5 text-sm"
        />
        <button onClick={() => setBankOpen(true)} className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
          Banque d&apos;idées
        </button>
        <button onClick={() => setCreating(true)} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
          + Nouvelle idée
        </button>
      </div>

      {ideas.length === 0 && <p className="text-sm text-zinc-500">Aucune idée pour le moment. Cliquez sur &quot;Nouvelle idée&quot; pour commencer.</p>}
      {ideas.length > 0 && filtered.length === 0 && <p className="text-sm text-zinc-500">Aucune idée ne correspond à la recherche.</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((idea) => (
          <IdeaCard key={idea.id} idea={idea} />
        ))}
      </div>

      {bankOpen && (
        <IdeaBankModal
          onClose={() => setBankOpen(false)}
          onPick={(t) => {
            setPrefill(t);
            setBankOpen(false);
            setCreating(true);
          }}
        />
      )}
      {creating && (
        <IdeaFormModal
          prefill={prefill}
          onClose={() => {
            setCreating(false);
            setPrefill(null);
          }}
        />
      )}
    </div>
  );
}

function IdeaCard({ idea }: { idea: Idea }) {
  const [isPending, startTransition] = useTransition();
  const pc = PRIORITY_COLORS[idea.priority] ?? PRIORITY_COLORS.Moyenne;
  const tc = idea.tagType ? TAG_COLORS[idea.tagType] ?? TAG_COLORS.Autre : null;

  return (
    <div className="relative rounded-lg border border-zinc-200 bg-white p-4">
      <button
        disabled={isPending}
        onClick={() => startTransition(() => deleteIdea(idea.id))}
        className="absolute right-3 top-3 text-xs text-zinc-400 hover:text-red-600"
        title="Supprimer"
      >
        ✕
      </button>
      {idea.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={idea.image} alt="" className="mb-2 max-h-28 w-full rounded-md object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
      )}
      <div className="mb-1.5 flex flex-wrap gap-1">
        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: pc.bg, color: pc.fg }}>
          {idea.priority}
        </span>
        {idea.tagType && tc && (
          <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ backgroundColor: tc.bg, color: tc.fg }}>
            {idea.tagType}
            {idea.tagDetail ? ` · ${idea.tagDetail}` : ""}
          </span>
        )}
      </div>
      <div className="mb-1 font-semibold text-zinc-900">{idea.title}</div>
      {idea.note && <div className="mb-2 text-xs text-zinc-500">{idea.note}</div>}
      {idea.link && (
        <a href={idea.link} target="_blank" rel="noreferrer" className="mb-2 block text-xs text-blue-600 hover:underline">
          Lien
        </a>
      )}
      <button
        disabled={isPending}
        onClick={() => startTransition(() => sendIdeaToProduction(idea.id))}
        className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Envoyer en production
      </button>
    </div>
  );
}

function IdeaBankModal({ onClose, onPick }: { onClose: () => void; onPick: (t: IdeaBankTemplate) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="max-h-[70vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">Banque d&apos;idées</h3>
        <div className="flex flex-col gap-2">
          {IDEA_BANK.map((t) => (
            <div key={t.title} className="flex items-start gap-2 rounded-md border border-zinc-100 bg-zinc-50 p-2.5">
              <div className="flex-1">
                <div className="text-sm font-medium text-zinc-900">{t.title}</div>
                <div className="text-xs text-zinc-500">{t.note}</div>
              </div>
              <button onClick={() => onPick(t)} className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100">
                + Ajouter
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IdeaFormModal({ prefill, onClose }: { prefill: IdeaBankTemplate | null; onClose: () => void }) {
  const [title, setTitle] = useState(prefill?.title ?? "");
  const [note, setNote] = useState(prefill?.note ?? "");
  const [priority, setPriority] = useState<(typeof IDEA_PRIORITY_OPTIONS)[number]>(prefill?.priority ?? "Moyenne");
  const [tagType, setTagType] = useState<string>(prefill?.tagType ?? "");
  const [tagDetail, setTagDetail] = useState(prefill?.tagDetail ?? "");
  const [image, setImage] = useState("");
  const [link, setLink] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) return onClose();
    startTransition(async () => {
      await createIdea({
        title,
        note,
        image,
        link,
        tagType: (tagType as "Produit" | "Campagne" | "Autre" | ""),
        tagDetail,
        priority,
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">Nouvelle idée</h3>
        <div className="flex flex-col gap-3">
          <Field label="Titre">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Story sur les nouveaux crampons" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Priorité">
            <select value={priority} onChange={(e) => setPriority(e.target.value as (typeof IDEA_PRIORITY_OPTIONS)[number])} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {IDEA_PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tag">
            <select value={tagType} onChange={(e) => setTagType(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              <option value="">Aucun</option>
              {IDEA_TAG_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Détail du tag (optionnel)">
            <input value={tagDetail} onChange={(e) => setTagDetail(e.target.value)} placeholder="Ex: Adidas Predator / Back to School" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Note">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Détails, inspiration..." className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Image (URL, optionnel)">
            <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Lien (URL, optionnel)">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
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
