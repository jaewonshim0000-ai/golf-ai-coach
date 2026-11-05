import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Golf AI Coach",
    short_name: "Golf Coach",
    description: "Strokes gained, measurable practice, and private swing video in one golf development system.",
    start_url: "/practice",
    display: "standalone",
    background_color: "#ece9e0",
    theme_color: "#5c7a2a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
