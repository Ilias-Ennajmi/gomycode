"use client";

import useSWR, { mutate as globalMutate } from "swr";
import type { CollectionSummary } from "@/app/api/collections/route";

export type { CollectionSummary };

function refresh() {
  return globalMutate((key) => typeof key === "string" && key.startsWith("/api/collections"));
}

/** Every collection; with an article id, each one says whether it holds that article. */
export function useCollections(articleId?: string | null) {
  const { data, isLoading, mutate } = useSWR<{ collections: CollectionSummary[] }>(
    articleId ? `/api/collections?articleId=${articleId}` : "/api/collections",
    { revalidateOnFocus: false }
  );
  return { collections: data?.collections ?? [], isLoading, mutate };
}

async function check(res: Response) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "That didn't work");
  }
  return res;
}

export async function createCollection(name: string, articleId?: string) {
  const res = await check(
    await fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, articleId }),
    })
  );
  await refresh();
  return (await res.json()).collection as { id: string; name: string };
}

export async function addToCollection(collectionId: string, articleId: string) {
  await check(
    await fetch(`/api/collections/${collectionId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId }),
    })
  );
  await refresh();
}

export async function removeFromCollection(collectionId: string, articleId: string) {
  await check(
    await fetch(`/api/collections/${collectionId}/items?articleId=${articleId}`, {
      method: "DELETE",
    })
  );
  await refresh();
  await globalMutate((key) => typeof key === "string" && key.includes("collectionId="));
}

export async function updateCollection(
  id: string,
  patch: { name?: string; description?: string; public?: boolean }
) {
  const res = await check(
    await fetch(`/api/collections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  );
  await refresh();
  return (await res.json()).collection as { id: string; slug: string | null };
}

export async function deleteCollection(id: string) {
  await check(await fetch(`/api/collections/${id}`, { method: "DELETE" }));
  await refresh();
}
