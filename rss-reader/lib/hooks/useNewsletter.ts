"use client";

import { toast } from "sonner";

/** Copies an email newsletter's sign-up address. */
export async function copySignupAddress(email: string) {
  await navigator.clipboard.writeText(email);
  toast.success("Sign-up address copied");
}

/** Opens the unsubscribe link found in the newsletter's latest emails. */
export async function openUnsubscribe(feedId: string) {
  const res = await fetch(`/api/feeds/${feedId}/unsubscribe`);
  const body = await res.json().catch(() => ({}));
  if (body.url) {
    window.open(body.url, "_blank", "noopener,noreferrer");
  } else {
    toast("No unsubscribe link found in its emails", {
      description: "You can still unfollow it here: it stops showing up.",
    });
  }
}
