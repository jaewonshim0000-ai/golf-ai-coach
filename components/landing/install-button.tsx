"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

type InstallEvent = Event & { prompt: () => Promise<unknown> };

/**
 * Installs the app where the browser offers it (Chrome, Edge, Android);
 * everywhere else it is a link to sign up, and the page explains Add to Home
 * Screen for Safari.
 */
export function InstallButton({ className, children }: { className?: string; children: ReactNode }) {
  const [install, setInstall] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!install) {
    return (
      <Link href="/signup" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void install.prompt();
        setInstall(null);
      }}
    >
      {children}
    </button>
  );
}
