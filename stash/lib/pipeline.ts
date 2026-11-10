/*
 * Settings → Setup: what `pipeline_status()` says, in plain words. Pure (the fetch lives
 * in the component), so the checklist is unit-tested.
 */

export type PipelineStatus = {
  worker: boolean;
  ai: boolean;
  isOwner: boolean;
  ownersSet: boolean;
  videoBytes: number;
  videoCapBytes: number;
};

const bool = (v: unknown) => v === true;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : Math.max(0, Number(v) || 0));

/** Validates the RPC's JSON. Null when it isn't an object (not deployed yet, or an older database). */
export function parsePipelineStatus(raw: unknown): PipelineStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  return {
    worker: bool(r.worker),
    ai: bool(r.ai),
    isOwner: bool(r.is_owner),
    ownersSet: bool(r.owners_set),
    videoBytes: num(r.video_bytes),
    videoCapBytes: num(r.video_cap_bytes),
  };
}

export type SetupStep = {
  id: "phone" | "worker" | "owner" | "ai";
  done: boolean;
  title: string;
  detail: string;
  /** Who can finish it. "owner" is the one manual step. */
  who?: "owner" | "installer";
};

/** The checklist, in the order things get switched on. */
export function setupSteps(status: PipelineStatus | null, connected: boolean): SetupStep[] {
  const steps: SetupStep[] = [
    {
      id: "phone",
      done: connected,
      title: connected ? "This phone is connected" : "This phone isn't connected yet",
      detail: connected ? "Saves sync and stay private to this phone's id." : "Open Stash with a connection once and it connects by itself.",
    },
  ];
  if (!status) return steps;
  steps.push({
    id: "worker",
    done: status.worker,
    title: status.worker ? "Processing is running" : "Processing isn't switched on yet",
    detail: status.worker
      ? "New saves get their title, picture and player within seconds."
      : "Saves are kept safe and wait. They are processed as soon as it is switched on.",
    who: status.worker ? undefined : "installer",
  });
  steps.push({
    id: "owner",
    done: status.isOwner,
    title: status.isOwner ? "This phone is an owner's phone" : status.ownersSet ? "This phone isn't on the owner list" : "No owner phone is set yet",
    detail: status.isOwner
      ? "It gets summaries, saved video copies, reminders and the daily queue."
      : "Owner phones get summaries and saved video copies. Send this phone's id (below) to whoever set Stash up.",
    who: status.isOwner ? undefined : "installer",
  });
  steps.push({
    id: "ai",
    done: status.ai,
    title: status.ai ? "AI key added" : "Add an AI key",
    detail: status.ai
      ? "Summaries, takeaways, recall cards and answers are on."
      : "The one step left for the owner. Until then saves still play and can be searched; summaries fill in by themselves a few minutes after the key is added.",
    who: status.ai ? undefined : "owner",
  });
  return steps;
}

export function setupDone(steps: SetupStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** 0–100 for the video space bar (a little use still shows). */
export function usedPercent(used: number, cap: number): number {
  if (cap <= 0 || used <= 0) return 0;
  return Math.min(100, Math.max(2, Math.round((used / cap) * 100)));
}
