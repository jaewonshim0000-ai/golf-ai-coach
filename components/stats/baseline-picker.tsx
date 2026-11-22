"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { BASELINES } from "@/lib/golf/baselines";
import { cn } from "@/lib/utils";

/**
 * Who the player is being compared against. It lives in the URL like the other
 * filters, so a view is shareable and the server does the work.
 */
export function BaselinePicker({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function pick(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("baseline", id);
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  return (
    <div
      className={cn("no-bar flex gap-1.5 overflow-x-auto", pending && "opacity-60")}
      role="group"
      aria-label="Compare against"
    >
      {BASELINES.map((baseline) => (
        <button
          key={baseline.id}
          type="button"
          onClick={() => pick(baseline.id)}
          aria-pressed={baseline.id === current}
          className={cn(
            "dsp shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-medium tracking-[0.12em] transition-colors",
            baseline.id === current
              ? "border-transparent bg-[image:var(--grad-accent)] text-white"
              : "border-border-strong bg-surface text-fg-muted hover:text-fg",
          )}
        >
          {baseline.short}
        </button>
      ))}
    </div>
  );
}

/** The same choice as a compact pill dropdown: "vs 10 hcp". */
export function BaselineSelect({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  return (
    <label className={cn("relative inline-flex", pending && "opacity-60")}>
      <span className="sr-only">Compare against</span>
      <select
        value={current}
        onChange={(event) => {
          const next = new URLSearchParams(params.toString());
          next.set("baseline", event.target.value);
          startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
        }}
        className="dsp h-11 cursor-pointer appearance-none rounded-full border-[1.5px] border-fg bg-transparent pl-4 pr-9 text-[11px]"
      >
        {BASELINES.map((baseline) => (
          <option key={baseline.id} value={baseline.id}>
            vs {baseline.short}
          </option>
        ))}
      </select>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}
