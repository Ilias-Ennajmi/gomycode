import { NextRequest, NextResponse } from "next/server";
import { gradeHighlight, REVIEW_GRADES, type ReviewGrade } from "@/lib/review";

/** An answer in the daily review: again, good, easy or never. */
export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { grade } = (await request.json().catch(() => ({}))) as { grade?: string };
  if (!REVIEW_GRADES.includes(grade as ReviewGrade)) {
    return NextResponse.json(
      { error: "grade must be again, good, easy or never" },
      { status: 400 }
    );
  }
  const highlight = await gradeHighlight(params.id, grade as ReviewGrade);
  if (!highlight) return NextResponse.json({ error: "Highlight not found" }, { status: 404 });
  return NextResponse.json({ highlight });
}
