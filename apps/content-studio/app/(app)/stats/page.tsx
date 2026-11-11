import { StatsView } from "@/components/stats-view";
import { listBrands, resolveActiveBrand } from "@/lib/actions/brands";
import { getBrandBreakdown, getContentStats } from "@/lib/actions/stats";

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const sp = await searchParams;
  const brands = await listBrands();
  const activeBrand = await resolveActiveBrand(sp.brand, brands);

  if (!activeBrand) {
    return <p className="text-sm text-zinc-500">Aucune marque configurée. Lancez d&apos;abord la migration SQL fournie.</p>;
  }

  const [brandRows, contentStats] = await Promise.all([getBrandBreakdown(), getContentStats(activeBrand.id)]);

  return <StatsView brandRows={brandRows} contentStats={contentStats} />;
}
