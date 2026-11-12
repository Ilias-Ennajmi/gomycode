import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { checkSecondFactor } from "@/lib/server/mfa";
import { claimsAreOwner, isLocalOnly, type OwnerClaims } from "@/lib/server/owner";
import { safeNextPath } from "@/lib/server/next-path";
import { createServerClient } from "@/lib/supabase/server";
import { buttonSecondary } from "@/components/ui/controls";
import { signOut } from "./actions";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Two-step verification" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNextPath(first((await searchParams).next));

  if (isLocalOnly()) redirect(next);
  const supabase = await createServerClient();
  if (!supabase) redirect("/login");

  const { data } = await supabase.auth.getClaims();
  if (!claimsAreOwner(data?.claims as OwnerClaims | undefined)) redirect("/login");

  // Nothing to verify (no factor, or already verified): carry on.
  if ((await checkSecondFactor(supabase)) === "ok") redirect(next);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Image
            className="lockup-light"
            src="/brand/atelier-lockup-light.svg"
            alt=""
            width={260}
            height={88}
            priority
            unoptimized
          />
          <Image
            className="lockup-dark"
            src="/brand/atelier-lockup-dark.svg"
            alt=""
            width={260}
            height={88}
            priority
            unoptimized
          />
        </div>
        <div className="rounded-lg bg-panel p-6 shadow-2">
          <h1 className="mb-1 text-(length:--text-xl) font-semibold text-fg">Two-step verification</h1>
          <p className="mb-6 text-(length:--text-sm) text-fg-muted">One more step to open Atelier.</p>
          <VerifyForm next={next} />
          <form action={signOut} className="mt-4">
            <button type="submit" className={`${buttonSecondary} w-full`}>
              Use a different account
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
