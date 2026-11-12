import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { claimsAreOwner, isLocalOnly, type OwnerClaims } from "@/lib/server/owner";
import { safeNextPath } from "@/lib/server/next-path";
import { createServerClient } from "@/lib/supabase/server";
import { NOT_OWNER_MESSAGE } from "./messages";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(first(params.next));

  // Nothing to sign in to without accounts; already signed in as the owner: carry on.
  if (isLocalOnly()) redirect(next);
  const supabase = await createServerClient();
  if (supabase) {
    const { data } = await supabase.auth.getClaims();
    if (claimsAreOwner(data?.claims as OwnerClaims | undefined)) redirect(next);
  }

  const initialError = first(params.error) === "not-owner" ? NOT_OWNER_MESSAGE : undefined;

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
          <h1 className="mb-1 text-(length:--text-xl) font-semibold text-fg">Sign in</h1>
          <p className="mb-6 text-(length:--text-sm) text-fg-muted">Atelier is private. Use the owner account.</p>
          <LoginForm next={next} initialError={initialError} />
        </div>
      </div>
    </main>
  );
}
