"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Copy, KeyRound } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cx } from "@/components/ui/cx";
import { getBrowserClient, sessionUser } from "@/lib/supabase/client";
import { formatBytes, parsePipelineStatus, setupDone, setupSteps, usedPercent, type PipelineStatus } from "@/lib/pipeline";

const CACHE = "stash.pipeline";

function readCache(): PipelineStatus | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? "null") as PipelineStatus | null;
  } catch {
    return null;
  }
}

/**
 * Settings → Setup: what is switched on, in plain words, from `pipeline_status()`.
 * The one step a person has to do (the owner adds an AI key in Supabase Vault) is spelled out.
 */
export function SetupChecklist() {
  const { toast } = useToast();
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "offline">("loading");

  useEffect(() => {
    let alive = true;
    const cached = readCache();
    if (cached) {
      // localStorage is only readable after mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus(cached);
      setState("ready");
    }
    void (async () => {
      const supabase = getBrowserClient();
      const user = await sessionUser();
      if (!alive) return;
      setDeviceId(user?.id ?? null);
      if (!supabase || !user) {
        setState((s) => (s === "ready" ? s : "offline"));
        return;
      }
      const { data, error } = await supabase.rpc("pipeline_status");
      if (!alive) return;
      const parsed = error ? null : parsePipelineStatus(data);
      if (parsed) {
        setStatus(parsed);
        setState("ready");
        try {
          localStorage.setItem(CACHE, JSON.stringify(parsed));
        } catch {
          // cache is a convenience only
        }
      } else setState((s) => (s === "ready" ? s : "offline"));
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-pop">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  const steps = setupSteps(status, Boolean(deviceId));
  const { done, total } = setupDone(steps);
  const needsKey = status !== null && !status.ai;
  const showId = status !== null && !status.isOwner;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 rounded-xl bg-surface p-4 shadow-pop">
        <p className="pb-1 text-label text-fg-muted">
          {status === null ? "Couldn't check right now. It will show here when the phone is connected." : done === total ? "Everything is switched on." : `${done} of ${total} switched on`}
        </p>
        <ol className="flex flex-col">
          {steps.map((s) => (
            <li key={s.id} className="flex items-start gap-3 py-2">
              <span className={cx("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full", s.done ? "bg-fg text-background" : "bg-raised text-fg-subtle")}>
                {s.done ? <Check size={16} strokeWidth={3} aria-hidden /> : <Circle size={14} strokeWidth={2.5} aria-hidden />}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="text-label text-fg">
                  {s.title}
                  <span className="sr-only">{s.done ? " (done)" : " (to do)"}</span>
                </span>
                <span className="text-caption text-fg-muted">{s.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {needsKey && (
        <div className="flex flex-col gap-2 rounded-xl bg-raised p-4">
          <p className="flex items-center gap-2 text-label text-fg">
            <KeyRound size={20} strokeWidth={2} aria-hidden /> The one step for the owner
          </p>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-body text-fg-muted">
            <li>Get a free key at Google AI Studio (aistudio.google.com → Get API key).</li>
            <li>
              In the Supabase dashboard open <span className="text-fg">Vault</span> and add a secret named{" "}
              <code className="rounded-sm bg-surface px-1 font-mono text-caption text-fg">stash_gemini_api_key</code> with the key as its value.
            </li>
            <li>Nothing else. Saves made before get their summaries within a few minutes.</li>
          </ol>
          <p className="text-caption text-fg-muted">The key stays in Supabase. It never reaches this phone or the website.</p>
        </div>
      )}

      {showId && deviceId && (
        <div className="flex items-center gap-3 rounded-xl bg-surface p-4 shadow-pop">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-label text-fg">This phone&apos;s id</span>
            <span className="truncate font-mono text-caption text-fg-muted">{deviceId}</span>
            <span className="text-caption text-fg-muted">Send it to whoever set Stash up, to add this phone as an owner.</span>
          </div>
          <IconButton label="Copy this phone's id" icon={Copy} variant="raised" onClick={() => void navigator.clipboard?.writeText(deviceId).then(() => toast({ message: "Copied" }))} />
        </div>
      )}

      {status !== null && status.videoCapBytes > 0 && (
        <div className="flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-pop">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-label text-fg">Saved video copies</span>
            <span className="text-caption tabular-nums text-fg-muted">
              {formatBytes(status.videoBytes)} of {formatBytes(status.videoCapBytes)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Video space used"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={usedPercent(status.videoBytes, status.videoCapBytes)}
            className="h-2 overflow-hidden rounded-full bg-raised"
          >
            <div className="h-full rounded-full bg-fg" style={{ width: `${usedPercent(status.videoBytes, status.videoCapBytes)}%` }} />
          </div>
          <p className="text-caption text-fg-muted">When it fills up, the oldest watched copies are cleared first. Those saves keep playing from their own app.</p>
        </div>
      )}
    </div>
  );
}
