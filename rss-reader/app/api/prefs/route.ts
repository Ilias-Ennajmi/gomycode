import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// The reader's preferences, shared between devices. One Setting row holds a map of
// key → { v, at }; a device sends what it changed with the time it changed it, and the
// newer timestamp wins per key, so two devices editing different things never clobber.

const KEY = "prefs";
const MAX_BYTES = 200_000;

interface Entry {
  v: unknown;
  at: number;
}

async function readAll(): Promise<Record<string, Entry>> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, Entry>;
  } catch {
    return {};
  }
}

export async function GET() {
  return NextResponse.json({ entries: await readAll() });
}

export async function PUT(request: Request) {
  let incoming: Record<string, Entry> = {};
  try {
    incoming = ((await request.json()) as { entries?: Record<string, Entry> }).entries ?? {};
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const current = await readAll();
  let changed = false;
  for (const [key, entry] of Object.entries(incoming)) {
    if (!entry || typeof entry.at !== "number" || key.length > 64) continue;
    const mine = current[key];
    if (!mine || entry.at > mine.at) {
      current[key] = { v: entry.v, at: entry.at };
      changed = true;
    }
  }
  const value = JSON.stringify(current);
  if (value.length > MAX_BYTES) {
    return NextResponse.json({ error: "Too large" }, { status: 413 });
  }
  if (changed) {
    await prisma.setting.upsert({
      where: { key: KEY },
      update: { value },
      create: { key: KEY, value },
    });
  }
  return NextResponse.json({ entries: current });
}
