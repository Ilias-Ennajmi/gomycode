import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AiError, generateText, isAiEnabled } from "@/lib/ai";
import { buildFrontPage } from "@/lib/news/front-page";
import { readNewsPrefs } from "@/lib/news/prefs";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const KEY = "news-insights";
const FRESH_MS = 60 * 60 * 1000;

interface Insights {
  bullets: string[];
  generatedAt: string;
}

async function cachedInsights() {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  try {
    return row ? (JSON.parse(row.value) as Insights) : null;
  } catch {
    return null;
  }
}

// "What's happening": 3-4 AI bullets over the front page, refreshed hourly.
export async function GET() {
  if (!isAiEnabled()) return NextResponse.json({ bullets: [], disabled: true });
  const cached = await cachedInsights();
  if (cached && Date.now() - new Date(cached.generatedAt).getTime() < FRESH_MS) {
    return NextResponse.json(cached);
  }
  try {
    const page = await buildFrontPage((await readNewsPrefs()).hidden);
    if (page.headlines.length < 3) return NextResponse.json({ bullets: [] });
    const text = await generateText(
      `Today's top headlines, most covered first:\n${page.headlines.map((h) => `- ${h}`).join("\n")}`,
      {
        system:
          "You write the 'What's happening' box of a news app for a reader in Morocco who follows " +
          "Moroccan, European and world news. From the headlines, write 4 short bullets (max 28 words each) " +
          "on the most important developments: say what happened and why it matters, plainly, no hype. " +
          "Group headlines about the same story. Use only facts in the headlines. Write in English. " +
          'Reply with JSON: {"bullets": ["..."]}',
        json: true,
        maxTokens: 600,
      }
    );
    const parsed = (JSON.parse(text) as { bullets?: unknown }).bullets;
    const bullets = (Array.isArray(parsed) ? parsed : [])
      .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
      .slice(0, 5);
    const insights: Insights = { bullets, generatedAt: new Date().toISOString() };
    const value = JSON.stringify(insights);
    await prisma.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value },
      update: { value },
    });
    return NextResponse.json(insights);
  } catch (error) {
    // An older summary beats none when the free quota runs out.
    if (cached) return NextResponse.json({ ...cached, stale: true });
    const quota = error instanceof AiError && error.status === 429;
    if (!quota) console.error("GET /api/news/insights failed", error);
    return NextResponse.json({ bullets: [], error: quota ? "quota" : "failed" });
  }
}
