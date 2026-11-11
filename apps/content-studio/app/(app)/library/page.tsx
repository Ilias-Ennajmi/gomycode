import { LibraryView } from "@/components/library-view";
import { listAssets } from "@/lib/actions/assets";
import { listBrands } from "@/lib/actions/brands";

export default async function LibraryPage() {
  const [brands, assets] = await Promise.all([listBrands(), listAssets()]);

  return <LibraryView brands={brands} assets={assets} />;
}
