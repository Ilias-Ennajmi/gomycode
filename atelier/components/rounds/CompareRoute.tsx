"use client";

import { useRouter } from "next/navigation";
import { getAssetResolver } from "@/lib/assets/resolver";
import { CompareClient } from "./CompareClient";

/** The compare page's client side: two versions of one board, and a way back to it. */
export function CompareRoute({ boardId, a, b }: { boardId: string; a: string; b: string }) {
  const router = useRouter();
  return <CompareClient boardId={boardId} a={a} b={b} assets={getAssetResolver()} onClose={() => router.push(`/b/${encodeURIComponent(boardId)}`)} />;
}
