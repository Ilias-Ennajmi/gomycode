/** Authenticator assurance levels as Supabase reports them: aal1 = password, aal2 = password + code. */
export type AalLevels = { currentLevel: string | null; nextLevel: string | null };

/**
 * True when the person has a verified second factor (nextLevel aal2) but this session has not used
 * it yet (currentLevel is not aal2). Without a factor, nextLevel stays aal1 and nothing is asked.
 */
export function needsSecondFactor(aal: AalLevels): boolean {
  return aal.nextLevel === "aal2" && aal.currentLevel !== "aal2";
}

type AalClient = {
  auth: {
    mfa: {
      getAuthenticatorAssuranceLevel: () => Promise<{ data: AalLevels | null; error: unknown }>;
    };
  };
};

/**
 * Reads the session's levels (from the session cookie, no network) and answers "ok", "needed" (a
 * code is due) or "error" (could not tell). Callers treat "error" as closed, never as open.
 */
export async function checkSecondFactor(supabase: AalClient): Promise<"ok" | "needed" | "error"> {
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return "error";
    return needsSecondFactor(data) ? "needed" : "ok";
  } catch {
    return "error";
  }
}
