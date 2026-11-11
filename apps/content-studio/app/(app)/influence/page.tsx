import { InfluenceView } from "@/components/influence-view";
import { listCampaigns } from "@/lib/actions/campaigns";
import { listInfluencers } from "@/lib/actions/influence";

export default async function InfluencePage() {
  const [influencers, campaigns] = await Promise.all([listInfluencers(), listCampaigns()]);
  return <InfluenceView influencers={influencers} campaigns={campaigns.map((c) => ({ id: c.id, name: c.name }))} />;
}
