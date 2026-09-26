import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { count } = await prisma.filterRule.deleteMany({ where: { id: params.id } });
    if (count === 0) return NextResponse.json({ error: "Filter not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/filters/[id] failed", error);
    return NextResponse.json({ error: "Failed to delete filter" }, { status: 500 });
  }
}
