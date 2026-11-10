import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

/**
 * A short-lived signed link to a finished export file. The export row is read
 * as the caller (RLS), and only files inside the caller's own folder are signed.
 * `?ext=docx` picks another file of the same export (a brief has pdf + docx).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const ext = request.nextUrl.searchParams.get("ext");
  if (ext && !/^[a-z]{2,5}$/.test(ext)) return NextResponse.json({ error: "bad ext" }, { status: 400 });

  const supabase = await getServerClient();
  const { data: auth } = await supabase.auth.getClaims();
  const uid = auth?.claims?.sub;
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase.from("exports").select("status,file_path,files").eq("id", id).maybeSingle();
  if (!data || data.status !== "ready") return NextResponse.json({ error: "not ready" }, { status: 404 });

  const files =
    data.files && typeof data.files === "object" && !Array.isArray(data.files) ? (data.files as Record<string, unknown>) : {};
  const path = ext ? files[ext] : data.file_path;
  if (typeof path !== "string" || !path.startsWith(`${uid}/`)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: signed, error } = await supabase.storage.from("stash-exports").createSignedUrl(path, 600);
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  return NextResponse.json({ url: signed.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
}
