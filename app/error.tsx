"use client";

import { useEffect } from "react";

import { reportError } from "@/lib/report-error";

/**
 * Catches what `(app)/error.tsx` cannot: a failure in a layout, such as the
 * app layout's profile read during a Supabase outage. Without it the player
 * gets Next's bare "Application error" page.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <div className="hero-grid flex min-h-svh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="dsp text-[40px] leading-[0.98]">Something went wrong</h1>
      <p className="max-w-sm text-sm text-fg-muted">
        We could not load this page. Your data is safe. Try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        className="dsp mt-3 inline-flex h-12 items-center rounded-full bg-accent px-6 text-[12px] text-accent-fg"
      >
        Try again
      </button>
    </div>
  );
}
