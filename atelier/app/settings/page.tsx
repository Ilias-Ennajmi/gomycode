import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { isLocalOnly, requireOwner, responseFromError } from "@/lib/server/owner";
import { Security, type VerifiedFactor } from "./security";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  // Per-request: the answer depends on who is signed in, so it must never be prerendered at build.
  await connection();
  const localOnly = isLocalOnly();

  let factors: VerifiedFactor[] = [];
  if (!localOnly) {
    // The proxy already guards this page; asking again keeps it safe if a matcher ever changes.
    let owner: Awaited<ReturnType<typeof requireOwner>>;
    try {
      owner = await requireOwner();
    } catch (e) {
      const res = responseFromError(e);
      redirect(res.status === 401 ? "/login?next=%2Fsettings" : "/login?error=not-owner");
    }
    const { data } = await owner.supabase.auth.mfa.listFactors();
    // `totp` lists verified authenticator-app factors only.
    factors = (data?.totp ?? []).map((f) => ({ id: f.id, name: f.friendly_name ?? "Authenticator app" }));
  }

  return (
    <main className="mx-auto w-full max-w-2xl p-4 pb-12 sm:p-8">
      <Link
        href="/"
        className="mb-6 inline-flex min-h-11 items-center gap-2 text-(length:--text-sm) text-fg-muted hoverable:text-fg"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to boards
      </Link>
      <h1 className="mb-8 text-(length:--text-xl) font-semibold text-fg">Settings</h1>
      {localOnly ? (
        <section aria-labelledby="security-heading" className="rounded-lg bg-panel p-6 shadow-1">
          <h2 id="security-heading" className="mb-2 text-(length:--text-lg) font-semibold text-fg">
            Security
          </h2>
          <p className="text-fg-muted">
            Sign-in settings are not available in local-only mode, which has no account.
          </p>
        </section>
      ) : (
        <Security initialFactors={factors} />
      )}
    </main>
  );
}
