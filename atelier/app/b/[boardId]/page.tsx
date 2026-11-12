import type { Metadata } from "next";
import { connection } from "next/server";
import { isLocalOnly } from "@/lib/server/owner";
import { BoardClient } from "./board-client";

export const metadata: Metadata = { title: "Board" };

// Per request: whether this server runs in local-only mode (no login, no sync) is a runtime fact, decided here on the
// server and handed to the browser, which never has to guess. The page carries no board data (it is read from IndexedDB).
export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  await connection();
  const { boardId } = await params;
  return <BoardClient boardId={boardId} localOnly={isLocalOnly()} />;
}
