// The visitor's way in: which screen comes next. Pure.
export type GateState = "loading" | "gone" | "password" | "session" | "ready";

export interface GateMeta {
  status: "ok" | "gone" | "not-found";
  needsPassword: boolean;
  hasSession: boolean;
}

/** gone / not-found -> "gone" (one screen for every dead link); a password comes first; no session -> the page asks for one itself. */
export function nextGate(meta: GateMeta): GateState {
  if (meta.status !== "ok") return "gone";
  if (meta.needsPassword) return "password";
  if (!meta.hasSession) return "session";
  return "ready";
}
