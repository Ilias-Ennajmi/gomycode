import { NextResponse, type NextRequest } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

/**
 * Search across what was said, the caption and the AI's reading. With a
 * VOYAGE_API_KEY the query is also embedded, so "that reel about luxury
 * pricing" finds saves that never use those exact words. Runs with the
 * caller's session, so RLS keeps results private.
 */
export async function POST(request: NextRequest) {
  let body: { q?: unknown; spaceId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const q = typeof body.q === "string" ? body.q.trim().slice(0, 200) : "";
  const spaceId = typeof body.spaceId === "string" && /^[0-9a-f-]{36}$/i.test(body.spaceId) ? body.spaceId : null;
  if (!q) return NextResponse.json({ results: [] });

  const supabase = await getServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: "no session" }, { status: 401 });

  let embedding: string | null = null;
  const key = process.env.VOYAGE_API_KEY;
  if (key) {
    try {
      const r = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          input: [q],
          model: process.env.VOYAGE_MODEL || "voyage-3.5-lite",
          input_type: "query",
          output_dimension: 1024,
        }),
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) {
        const json = (await r.json()) as { data?: { embedding?: number[] }[] };
        const vec = json.data?.[0]?.embedding;
        if (vec?.length === 1024) embedding = `[${vec.join(",")}]`;
      }
    } catch {
      // Search by words still works without the meaning part.
    }
  }

  const { data, error } = await supabase.rpc("search_saves", {
    p_query: q,
    p_space_id: spaceId,
    p_embedding: embedding,
    p_limit: 40,
  });
  if (error) return NextResponse.json({ error: "search failed" }, { status: 500 });
  return NextResponse.json(
    {
      results: (data ?? []).map((r) => ({
        saveId: r.save_id,
        snippet: r.snippet,
        start: r.snippet_start,
      })),
      byMeaning: Boolean(embedding),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
