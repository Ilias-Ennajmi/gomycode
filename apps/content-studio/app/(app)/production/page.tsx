import { KanbanView } from "@/components/kanban-view";
import { listBrands } from "@/lib/actions/brands";
import { listCampaigns } from "@/lib/actions/campaigns";
import { listProductionCards } from "@/lib/actions/production";

export default async function ProductionPage() {
  const [cards, brands, campaigns] = await Promise.all([listProductionCards(), listBrands(), listCampaigns()]);
  return <KanbanView cards={cards} brands={brands} campaigns={campaigns} />;
}
