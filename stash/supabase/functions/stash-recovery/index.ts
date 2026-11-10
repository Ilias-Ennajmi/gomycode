// Deploy with verify_jwt = false: `restore` is called by a phone that has no session yet.
// `create` checks the caller's JWT itself (auth.getUser).
import { liveUserIdFromToken } from "../_shared/auth.ts";
import { adminClient, anonClient, rateLimitTake } from "../_shared/clients.ts";
import { makeHandler } from "./handler.ts";

const stash = () => adminClient().schema("stash");

Deno.serve(makeHandler({
  userId: liveUserIdFromToken,
  rateLimitTake,
  async setCredentials(uid, email, password) {
    // Admin update: applied directly, no confirmation mail. email_confirm marks the synthetic
    // address as confirmed so the password sign-in in `restore` is accepted.
    const { error } = await adminClient().auth.admin.updateUserById(uid, { email, password, email_confirm: true });
    if (error) console.error("stash-recovery updateUserById", error.status ?? 0, error.code ?? error.name);
    return !error;
  },
  async recoverySet(uid, lookup) {
    const { error } = await stash().rpc("recovery_set", { p_user_id: uid, p_lookup: lookup });
    if (error) throw new Error("recovery_set failed");
  },
  async recoveryFind(lookup) {
    const { data, error } = await stash().rpc("recovery_find", { p_lookup: lookup });
    if (error) throw new Error("recovery_find failed");
    return typeof data === "string" ? data : null;
  },
  async emailOf(uid) {
    const { data, error } = await adminClient().auth.admin.getUserById(uid);
    return error ? null : data.user?.email ?? null;
  },
  async signIn(email, password) {
    const { data, error } = await anonClient().auth.signInWithPassword({ email, password });
    if (error || !data.session || !data.user) return null;
    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at ?? null,
      user_id: data.user.id,
    };
  },
}));
