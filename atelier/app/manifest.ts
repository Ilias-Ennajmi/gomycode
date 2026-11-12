import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Atelier",
    short_name: "Atelier",
    description: "A private, offline-first moodboard canvas.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: BRAND.paper,
    theme_color: BRAND.ink,
    // Web Share Target (Android, installed app): the share sheet posts a form that public/sw.js answers on the device.
    // iOS Safari has no Web Share Target; there the Inbox is fed by Quick capture or paste.
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "media", accept: ["image/*", "video/mp4", "video/webm"] }] },
    },
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
