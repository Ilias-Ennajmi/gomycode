// Deploy with verify_jwt = false: the worker has no JWT, it shows the wake-up token instead.
import { adminClient, env, supabaseUrl } from "../_shared/clients.ts";
import { embed } from "../_shared/embed.ts";
import { makeHandler } from "./handler.ts";

Deno.serve(makeHandler({
  supabaseUrl: supabaseUrl(),
  serviceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
  anonKey: env("SUPABASE_ANON_KEY"),
  fetch,
  embed,
  async signUpload(bucket, path) {
    const { data, error } = await adminClient().storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
    if (error || !data) throw new Error("sign-upload failed");
    return { url: data.signedUrl, token: data.token, path: data.path };
  },
  async signDownload(bucket, path, expiresIn) {
    const { data, error } = await adminClient().storage.from(bucket).createSignedUrl(path, expiresIn);
    if (error || !data) throw new Error("sign-download failed");
    return data.signedUrl;
  },
  async remove(bucket, paths) {
    const { data, error } = await adminClient().storage.from(bucket).remove(paths);
    if (error) throw new Error("remove failed");
    return data?.length ?? 0;
  },
}));
