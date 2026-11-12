"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SyncClient } from "@/lib/sync/sync-client";

/** What the rounds UI needs to know about the board being edited and how it reaches the server. */
export type BoardInfo = {
  boardId: string;
  /** The server runs in local-only mode: no account, no sync; the board is handed to the server whole before a round. */
  localOnly: boolean;
  /** Null in local-only mode. */
  sync: Pick<SyncClient, "flush" | "status"> | null;
};

const Ctx = createContext<BoardInfo | null>(null);

export function BoardInfoProvider({ value, children }: { value: BoardInfo; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The board's identity and sync, or null outside a board page (a panel or menu then says it needs the server). */
export function useBoardInfo(): BoardInfo | null {
  return useContext(Ctx);
}
