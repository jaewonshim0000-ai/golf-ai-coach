import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Golf AI Coach",
    short_name: "Golf Coach",
    description: "Strokes gained, measurable practice, and private swing video in one golf development system.",
    start_url: "/practice",
    display: "standalone",
    background_color: "#f1efe8",
    theme_color: "#1fa963",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
