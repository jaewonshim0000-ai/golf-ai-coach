import type { Metadata, Viewport } from "next";
import { Oswald } from "next/font/google";

import "./globals.css";

/**
 * The condensed display face the whole design is built on. next/font self-hosts
 * it, so there is no render-blocking request to Google and no layout shift.
 */
const oswald = Oswald({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Golf AI Coach",
    template: "%s · Golf AI Coach",
  },
  description:
    "A persistent golf intelligence system: strokes gained, practice tracking and swing findings combined into one development priority.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1efe8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f0c" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={oswald.variable}>
      <body>{children}</body>
    </html>
  );
}
