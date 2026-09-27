import { NextRequest, NextResponse } from "next/server";
import { runAiPipeline } from "@/lib/enrich";
import { mapWithConcurrency } from "@/lib/ingest";
import { FollowError, followSource, type FollowInput } from "@/lib/follow";
import { isDesk } from "@/lib/news/desks";

export const maxDuration = 60;

interface FollowItem {
  url: string;
  kind?: FollowInput["kind"];
  lang?: string;
  category?: string;
  title?: string;
  newsDesk?: string;
  region?: string;
}

// Follows one or many sources (e.g. "Follow all" in a category). Something
// already followed counts as success.
export async function POST(request: NextRequest) {
  try {
    const { items } = (await request.json()) as { items?: FollowItem[] };
    const valid = (items ?? []).filter((i) => typeof i?.url === "string").slice(0, 30);
    if (valid.length === 0) {
      return NextResponse.json({ error: "Nothing to follow" }, { status: 400 });
    }

    const results = await mapWithConcurrency(valid, 4, async (item) => {
      try {
        const { feed, existed } = await followSource(
          {
            url: item.url,
            kind: item.kind,
            language: item.lang,
            categoryName: item.category,
            title: item.title,
            newsDesk: isDesk(item.newsDesk) ? item.newsDesk : null,
            region: item.region === "ma" ? "ma" : null,
          },
          { allowExisting: true }
        );
        return {
          url: item.url,
          ok: true,
          feedId: feed.id,
          title: feed.title,
          categoryId: feed.categoryId,
          existed,
        };
      } catch (error) {
        if (!(error instanceof FollowError)) console.error(`Follow failed for ${item.url}`, error);
        const message =
          error instanceof FollowError ? error.message : "Something went wrong saving this source";
        const code = error instanceof FollowError ? error.code : undefined;
        return { url: item.url, ok: false, error: message, code };
      }
    });

    if (results.some((r) => r.ok && !r.existed)) await runAiPipeline();
    return NextResponse.json({ results });
  } catch (error) {
    console.error("POST /api/discover/follow failed", error);
    return NextResponse.json({ error: "Could not follow" }, { status: 500 });
  }
}
