import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Golf AI Coach",
    short_name: "Golf Coach",
    description: "Strokes gained, measurable practice, and private swing video in one golf development system.",
    start_url: "/practice",
    display: "standalone",
    background_color: "#ece9e0",
    // Matches the light theme-color in app/layout.tsx.
    theme_color: "#ece9e0",
    // Android wants PNGs; the maskable one is full-bleed because the launcher rounds it.
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
