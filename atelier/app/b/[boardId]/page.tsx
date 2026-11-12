import type { Metadata } from "next";
import { BoardClient } from "./board-client";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  return <BoardClient boardId={boardId} />;
}
