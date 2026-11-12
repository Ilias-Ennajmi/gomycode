"use server";

import { redirect } from "next/navigation";
import { claimsAreOwner, isLocalOnly, type OwnerClaims } from "@/lib/server/owner";
import { safeNextPath } from "@/lib/server/next-path";
import { createServerClient } from "@/lib/supabase/server";

export type VerifyState = { error?: string };

const BAD_CODE = "That code didn't work. Check the 6 digits and try again.";

export async function verifyCode(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const next = safeNextPath(formData.get("next"));
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6 digits from your authenticator app." };

  if (isLocalOnly()) redirect(next);
  const supabase = await createServerClient();
  if (!supabase) redirect("/login");

  // Only the owner's own half-signed-in session may answer a challenge.
  const { data } = await supabase.auth.getClaims();
  if (!claimsAreOwner(data?.claims as OwnerClaims | undefined)) redirect("/login");

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: "Couldn't check your code just now. Try again in a moment." };
  const factor = factors?.totp?.[0];
  if (!factor) redirect(next); // nothing to verify any more

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    const rateLimited = error.status === 429 || error.code === "over_request_rate_limit";
    return { error: rateLimited ? error.message : BAD_CODE };
  }
  redirect(next);
}

/** "Use a different account": ends this browser's session and returns to the login page. */
export async function signOut(): Promise<void> {
  const supabase = await createServerClient();
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
