import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { reportProblem } from "@/lib/errlog";
import { BadRequest, badRequest, readJson } from "@/lib/http";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const body = await readJson(request);
    const { name, color, icon, order } = body as {
      name?: string;
      color?: string;
      icon?: string | null;
      order?: number;
    };

    const category = await prisma.category.findUnique({ where: { id: params.id } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const updated = await prisma.category.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(icon !== undefined ? { icon } : {}),
        ...(order !== undefined ? { order } : {}),
      },
    });

    return NextResponse.json({ category: updated });
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error);
    await reportProblem("PATCH /api/categories/[id]", error);
    return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const category = await prisma.category.findUnique({ where: { id: params.id } });
    if (!category) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    await prisma.category.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof BadRequest) return badRequest(error);
    await reportProblem("DELETE /api/categories/[id]", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }
}
