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
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
