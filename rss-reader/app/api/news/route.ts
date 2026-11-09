import { NextResponse } from "next/server";
import { buildFrontPage } from "@/lib/news/front-page";
import { readNewsPrefs } from "@/lib/news/prefs";
import { reportProblem } from "@/lib/errlog";

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
    await reportProblem("GET /api/news", error);
    return NextResponse.json({ error: "Could not load the news" }, { status: 500 });
  }
}
