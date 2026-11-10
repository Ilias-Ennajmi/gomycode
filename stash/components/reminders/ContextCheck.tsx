"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { getBrowserClient } from "@/lib/supabase/client";
import { haptic } from "@/lib/haptics";
import { eveningDue, learnDue, type ContextRule } from "@/lib/contextRules";

const MIN_GAP_MS = 10 * 60_000; // an "app open", not every tab switch
const KEY = "stash.context.lastCheck.";

type Due = { id: string; saveId: string; title: string };

/** Unfired context reminders of one rule that are due now; marks them fired (fire_at = now). */
async function fireDue(rule: Exclude<ContextRule, "weekend_morning">, now: Date): Promise<Due[]> {
  const supabase = getBrowserClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("reminders")
    .select("id,save_id,created_at,rule,saves(title,caption,insights(title,key_idea))")
    .eq("kind", "context")
    .eq("fired", false)
    .eq("rule->>type", rule)
    .limit(20);
  if (error || !data) return [];
  const due = data.filter((r) => {
    const created = new Date(r.created_at);
    return rule === "evening_open" ? eveningDue(created, now) : learnDue(created, now);
  });
  if (!due.length) return [];
  const { error: upErr } = await supabase
    .from("reminders")
    .update({ fired: true, fire_at: now.toISOString() })
    .in("id", due.map((r) => r.id));
  if (upErr) return [];
  return due.map((r) => {
    const save = (Array.isArray(r.saves) ? r.saves[0] : r.saves) as
      | { title: string | null; caption: string | null; insights: { title: string | null; key_idea: string | null } | { title: string | null; key_idea: string | null }[] | null }
      | null;
    const ins = Array.isArray(save?.insights) ? save?.insights[0] : save?.insights;
    return { id: r.id, saveId: r.save_id, title: ins?.title || ins?.key_idea || save?.title || save?.caption?.slice(0, 80) || "A save you wanted back" };
  });
}

/**
 * Fires context reminders on the phone: "evening_open" when Stash opens between 18:00
 * and 23:00 (checked on open and when the app comes back after 10 min), "learn_open"
 * when Learn opens. One toast with Watch; the fired reminder then shows on Today under
 * For you. Renders nothing. ("weekend_morning" carries a time; the cron sends it.)
 */
export function ContextCheck({ rule }: { rule: Exclude<ContextRule, "weekend_morning"> }) {
  const router = useRouter();
  const { toast } = useToast();
  const running = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (running.current || document.visibilityState !== "visible") return;
      if (rule === "evening_open") {
        try {
          if (Date.now() - Number(sessionStorage.getItem(KEY + rule) ?? 0) < MIN_GAP_MS) return;
          sessionStorage.setItem(KEY + rule, String(Date.now()));
        } catch {
          // storage blocked: check anyway
        }
      }
      running.current = true;
      try {
        const due = await fireDue(rule, new Date());
        if (!due.length) return;
        haptic();
        const first = due[0];
        toast({
          message: due.length === 1 ? `You asked to see this now: ${first.title}` : `${due.length} saves you asked to see now`,
          actionLabel: "Watch",
          duration: 10_000,
          onAction: () => router.push(due.length === 1 ? `/item/${first.saveId}` : "/today"),
        });
      } catch {
        // offline or no session: the next open tries again
      } finally {
        running.current = false;
      }
    };
    void check();
    if (rule !== "evening_open") return;
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [rule, router, toast]);

  return null;
}
