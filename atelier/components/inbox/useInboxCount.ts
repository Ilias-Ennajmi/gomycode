"use client";

import { useEffect, useState } from "react";
import { createInboxClient } from "@/lib/inbox/client-factory";

/**
 * How many Inbox items are waiting, for the badge on the home screen: from the server signed in, from this device in
 * local-only mode. 0 until known, and 0 when it cannot be read (offline). Using the client also lets anything queued
 * while offline go out as soon as the home screen is open and online.
 */
export function useInboxCount(localOnly: boolean): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const client = createInboxClient({ localOnly });
    let alive = true;
    const read = async () => {
      await client.list({ limit: 1 });
      if (alive) setCount(client.unplaced());
    };
    void read();
    const off = client.subscribe(() => void read());
    const onOnline = () => void read();
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      off();
      window.removeEventListener("online", onOnline);
      client.dispose();
    };
  }, [localOnly]);
  return count;
}
