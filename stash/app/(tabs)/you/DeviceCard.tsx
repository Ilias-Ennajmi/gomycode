"use client";

import { useEffect, useState } from "react";
import { Copy, Cpu } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { getBrowserClient } from "@/lib/supabase/client";

/**
 * This phone's private id (an anonymous Supabase identity) and this month's
 * AI spend. The worker only processes saves from ids listed in OWNER_USER_IDS.
 */
export function DeviceCard() {
  const { toast } = useToast();
  const [id, setId] = useState<string | null>(null);
  const [spend, setSpend] = useState<{ usd: number; budget: number } | null>(null);

  useEffect(() => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled || !data.user) return;
      setId(data.user.id);
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const [{ data: usage }, { data: settings }] = await Promise.all([
        supabase.from("usage").select("usd").gte("created_at", start.toISOString()),
        supabase.from("settings").select("monthly_budget_usd").maybeSingle(),
      ]);
      if (cancelled) return;
      setSpend({
        usd: (usage ?? []).reduce((sum, r) => sum + Number(r.usd ?? 0), 0),
        budget: Number(settings?.monthly_budget_usd ?? 5),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="This device" className="mx-4 flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <Cpu size={24} strokeWidth={2} aria-hidden className="shrink-0 text-fg-muted" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-label text-fg">Device id</span>
          <span className="truncate font-mono text-caption text-fg-muted">{id ?? "Not connected yet"}</span>
        </div>
        {id && (
          <IconButton
            label="Copy device id"
            icon={Copy}
            onClick={() => void navigator.clipboard?.writeText(id).then(() => toast({ message: "Copied" }))}
          />
        )}
      </div>
      {spend && (
        <p className="text-caption text-fg-muted">
          AI this month: ${spend.usd.toFixed(2)} of ${spend.budget.toFixed(2)}
        </p>
      )}
    </section>
  );
}
