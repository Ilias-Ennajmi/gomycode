"use client";

import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import { Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";

/** Keep YouTube Shorts out of every list (they stay in YouTube → Shorts). */
export function HideShortsSwitch() {
  const { data, mutate } = useSWR<{ prefs: { hideShorts: boolean } }>("/api/videos/prefs");
  const { mutate: mutateAll } = useSWRConfig();
  const hideShorts = data?.prefs.hideShorts ?? false;

  async function change(value: boolean) {
    mutate({ prefs: { hideShorts: value } }, { revalidate: false });
    const res = await fetch("/api/videos/prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hideShorts: value }),
    });
    if (!res.ok) {
      toast.error("Could not save that setting");
      mutate();
      return;
    }
    mutateAll((key) => typeof key === "string" && key.startsWith("/api/articles"));
  }

  return (
    <label className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Hide YouTube Shorts</span>
        <span className="block text-xs text-muted-foreground">
          Everywhere except YouTube → Shorts
        </span>
      </span>
      <Switch checked={hideShorts} onCheckedChange={change} disabled={!data} />
    </label>
  );
}
