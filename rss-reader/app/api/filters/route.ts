import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFilterRules } from "@/lib/filters";

const ACTIONS = ["hide", "boost"] as const;
const MATCHES = ["keyword", "feed"] as const;

export async function GET() {
  try {
    return NextResponse.json({ rules: await getFilterRules() });
  } catch (error) {
    console.error("GET /api/filters failed", error);
    return NextResponse.json({ error: "Failed to load filters" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, match, value } = body as { action?: string; match?: string; value?: string };

    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return NextResponse.json({ error: "action must be hide or boost" }, { status: 400 });
    }
    if (!MATCHES.includes(match as (typeof MATCHES)[number])) {
      return NextResponse.json({ error: "match must be keyword or feed" }, { status: 400 });
    }
    if (typeof value !== "string" || !value.trim()) {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }

    // Keywords may be entered comma-separated: "crypto, NFT".
    const values =
      match === "keyword"
        ? Array.from(new Set(value.split(",").map((v) => v.trim()).filter(Boolean)))
        : [value.trim()];

    if (match === "feed") {
      const feed = await prisma.feed.findUnique({ where: { id: values[0] } });
      if (!feed) return NextResponse.json({ error: "Feed not found" }, { status: 404 });
    }

    await prisma.filterRule.createMany({
      data: values.map((v) => ({
        action: action as (typeof ACTIONS)[number],
        match: match as (typeof MATCHES)[number],
        value: v,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ rules: await getFilterRules() }, { status: 201 });
  } catch (error) {
    console.error("POST /api/filters failed", error);
    return NextResponse.json({ error: "Failed to save filter" }, { status: 500 });
  }
}
