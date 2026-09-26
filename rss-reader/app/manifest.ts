import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RSS Reader",
    short_name: "Reader",
    description: "Your feeds, YouTube channels, and newsletters in one calm place.",
    start_url: "/reader",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14161B",
    theme_color: "#14161B",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
