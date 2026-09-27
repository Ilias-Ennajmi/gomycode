import { NextResponse } from "next/server";
import { buildFrontPage } from "@/lib/news/front-page";
import { readNewsPrefs } from "@/lib/news/prefs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const prefs = await readNewsPrefs();
    const page = await buildFrontPage(prefs.hidden);
    // Headlines are only for the insights endpoint.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { headlines, ...rest } = page;
    return NextResponse.json({ ...rest, hidden: prefs.hidden });
  } catch (error) {
    console.error("GET /api/news failed", error);
    return NextResponse.json({ error: "Could not load the news" }, { status: 500 });
  }
}
