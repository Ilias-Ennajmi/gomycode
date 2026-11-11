import { UserButton } from "@clerk/nextjs";
import { BrandSwitcher } from "@/components/brand-switcher";
import { NavTabs } from "@/components/nav-tabs";
import { listBrands } from "@/lib/actions/brands";
import { getPrefs } from "@/lib/actions/prefs";

// Every page here is per-user, DB-backed content behind Clerk auth — never
// worth statically prerendering, and prerendering would try to hit Postgres
// at build time with no request context.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [brands, prefs] = await Promise.all([listBrands(), getPrefs()]);
  const initialSlug = brands.find((b) => b.id === prefs.activeBrandId)?.slug;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
          <span className="text-lg font-semibold tracking-tight text-zinc-900">
            Planet Sport <span className="font-normal text-zinc-400">/ Content Studio</span>
          </span>
          <NavTabs />
          <div className="ml-auto flex items-center gap-3">
            <BrandSwitcher brands={brands} initialSlug={initialSlug} />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-6">{children}</main>
    </div>
  );
}
