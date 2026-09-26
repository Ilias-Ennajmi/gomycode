import { NextResponse } from "next/server";
import { getOrCreateDigest } from "@/lib/digest";
import { isAiEnabled } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    const digest = await getOrCreateDigest();
    return NextResponse.json({ enabled: isAiEnabled(), digest });
  } catch (error) {
    console.error("Daily digest failed", error);
    return NextResponse.json({ enabled: isAiEnabled(), digest: null });
  }
}
