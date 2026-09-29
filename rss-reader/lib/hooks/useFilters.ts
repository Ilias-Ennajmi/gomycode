"use client";

import useSWR, { useSWRConfig } from "swr";
import type { FilterRuleSummary } from "@/lib/types";

const EMPTY: FilterRuleSummary[] = [];

export function useFilters() {
  const { mutate: globalMutate } = useSWRConfig();
  const { data, isLoading, mutate } = useSWR<{ rules: FilterRuleSummary[] }>("/api/filters");

  // Rules change what every list and count shows, so refresh everything.
  function revalidateAll() {
    globalMutate(() => true, undefined, { revalidate: true });
  }

  async function addRule(rule: Omit<FilterRuleSummary, "id">) {
    const res = await fetch("/api/filters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rule),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || "Could not save filter");
    await mutate(body, { revalidate: false });
    revalidateAll();
  }

  async function removeRule(id: string) {
    const res = await fetch(`/api/filters/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Could not delete filter");
    }
    await mutate();
    revalidateAll();
  }

  return { rules: data?.rules ?? EMPTY, isLoading, addRule, removeRule };
}
