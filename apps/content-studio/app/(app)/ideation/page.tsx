import { IdeationView } from "@/components/ideation-view";
import { listIdeas } from "@/lib/actions/ideas";

export default async function IdeationPage() {
  const ideas = await listIdeas();
  return <IdeationView ideas={ideas} />;
}
