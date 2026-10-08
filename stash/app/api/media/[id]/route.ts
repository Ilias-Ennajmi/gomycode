import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { videoLink } from "@/lib/r2";

/**
 * The player's video URL. Checks the save belongs to the caller (RLS), then
 * redirects to a short-lived signed link on R2, so videos are never public.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });

  const supabase = await getServerClient();
  const { data } = await supabase.from("saves").select("video_path").eq("id", id).maybeSingle();
  if (!data?.video_path) return new NextResponse(null, { status: 404 });

  const link = videoLink(data.video_path);
  if (!link) return new NextResponse(null, { status: 503 });

  return NextResponse.redirect(link, {
    status: 302,
    // The signed link lasts 6 hours; let the phone reuse the redirect for one.
    headers: { "Cache-Control": "private, max-age=3600" },
  });
}
