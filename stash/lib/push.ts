"use client";

import { getBrowserClient } from "@/lib/supabase/client";

/*
 * Web Push on this device. The VAPID public key comes from the database (the
 * first cron run creates the key pair in Supabase Vault), so there is nothing
 * to configure in Vercel.
 */

export type PushState = "unsupported" | "denied" | "off" | "on";
export type EnableResult = PushState | "not-ready" | "error";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  // In development there is no service worker; don't wait forever for one.
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((r) => setTimeout(() => r(null), 5000))]);
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const supabase = getBrowserClient();
  if (!supabase) return "error";
  const { data: key } = await supabase.rpc("vapid_public_key");
  if (!key) return "not-ready";
  const reg = await registration();
  if (!reg) return "error";
  try {
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      // A subscription made with an older key can't receive our pushes: replace it.
      const current = sub.options.applicationServerKey;
      const same = current && btoa(String.fromCharCode(...new Uint8Array(current))) === btoa(String.fromCharCode(...urlBase64ToUint8Array(key)));
      if (!same) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
    const r = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub.toJSON()),
    });
    return r.ok ? "on" : "error";
  } catch {
    return "error";
  }
}

export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => false);
  }
  return "off";
}
