"use client";

import { useEffect, useState } from "react";
import { FileText, Film, Link2, Play } from "lucide-react";
import { hydrateAssetIds } from "@/lib/assets/hydrate";
import { getAssetMetaStore } from "@/lib/assets/meta-store";
import { getAssetResolver } from "@/lib/assets/resolver";
import { classifyUrl } from "@/lib/engine/links/classify";
import type { InboxClient, ListedItem } from "@/lib/inbox/inbox-client";
import { hostOf } from "@/lib/inbox/types";

/** What an item is called: its title, else its words, else its address. Plain text; React escapes it. */
export function itemName(item: ListedItem): string {
  const t = (item.title ?? "").trim();
  if (t) return t;
  if (item.kind === "url") return hostOf(item.url) || "Link";
  if (item.kind === "text") return (item.text ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || "Note";
  return item.kind === "video" ? "Video" : "Picture";
}

export function itemKindLabel(item: ListedItem): string {
  if (item.kind === "image") return "Picture";
  if (item.kind === "video") return "Video";
  if (item.kind === "text") return "Note";
  return classifyUrl(item.url ?? "").kind === "embed" ? "Video link" : "Link";
}

/** Re-render when the asset resolver learns something (a thumbnail became available). */
function useResolverTick(): void {
  const [, set] = useState(0);
  useEffect(() => getAssetResolver().subscribe?.(() => set((n) => n + 1)), []);
}

/** Make the resolver know the size and variants of the pictures the Inbox shows (signed in; it asks the server once). */
export function useInboxAssets(items: ListedItem[], localOnly: boolean): void {
  const key = items.flatMap((i) => (i.assetId ? [i.assetId] : [])).join(",");
  useEffect(() => {
    if (localOnly || !key) return;
    void hydrateAssetIds({ ids: key.split(","), meta: getAssetMetaStore() });
  }, [key, localOnly]);
}

/** The picture for a card: the small variant of a picture or video, an icon for a link or a note. */
export function ItemThumb({ item, className = "", showHost = false }: { item: ListedItem; className?: string; showHost?: boolean }) {
  useResolverTick();
  const url = item.assetId ? getAssetResolver().url(item.assetId, "w256") : null;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" loading="lazy" decoding="async" crossOrigin="anonymous" className={`h-full w-full object-cover ${className}`} />;
  }
  const Icon = item.kind === "text" ? FileText : item.kind === "video" ? Film : item.kind === "url" ? (classifyUrl(item.url ?? "").kind === "embed" ? Play : Link2) : Film;
  return (
    <div aria-hidden="true" className={`flex h-full w-full flex-col items-center justify-center gap-1 bg-canvas px-2 text-fg-muted ${className}`}>
      <Icon size={22} />
      {showHost && item.kind === "url" ? <span className="max-w-full truncate text-(length:--text-xs)">{hostOf(item.url)}</span> : null}
    </div>
  );
}

/** The Inbox's items from `client`, kept current: it reads on mount, when the client's queue or status changes, and when the page comes back. */
export function useInboxItems(client: InboxClient | null, placed = false) {
  const [items, setItems] = useState<ListedItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<InboxClient["status"]>("idle");
  const [pending, setPending] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    let busy = false;
    let again = false;
    const read = async () => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      try {
        const next = await client.list({ placed });
        if (!alive) return;
        setItems(next);
        setLoaded(true);
        setStatus(client.status);
        setPending(client.pending());
      } finally {
        busy = false;
        if (again && alive) {
          again = false;
          void read();
        }
      }
    };
    void read();
    const off = client.subscribe(() => void read());
    const wake = () => void read();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      off();
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [client, placed, version]);

  return { items, loaded, status, pending, refresh: () => setVersion((v) => v + 1) };
}
