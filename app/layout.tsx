import type { Metadata, Viewport } from "next";
import { Anton, Inter_Tight } from "next/font/google";

import "./globals.css";

/**
 * The two faces the design is built on: Anton for headings, Inter Tight for
 * everything else. next/font self-hosts both, so there is no render-blocking
 * request to Google and no layout shift.
 */
const anton = Anton({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-anton",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter-tight",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Golf AI Coach",
    template: "%s · Golf AI Coach",
  },
  description:
    "A persistent golf intelligence system: strokes gained, practice tracking and swing findings combined into one development priority.",
  manifest: "/manifest.webmanifest",
  applicationName: "Golf AI Coach",
  appleWebApp: { capable: true, title: "Golf Coach", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ece9e0" },
    { media: "(prefers-color-scheme: dark)", color: "#12140f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${interTight.variable}`}>
      <body>{children}</body>
    </html>
  );
}
