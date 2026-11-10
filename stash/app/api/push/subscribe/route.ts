import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getServerClient } from "@/lib/supabase/server";

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

const ok = (v: unknown, max: number): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

async function session() {
  if (!isSupabaseConfigured) return { error: NextResponse.json({ error: "Supabase isn't configured on this deployment." }, { status: 503 }) };
  const supabase = await getServerClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: NextResponse.json({ error: "no session" }, { status: 401 }) };
  return { supabase };
}

/** Saves this browser's push subscription for the signed-in identity. */
export async function POST(request: NextRequest) {
  const s = await session();
  if (s.error) return s.error;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!ok(body.endpoint, 1000) || !body.endpoint.startsWith("https://") || !ok(body.keys?.p256dh, 200) || !ok(body.keys?.auth, 100)) {
    return NextResponse.json({ error: "bad subscription" }, { status: 400 });
  }
  const { error } = await s.supabase.rpc("save_push_subscription", {
    p_endpoint: body.endpoint,
    p_p256dh: body.keys.p256dh,
    p_auth: body.keys.auth,
    p_user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
  });
  if (error) return NextResponse.json({ error: "couldn't save" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Forgets this browser's subscription (notifications off). */
export async function DELETE(request: NextRequest) {
  const s = await session();
  if (s.error) return s.error;
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!ok(body.endpoint, 1000)) return NextResponse.json({ error: "bad subscription" }, { status: 400 });
  const { error } = await s.supabase.from("push_subscriptions").delete().eq("endpoint", body.endpoint);
  if (error) return NextResponse.json({ error: "couldn't delete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
