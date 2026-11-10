"use client";

import { useEffect, useState } from "react";
import { Copy, Cpu } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/Toast";
import { sessionUser } from "@/lib/supabase/client";

/**
 * This phone's id, to copy into the worker's OWNER_USER_IDS and the Supabase Vault
 * secret `stash_owner_ids` (both decide which devices get AI processing, reminders
 * and the daily queue).
 */
export function DeviceIdRow() {
  const { toast } = useToast();
  const [id, setId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void sessionUser().then((u) => {
      if (!cancelled) setId(u?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
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
  );
}
