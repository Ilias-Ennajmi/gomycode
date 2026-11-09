import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reportProblem } from "@/lib/errlog";

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { count } = await prisma.filterRule.deleteMany({ where: { id: params.id } });
    if (count === 0) return NextResponse.json({ error: "Filter not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    await reportProblem("DELETE /api/filters/[id]", error);
    return NextResponse.json({ error: "Failed to delete filter" }, { status: 500 });
  }
}
