import { CalendarView } from "@/components/calendar-view";
import { listAttentionCandidates, listCalendarCardsInRange } from "@/lib/actions/calendar";
import { listBrands, resolveActiveBrand } from "@/lib/actions/brands";
import { listCampaigns } from "@/lib/actions/campaigns";
import { addDays, mondayOf, toKey } from "@/lib/date";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; view?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const brands = await listBrands();
  const activeBrand = await resolveActiveBrand(sp.brand, brands);

  if (!activeBrand) {
    return <p className="text-sm text-zinc-500">Aucune marque configurée. Lancez d&apos;abord la migration SQL fournie.</p>;
  }

  const view = (sp.view === "month" || sp.view === "list" ? sp.view : "week") as "week" | "month" | "list";
  const monday = mondayOf(sp.week ? new Date(sp.week + "T00:00:00") : new Date());
  const mondayKey = toKey(monday);
  const sundayKey = toKey(addDays(monday, 6));

  // Week view only needs the 7-day window; month/list scan the whole
  // calendar month that the selected week falls in.
  const monthFirst = toKey(new Date(monday.getFullYear(), monday.getMonth(), 1));
  const monthLast = toKey(new Date(monday.getFullYear(), monday.getMonth() + 1, 0));
  const [rangeStart, rangeEnd] = view === "week" ? [mondayKey, sundayKey] : [monthFirst, monthLast];

  const [rangeCards, attentionCards, campaigns] = await Promise.all([
    listCalendarCardsInRange(activeBrand.id, rangeStart, rangeEnd),
    listAttentionCandidates(activeBrand.id),
    listCampaigns(),
  ]);

  return (
    <CalendarView
      brandId={activeBrand.id}
      view={view}
      mondayKey={mondayKey}
      cards={rangeCards}
      attentionCards={attentionCards}
      campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, start: c.start, end: c.end }))}
    />
  );
}
