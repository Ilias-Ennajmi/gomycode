"use client";

import { ensureSession, getBrowserClient } from "@/lib/supabase/client";
import type { Platform } from "@/lib/links";

/*
 * Saves are written to IndexedDB first, so "Saved" appears instantly and
 * nothing is lost offline. flush() sends them to Supabase with their
 * client_id, so a retry can never create a duplicate (unique per user).
 */

export type OutboxItem = {
  clientId: string;
  sourceUrl: string;
  platform: Platform;
  spaceId: string | null;
  sharedTitle: string | null;
  savedAt: string;
};

const DB = "stash";
const STORE = "outbox";
const EVENT = "stash:outbox";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "clientId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
}

function changed() {
  window.dispatchEvent(new Event(EVENT));
}

export function onOutboxChange(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export async function enqueue(item: OutboxItem): Promise<void> {
  await tx("readwrite", (s) => s.put(item));
  changed();
}

/** Many saves in one IndexedDB transaction (imports). */
export async function enqueueMany(items: OutboxItem[]): Promise<void> {
  if (!items.length) return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, "readwrite");
    const store = t.objectStore(STORE);
    for (const item of items) store.put(item);
    t.oncomplete = () => {
      db.close();
      resolve();
    };
    t.onerror = () => {
      db.close();
      reject(t.error);
    };
  });
  changed();
}

export async function pending(): Promise<OutboxItem[]> {
  try {
    return await tx("readonly", (s) => s.getAll() as IDBRequest<OutboxItem[]>);
  } catch {
    return [];
  }
}

/** Change a save that may still be waiting in the outbox (e.g. its Space). */
export async function patchPending(clientId: string, patch: Partial<OutboxItem>): Promise<boolean> {
  const item = await tx("readonly", (s) => s.get(clientId) as IDBRequest<OutboxItem | undefined>);
  if (!item) return false;
  await tx("readwrite", (s) => s.put({ ...item, ...patch }));
  changed();
  return true;
}

let flushing: Promise<number> | null = null;
const FLUSH_BATCH = 50;

/** Sends waiting saves. Returns how many reached the server. Safe to call often. */
export function flush(): Promise<number> {
  flushing ??= (async () => {
    const supabase = getBrowserClient();
    if (!supabase || (typeof navigator !== "undefined" && !navigator.onLine)) return 0;
    const items = await pending();
    if (!items.length) return 0;
    // No identity yet (first open, offline at boot): the saves wait here, nothing is lost.
    if (!(await ensureSession())) return 0;
    let sent = 0;
    // Batches keep a big import to a few requests; a single share is a batch of one.
    for (let i = 0; i < items.length; i += FLUSH_BATCH) {
      const batch = items.slice(i, i + FLUSH_BATCH);
      const { error } = await supabase.from("saves").upsert(
        batch.map((item) => ({
          client_id: item.clientId,
          source_url: item.sourceUrl,
          platform: item.platform,
          space_id: item.spaceId,
          title: item.sharedTitle,
          saved_at: item.savedAt,
        })),
        { onConflict: "user_id,client_id", ignoreDuplicates: true },
      );
      if (error) break; // offline or no session yet: try again later
      const db = await open();
      await new Promise<void>((resolve) => {
        const t = db.transaction(STORE, "readwrite");
        for (const item of batch) t.objectStore(STORE).delete(item.clientId);
        t.oncomplete = t.onerror = () => {
          db.close();
          resolve();
        };
      });
      sent += batch.length;
      if (items.length > FLUSH_BATCH) changed(); // progress for long imports
    }
    if (sent) changed();
    return sent;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

/** Applies a change to a save by its client id, whether it's still queued here or already synced. */
export async function updateSaveByClientId(
  clientId: string,
  values: { space_id?: string | null; voice_note_path?: string | null; user_note?: string | null },
): Promise<void> {
  // A send in progress has already read the queued copy; let it land, then edit the server row.
  if (flushing) await flushing;
  if ("space_id" in values && (await patchPending(clientId, { spaceId: values.space_id ?? null }))) {
    const rest = { ...values };
    delete rest.space_id;
    if (Object.keys(rest).length === 0) return;
    await flush();
    values = rest;
  }
  const supabase = getBrowserClient();
  if (!supabase) return;
  await supabase.from("saves").update(values).eq("client_id", clientId);
}

/** The server id of a save, once it has synced. */
export async function serverIdFor(clientId: string): Promise<string | null> {
  await flush();
  const supabase = getBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.from("saves").select("id").eq("client_id", clientId).maybeSingle();
  return data?.id ?? null;
}
