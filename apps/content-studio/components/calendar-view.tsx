"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  bulkDeleteCalendarCards,
  bulkUpdateCalendarCards,
  createCalendarCard,
  cycleCalendarCardStatus,
  deleteCalendarCard,
  dismissAllAttentionItems,
  dismissAttentionItem,
  duplicateCalendarCard,
  importCalendarCsv,
  moveCalendarCard,
  toggleCalendarCardChecklistItem,
  updateCalendarCard,
} from "@/lib/actions/calendar";
import { HOLIDAYS } from "@/lib/constants/holidays";
import {
  AVATAR_COLORS,
  CARD_STATUS_OPTIONS,
  CAT_COLORS,
  CONTENT_TYPES,
  RESPONSABLE_OPTIONS,
  STATUS_COLORS,
  TYPE_OPTIONS,
  avatarInitials,
} from "@/lib/constants/type-options";
import { DAY_NAMES, addDays, fmtRange, fromKey, mondayOf, toKey, todayKey } from "@/lib/date";

export type Card = {
  id: string;
  brandId: string;
  date: string;
  kind: string;
  category: string;
  contentType: string;
  title: string;
  format: string | null;
  cta: string | null;
  status: string;
  responsable: string;
  note: string | null;
  checklist: unknown;
  image: string | null;
  link: string | null;
  attentionDismissedAt: string | Date | null;
  fromIdea: boolean;
  campaignId: string | null;
  dueDate: string | null;
};

type Campaign = { id: string; name: string; start: string | null; end: string | null };

function checklistOf(c: Card): boolean[] {
  return (Array.isArray(c.checklist) ? (c.checklist as boolean[]) : [false, false, false]) ?? [false, false, false];
}

function cardIsLate(card: Card) {
  if (card.status === "Publié") return false;
  return fromKey(card.date) < fromKey(todayKey());
}

function cardIsDueSoon(card: Card) {
  if (card.status !== "Prêt") return false;
  const diffH = (fromKey(card.date).getTime() - Date.now()) / 3600000;
  return diffH >= 0 && diffH <= 48;
}

function activeCampaignFor(dateKey: string, campaigns: Campaign[]) {
  return campaigns.find((c) => c.start && c.end && dateKey >= c.start && dateKey <= c.end) ?? null;
}

export function CalendarView({
  brandId,
  view,
  mondayKey,
  cards,
  attentionCards,
  campaigns,
}: {
  brandId: string;
  view: "week" | "month" | "list";
  mondayKey: string;
  cards: Card[];
  attentionCards: Card[];
  campaigns: Campaign[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [attentionCollapsed, setAttentionCollapsed] = useState(false);
  const [createFor, setCreateFor] = useState<{ date: string; isFeed: boolean } | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [csvReport, setCsvReport] = useState<{ added: number; errors: string[] } | null>(null);
  const [, startTransition] = useTransition();
  const csvInputRef = useRef<HTMLInputElement>(null);

  const monday = fromKey(mondayKey);

  function navigate(next: { view?: string; week?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.view) params.set("view", next.view);
    if (next.week) params.set("week", next.week);
    router.push(`${pathname}?${params.toString()}`);
  }

  function jumpToWeek(dateKey: string) {
    navigate({ view: "week", week: toKey(mondayOf(fromKey(dateKey))) });
  }

  async function onCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    startTransition(async () => {
      const report = await importCalendarCsv(brandId, text);
      setCsvReport(report);
    });
    if (csvInputRef.current) csvInputRef.current.value = "";
  }

  const attentionItems = useMemo(() => {
    return attentionCards
      .filter((c) => !c.attentionDismissedAt)
      .map((c) => ({ card: c, late: cardIsLate(c), soon: cardIsDueSoon(c) }))
      .filter((it) => it.late || it.soon)
      .sort((a, b) => (a.late !== b.late ? (a.late ? -1 : 1) : a.card.date < b.card.date ? -1 : a.card.date > b.card.date ? 1 : 0));
  }, [attentionCards]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => navigate({ week: toKey(addDays(monday, -7)) })} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">
          ←
        </button>
        <h2 className="min-w-[140px] text-sm font-semibold text-zinc-900">{view === "week" ? fmtRange(monday) : monday.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h2>
        <button onClick={() => navigate({ week: toKey(addDays(monday, 7)) })} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">
          →
        </button>
        <button onClick={() => navigate({ week: toKey(mondayOf(new Date())) })} className="rounded-md border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50">
          Aujourd&apos;hui
        </button>

        <div className="ml-2 flex rounded-md border border-zinc-300 p-0.5 text-sm">
          {(["week", "month", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => navigate({ view: v })}
              className={`rounded px-2.5 py-1 ${view === v ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {v === "week" ? "Semaine" : v === "month" ? "Mois" : "Liste"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <input ref={csvInputRef} type="file" accept=".csv" onChange={onCsvSelected} className="hidden" id="csv-input" />
          <label htmlFor="csv-input" className="cursor-pointer rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            Importer CSV
          </label>
        </div>
      </div>

      {attentionItems.length > 0 && (
        <AttentionPanel
          items={attentionItems}
          collapsed={attentionCollapsed}
          onToggle={() => setAttentionCollapsed((v) => !v)}
          onJump={jumpToWeek}
          onDismiss={(id) => startTransition(() => dismissAttentionItem(id))}
          onDismissAll={() => startTransition(() => dismissAllAttentionItems(attentionItems.map((it) => it.card.id)))}
        />
      )}

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onStatus={(status) =>
            startTransition(() => bulkUpdateCalendarCards([...selected], { status: status as "Idée" | "En préparation" | "Prêt" | "Publié" }))
          }
          onResponsable={(responsable) => startTransition(() => bulkUpdateCalendarCards([...selected], { responsable }))}
          onDelete={() => {
            if (!confirm(`Supprimer ${selected.size} élément(s) ?`)) return;
            startTransition(() => bulkDeleteCalendarCards([...selected]));
            setSelected(new Set());
          }}
        />
      )}

      {view === "week" && (
        <WeekGrid
          monday={monday}
          cards={cards}
          campaigns={campaigns}
          selected={selected}
          onToggleSelect={(id) =>
            setSelected((prev) => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            })
          }
          onAdd={(date, isFeed) => setCreateFor({ date, isFeed })}
          onEdit={setEditing}
        />
      )}
      {view === "month" && <MonthGrid monthDate={monday} cards={cards} onDayClick={jumpToWeek} />}
      {view === "list" && <ListTable cards={cards} onEdit={setEditing} />}

      {createFor && <CreateCardModal brandId={brandId} date={createFor.date} isFeed={createFor.isFeed} onClose={() => setCreateFor(null)} />}
      {editing && <EditCardDrawer card={editing} onClose={() => setEditing(null)} />}
      {csvReport && <CsvReportModal report={csvReport} onClose={() => setCsvReport(null)} />}
    </div>
  );
}

function AttentionPanel({
  items,
  collapsed,
  onToggle,
  onJump,
  onDismiss,
  onDismissAll,
}: {
  items: { card: Card; late: boolean; soon: boolean }[];
  collapsed: boolean;
  onToggle: () => void;
  onJump: (dateKey: string) => void;
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
}) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50">
      <div className="flex cursor-pointer items-center gap-2 px-4 py-2.5" onClick={onToggle}>
        <span className="text-sm font-semibold text-amber-900">
          À traiter — {items.length} élément{items.length > 1 ? "s" : ""}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismissAll();
          }}
          className="ml-auto text-xs font-medium text-amber-700 hover:underline"
        >
          Tout ignorer
        </button>
        <span className="text-amber-700">{collapsed ? "▸" : "▾"}</span>
      </div>
      {!collapsed && (
        <div className="flex flex-col gap-1.5 border-t border-amber-200 px-4 py-2">
          {items.slice(0, 8).map(({ card, late }) => (
            <div key={card.id} className="flex items-center gap-2 py-1 text-xs">
              <span className={`shrink-0 rounded-full px-2 py-0.5 font-medium ${late ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                {late ? "En retard" : "Bientôt"}
              </span>
              <span className="w-10 shrink-0 text-zinc-500">{card.date.slice(8, 10)}/{card.date.slice(5, 7)}</span>
              <span className="flex-1 truncate font-medium text-zinc-800">{card.title}</span>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLORS[card.status] ?? "#999" }} />
              <button onClick={() => onJump(card.date)} className="shrink-0 rounded border border-zinc-300 bg-white px-2 py-0.5 text-[11px] hover:bg-zinc-50">
                Voir
              </button>
              <button onClick={() => onDismiss(card.id)} className="shrink-0 text-zinc-400 hover:text-red-600">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BulkBar({
  count,
  onStatus,
  onResponsable,
  onDelete,
}: {
  count: number;
  onStatus: (s: string) => void;
  onResponsable: (r: string) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-300 bg-zinc-50 px-4 py-2">
      <span className="text-sm font-semibold text-zinc-700">{count} sélectionné(s)</span>
      <div className="flex items-center gap-2">
        <select defaultValue="" onChange={(e) => e.target.value && onStatus(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
          <option value="">Statut...</option>
          {CARD_STATUS_OPTIONS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select defaultValue="" onChange={(e) => e.target.value && onResponsable(e.target.value)} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
          <option value="">Responsable...</option>
          {RESPONSABLE_OPTIONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <button onClick={onDelete} className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
          Supprimer
        </button>
      </div>
    </div>
  );
}

function WeekGrid({
  monday,
  cards,
  campaigns,
  selected,
  onToggleSelect,
  onAdd,
  onEdit,
}: {
  monday: Date;
  cards: Card[];
  campaigns: Campaign[];
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onAdd: (date: string, isFeed: boolean) => void;
  onEdit: (card: Card) => void;
}) {
  const [, startTransition] = useTransition();
  const today = todayKey();

  return (
    <div className="grid grid-cols-1 gap-3 overflow-x-auto sm:grid-cols-2 lg:grid-cols-7">
      {Array.from({ length: 7 }).map((_, i) => {
        const d = addDays(monday, i);
        const key = toKey(d);
        const isHoliday = !!HOLIDAYS[key];
        const isToday = key === today;
        const dayCards = cards.filter((c) => c.date === key);
        const feedCards = dayCards.filter((c) => c.kind === "Feed");
        const storyCards = dayCards.filter((c) => c.kind !== "Feed");
        const activeCamp = activeCampaignFor(key, campaigns);

        function handleDrop(e: React.DragEvent, isFeedZone: boolean) {
          e.preventDefault();
          const data = e.dataTransfer.getData("text/plain");
          if (!data) return;
          const [cardId, kind] = data.split("::");
          const movedIsFeed = kind === "Feed";
          if (movedIsFeed !== isFeedZone) return;
          startTransition(() => moveCalendarCard(cardId, key));
        }

        return (
          <div key={key} className={`flex min-w-[180px] flex-col rounded-lg border p-2 ${isHoliday ? "border-amber-300 bg-amber-50" : "border-zinc-200 bg-white"}`}>
            <div className="mb-2 flex items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${isToday ? "bg-zinc-900 text-white" : "text-zinc-700"}`}>
                {key.slice(8, 10)}
              </span>
              <span className="text-xs font-medium text-zinc-500">{DAY_NAMES[i]}</span>
            </div>
            {isHoliday && <div className="mb-1.5 text-[10px] font-medium text-amber-700">{HOLIDAYS[key]}</div>}
            {activeCamp && <div className="mb-1.5 truncate rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white">{activeCamp.name}</div>}

            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Feed</div>
            <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, true)} className="flex min-h-[8px] flex-col gap-1.5">
              {feedCards.map((c) => (
                <CardTile key={c.id} card={c} selected={selected.has(c.id)} onToggleSelect={() => onToggleSelect(c.id)} onEdit={() => onEdit(c)} />
              ))}
            </div>
            <button onClick={() => onAdd(key, true)} className="my-1 rounded border border-dashed border-zinc-300 py-1 text-[11px] text-zinc-500 hover:bg-zinc-50">
              + Post
            </button>

            <hr className="my-1.5 border-zinc-100" />

            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Stories</div>
            <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, false)} className="flex min-h-[8px] flex-col gap-1.5">
              {storyCards.map((c) => (
                <CardTile key={c.id} card={c} selected={selected.has(c.id)} onToggleSelect={() => onToggleSelect(c.id)} onEdit={() => onEdit(c)} />
              ))}
            </div>
            <button onClick={() => onAdd(key, false)} className="mt-1 rounded border border-dashed border-zinc-300 py-1 text-[11px] text-zinc-500 hover:bg-zinc-50">
              + Story
            </button>
          </div>
        );
      })}
    </div>
  );
}

function CardTile({ card, selected, onToggleSelect, onEdit }: { card: Card; selected: boolean; onToggleSelect: () => void; onEdit: () => void }) {
  const [, startTransition] = useTransition();
  const late = cardIsLate(card);
  const soon = cardIsDueSoon(card);
  const checklist = checklistOf(card);
  const doneCount = checklist.filter(Boolean).length;
  const accent = CAT_COLORS[card.category] ?? "#9AA2AF";

  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", `${card.id}::${card.kind}`)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input, a")) return;
        onEdit();
      }}
      className={`relative cursor-pointer rounded-md border-l-4 bg-white p-2 text-xs shadow-sm ${soon ? "ring-1 ring-amber-300" : ""}`}
      style={{ borderLeftColor: accent }}
    >
      <div className="mb-1 flex items-start justify-between gap-1">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} className="h-3.5 w-3.5" />
        <div className="flex gap-1">
          <button title="Dupliquer" onClick={() => startTransition(() => duplicateCalendarCard(card.id))} className="text-zinc-400 hover:text-zinc-700">
            ⧉
          </button>
          <button
            title="Supprimer"
            onClick={() => {
              if (!confirm("Supprimer ce contenu ?")) return;
              startTransition(() => deleteCalendarCard(card.id));
            }}
            className="text-zinc-400 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      </div>
      {card.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image} alt="" className="mb-1 h-14 w-full rounded object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
      )}
      <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">{card.kind}</div>
      <div className="mb-0.5 font-medium text-zinc-900">{card.title}</div>
      {card.format && <div className="mb-1 text-zinc-500">{card.format}</div>}
      {late && <span className="mb-1 inline-block rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">En retard</span>}
      {card.kind === "Feed" && (
        <div className="mb-1 flex items-center gap-0.5">
          {checklist.map((done, i) => (
            <span
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                startTransition(() => toggleCalendarCardChecklistItem(card.id, i));
              }}
              className={`h-2.5 w-2.5 cursor-pointer rounded-full border ${done ? "border-emerald-600 bg-emerald-500" : "border-zinc-300"}`}
            />
          ))}
          <span className="ml-1 text-[9px] text-zinc-400">{doneCount}/3</span>
        </div>
      )}
      {card.link && (
        <a href={card.link} target="_blank" rel="noreferrer" className="mb-1 block truncate text-[10px] text-blue-600 hover:underline">
          Lien
        </a>
      )}
      <div className="mt-1 flex items-center justify-between">
        <span
          onClick={(e) => {
            e.stopPropagation();
            startTransition(() => cycleCalendarCardStatus(card.id));
          }}
          title="Cliquer pour changer le statut"
          className="flex cursor-pointer items-center gap-1"
        >
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[card.status] ?? "#999" }} />
          <span className="text-[10px] text-zinc-500">{card.status}</span>
        </span>
        <span
          className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
          style={{ backgroundColor: AVATAR_COLORS[card.responsable] ?? "#9AA2AF" }}
          title={card.responsable}
        >
          {avatarInitials(card.responsable)}
        </span>
      </div>
    </div>
  );
}

function MonthGrid({ monthDate, cards, onDayClick }: { monthDate: Date; cards: Card[]; onDayClick: (dateKey: string) => void }) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const gridStart = mondayOf(first);
  const today = todayKey();
  const cells = Array.from({ length: 42 }).map((_, i) => addDays(gridStart, i));

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {DAY_NAMES.map((d) => (
        <div key={d} className="px-1 text-center text-[11px] font-semibold text-zinc-400">
          {d.slice(0, 3)}
        </div>
      ))}
      {cells.map((d) => {
        const key = toKey(d);
        const inMonth = d.getMonth() === monthDate.getMonth();
        const dayCards = cards.filter((c) => c.date === key);
        return (
          <button
            key={key}
            onClick={() => onDayClick(key)}
            className={`flex min-h-[64px] flex-col items-start rounded-md border p-1.5 text-left ${inMonth ? "border-zinc-200 bg-white" : "border-transparent bg-zinc-50 text-zinc-300"} ${key === today ? "ring-2 ring-zinc-900" : ""}`}
          >
            <span className="text-xs font-medium">{d.getDate()}</span>
            {dayCards.length > 0 && (
              <span className="mt-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">{dayCards.length}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ListTable({ cards, onEdit }: { cards: Card[]; onEdit: (card: Card) => void }) {
  const sorted = [...cards].sort((a, b) => a.date.localeCompare(b.date));
  if (!sorted.length) return <p className="text-sm text-zinc-500">Aucun contenu ce mois-ci.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Titre</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Responsable</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} onClick={() => onEdit(c)} className="cursor-pointer border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
              <td className="px-3 py-2 text-zinc-500">{c.date.slice(8, 10)}/{c.date.slice(5, 7)}</td>
              <td className="px-3 py-2 text-zinc-500">{c.kind}</td>
              <td className="px-3 py-2 font-medium text-zinc-900">{c.title}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[c.status] ?? "#999" }} />
                  {c.status}
                </span>
              </td>
              <td className="px-3 py-2 text-zinc-500">{c.responsable}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreateCardModal({ brandId, date, isFeed, onClose }: { brandId: string; date: string; isFeed: boolean; onClose: () => void }) {
  const options = TYPE_OPTIONS.filter((o) => (isFeed ? o.value.startsWith("Feed|") : !o.value.startsWith("Feed|")));
  const [typeKey, setTypeKey] = useState<string>(options[0]?.value ?? "");
  const [contentType, setContentType] = useState<(typeof CONTENT_TYPES)[number]>("Photo");
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("");
  const [cta, setCta] = useState("");
  const [image, setImage] = useState("");
  const [link, setLink] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [recurCount, setRecurCount] = useState(4);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const [kind, category] = typeKey.split("|") as [string, string];
    startTransition(async () => {
      await createCalendarCard({
        brandId,
        date,
        kind: kind as "Feed" | "Story 1" | "Story 2" | "Story 3",
        category,
        contentType,
        title,
        format,
        cta,
        brandName: null,
        image,
        link,
        recurWeeks: recurring ? Math.max(1, recurCount) : 0,
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">Nouveau {isFeed ? "post" : "story"}</h3>
        <div className="flex flex-col gap-3">
          <Field label="Type">
            <select value={typeKey} onChange={(e) => setTypeKey(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type de contenu">
            <select value={contentType} onChange={(e) => setContentType(e.target.value as (typeof CONTENT_TYPES)[number])} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {CONTENT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Titre / Axe">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Nouveau modèle running" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Format">
            <input value={format} onChange={(e) => setFormat(e.target.value)} placeholder="Ex: Carousel" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="CTA">
            <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Ex: Swipe up / Shop Now" className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Image (URL, optionnel)">
            <input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Lien (optionnel)">
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
            <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            Répéter chaque semaine
          </label>
          {recurring && (
            <Field label="Combien de semaines en plus de celle-ci">
              <input type="number" min={1} max={52} value={recurCount} onChange={(e) => setRecurCount(parseInt(e.target.value, 10) || 1)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
            </Field>
          )}
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

function EditCardDrawer({ card, onClose }: { card: Card; onClose: () => void }) {
  const [title, setTitle] = useState(card.title);
  const [format, setFormat] = useState(card.format ?? "");
  const [cta, setCta] = useState(card.cta ?? "");
  const [status, setStatus] = useState(card.status);
  const [responsable, setResponsable] = useState(card.responsable);
  const [note, setNote] = useState(card.note ?? "");
  const [image, setImage] = useState(card.image ?? "");
  const [link, setLink] = useState(card.link ?? "");
  const [checklist, setChecklist] = useState<boolean[]>(checklistOf(card));
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      await updateCalendarCard(card.id, { title, format, cta, status: status as "Idée" | "En préparation" | "Prêt" | "Publié", responsable, note, image, link, checklist });
      onClose();
    });
  }

  function del() {
    if (!confirm("Supprimer ce contenu ?")) return;
    startTransition(async () => {
      await deleteCalendarCard(card.id);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">{card.kind}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Titre / Axe">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Format">
            <input value={format} onChange={(e) => setFormat(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="CTA">
            <input value={cta} onChange={(e) => setCta(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Statut">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {CARD_STATUS_OPTIONS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Responsable">
            <select value={responsable} onChange={(e) => setResponsable(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {RESPONSABLE_OPTIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Note">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Image (URL, optionnel)">
            <input value={image} onChange={(e) => setImage(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Lien">
            <input value={link} onChange={(e) => setLink(e.target.value)} className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm" />
          </Field>
          {card.kind === "Feed" && (
            <Field label="Checklist">
              <div className="flex flex-col gap-1">
                {["Shooting", "Montage", "Caption"].map((lbl, i) => (
                  <label key={lbl} className="flex items-center gap-2 text-sm font-normal text-zinc-700">
                    <input
                      type="checkbox"
                      checked={checklist[i]}
                      onChange={(e) => setChecklist((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))}
                    />
                    {lbl}
                  </label>
                ))}
              </div>
            </Field>
          )}
        </div>
        <div className="mt-5 flex items-center justify-between">
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

function CsvReportModal({ report, onClose }: { report: { added: number; errors: string[] }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 font-semibold text-zinc-900">Rapport d&apos;import CSV</h3>
        <p className="mb-2 text-sm text-zinc-700">
          {report.added} ligne(s) importée(s){report.errors.length ? `, ${report.errors.length} ligne(s) ignorée(s) :` : "."}
        </p>
        {report.errors.length > 0 && (
          <div className="max-h-60 overflow-y-auto rounded-md bg-red-50 p-3 text-xs leading-6 text-red-700">
            {report.errors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white">
            Fermer
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
