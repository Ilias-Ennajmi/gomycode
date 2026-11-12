import type { Metadata } from "next";
import { connection } from "next/server";
import { CompareRoute } from "@/components/rounds/CompareRoute";

export const metadata: Metadata = { title: "Compare rounds" };

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

// /b/{boardId}/compare?a={snapshotId}&b={snapshotId|current}: two versions of one board side by side (or one over the other).
// The page carries no board data: the versions are fetched in the browser from the owner-only snapshot route, and "current" is
// this device's copy of the board.
export default async function ComparePage({ params, searchParams }: { params: Promise<{ boardId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const { boardId } = await params;
  const q = await searchParams;
  return <CompareRoute boardId={boardId} a={first(q.a)} b={first(q.b) || "current"} />;
}
