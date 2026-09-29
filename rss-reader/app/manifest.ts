import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/reader",
    name: "RSS Reader",
    short_name: "Reader",
    description: "Your feeds, YouTube channels, and newsletters in one calm place.",
    start_url: "/reader",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#14161B",
    theme_color: "#14161B",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    // "Share → Reader" from other apps saves the link to Later (app/share/page.tsx).
    // The Android app declares the same target in android/app/build.gradle.
    share_target: {
      action: "/share",
      method: "get",
      // The spec's shape; Next's type wrongly expects an array here.
      params: { title: "title", text: "text", url: "url" } as unknown as NonNullable<
        MetadataRoute.Manifest["share_target"]
      >["params"],
    },
    // Long-press the app icon. Mirrors android/app/src/main/res/xml/shortcuts.xml.
    shortcuts: [
      {
        name: "Search",
        url: "/reader?search=1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "News",
        url: "/reader?view=news",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Later",
        url: "/reader?view=later",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Highlights",
        url: "/reader?view=highlights",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Add source",
        url: "/reader?add=1",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
