import type { SupabaseClient } from "@supabase/supabase-js";
import type { RealtimeLink } from "./sync-client";

export const CHANGED_EVENT = "changed";
export const channelName = (boardId: string) => `atelier:board:${boardId}`;

/**
 * Cross-device ping over Supabase Realtime broadcast on `atelier:board:{id}`: after a push, notify() tells the other
 * open devices "changed", and they pull. The payload carries no content, only the board id. `self: false` keeps a
 * device from hearing its own broadcast.
 */
export function createRealtimeLink(client: Pick<SupabaseClient, "channel" | "removeChannel">, boardId: string): RealtimeLink {
  const callbacks = new Set<() => void>();
  const channel = client.channel(channelName(boardId), { config: { broadcast: { self: false } } });
  channel
    .on("broadcast", { event: CHANGED_EVENT }, (msg: { payload?: { boardId?: unknown } }) => {
      if (msg?.payload?.boardId !== boardId) return;
      for (const cb of [...callbacks]) cb();
    })
    .subscribe();

  return {
    notify() {
      // Best effort: a missed ping only means the other device pulls on its next focus or reconnect.
      Promise.resolve(channel.send({ type: "broadcast", event: CHANGED_EVENT, payload: { boardId } })).catch(() => {});
    },
    onRemoteChange(cb) {
      callbacks.add(cb);
      return () => {
        callbacks.delete(cb);
      };
    },
    close() {
      callbacks.clear();
      Promise.resolve(client.removeChannel(channel)).catch(() => {});
    },
  };
}
