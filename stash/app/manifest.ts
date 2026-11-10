import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/theme/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/today",
    name: "Stash",
    short_name: "Stash",
    description: "Save reels, watch them, remember them, use them.",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: BRAND.backgroundDark,
    theme_color: BRAND.backgroundDark,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    // Same as the Android shell's share target (android/app/build.gradle). POST multipart so
    // screenshots can come in too; public/sw.js answers it (app/share/receive/route.ts before
    // the service worker is installed) and opens the save sheet on /share.
    share_target: {
      action: "/share/receive",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "media", accept: ["image/*"] }],
      },
    },
    shortcuts: [
      { name: "Play my 5", url: "/play?queue=today" },
      { name: "Search", url: "/library?search=1" },
      { name: "Inbox", url: "/library?space=inbox" },
    ],
  };
}
