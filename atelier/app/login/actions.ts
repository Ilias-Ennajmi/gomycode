"use server";

import { redirect } from "next/navigation";
import { checkSecondFactor } from "@/lib/server/mfa";
import { isLocalOnly, isOwnerId } from "@/lib/server/owner";
import { safeNextPath } from "@/lib/server/next-path";
import { createServerClient } from "@/lib/supabase/server";
import { NOT_OWNER_MESSAGE } from "./messages";

export type SignInState = {
  error?: string;
  /** Which field the error belongs to; anything else shows under the password field. */
  field?: "email" | "password";
  /** Kept so the email survives a failed attempt. */
  email?: string;
};

const BAD_CREDENTIALS = "That email and password don't match.";
const TRY_AGAIN = "Couldn't sign in just now. Try again in a moment.";

function isRateLimit(error: { status?: number; code?: string }) {
  return error.status === 429 || error.code === "over_request_rate_limit";
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(formData.get("next"));

  if (!email) return { error: "Enter your email address.", field: "email" };
  if (!password) return { error: "Enter your password.", field: "password", email };

  // Local-only mode has no accounts: the login page just steps aside.
  if (isLocalOnly()) redirect(next);

  const supabase = await createServerClient();
  if (!supabase) return { error: "Sign-in isn't set up on this server.", email };

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // Wait-and-retry messages are passed on as they are; everything else stays generic.
    if (error && isRateLimit(error)) return { error: error.message, email };
    if (error?.code === "invalid_credentials") return { error: BAD_CREDENTIALS, email };
    return { error: TRY_AGAIN, email };
  }

  // A correct password is not enough: only the owner's account may open Atelier.
  if (data.user.is_anonymous === true || !isOwnerId(data.user.id)) {
    await supabase.auth.signOut({ scope: "local" });
    return { error: NOT_OWNER_MESSAGE, email };
  }

  // Two-step verification: password accepted, now the code.
  const second = await checkSecondFactor(supabase);
  if (second === "needed") redirect(`/login/verify?next=${encodeURIComponent(next)}`);
  if (second === "error") {
    await supabase.auth.signOut({ scope: "local" });
    return { error: TRY_AGAIN, email };
  }

  redirect(next);
}
