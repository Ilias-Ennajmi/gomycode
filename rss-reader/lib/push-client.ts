"use client";

// Browser side of web push, shared by the settings and the one-time prompt.

export interface PushStatus {
  configured: boolean;
  publicKey: string | null;
  prefs: { briefing: boolean; breaking: boolean; recap: boolean };
  subscribed: boolean;
}

function keyToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** The service worker, if it registers within a few seconds (it doesn't in development). */
export async function readyRegistration() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
  ]);
}

/** This device's push status, or null when the browser can't do push. */
export async function loadPushStatus(): Promise<PushStatus | null> {
  const registration = await readyRegistration();
  if (!registration) return null;
  const subscription = await registration.pushManager.getSubscription();
  const query = subscription ? `?endpoint=${encodeURIComponent(subscription.endpoint)}` : "";
  const res = await fetch(`/api/push${query}`);
  if (!res.ok) throw new Error("Could not load notification settings");
  return res.json();
}

/** Asks for permission and subscribes this device. Throws a readable error. */
export async function turnOnPush(publicKey: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications are blocked. Allow them in your phone or browser settings.");
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(publicKey),
    }));
  const res = await fetch("/api/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!res.ok) throw new Error("Could not turn on notifications");
}
