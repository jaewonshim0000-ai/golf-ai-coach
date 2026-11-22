"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { StepDot, StepStrip } from "@/components/ui/primitives";

/*
  The pieces of the live drill and practice-test screens, shared by the
  session runner and the test tracker.
*/

/** The heading row of a drill: what counts, how far to go, and the count. */
export function TrackerHead({
  title,
  sub,
  met,
  metLabel,
  count,
}: {
  title: ReactNode;
  sub: ReactNode;
  met: boolean;
  metLabel: string;
  count: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h2 className="dsp text-[24px] leading-none">{title}</h2>
        {met ? (
          <span className="dsp inline-flex h-[26px] items-center self-start rounded-full bg-accent-soft px-2.5 text-[10px] text-accent-strong">
            {metLabel}
          </span>
        ) : (
          <p className="text-[13px] text-fg-subtle">{sub}</p>
        )}
      </div>
      <div
        aria-live="polite"
        className="font-display tabular flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-[26px]"
      >
        {count}
      </div>
    </div>
  );
}

/**
 * The dark strip of balls. `window` slides six at a time with IN / MISS
 * labels, like the live drill; `grid` shows all of them, five to a row, like
 * a putting test.
 */
export function BallStrip({
  results,
  total,
  layout = "window",
  labels = ["In", "Miss"],
}: {
  results: boolean[];
  total: number;
  layout?: "window" | "grid";
  labels?: [string, string];
}) {
  const n = results.length;
  const made = results.filter(Boolean).length;
  const summary = `Ball ${Math.min(n + 1, total)} of ${total}. ${made} ${labels[0].toLowerCase()} so far.`;
  const dot = (index: number) => {
    const result = results[index];
    const now = index === n;
    return (
      <StepDot
        key={index}
        value={index + 1}
        tone={result === true ? "good" : result === false ? "bad" : now ? "now" : "open"}
        label={layout === "window" ? (result === true ? labels[0] : result === false ? labels[1] : now ? "Now" : "Ball") : undefined}
      />
    );
  };
  if (layout === "grid") {
    return (
      <StepStrip columns={5} role="img" aria-label={summary} className="gap-2 p-3">
        {Array.from({ length: total }, (_, index) => dot(index))}
      </StepStrip>
    );
  }
  const shown = Math.min(6, Math.max(total, n + 1));
  const start = Math.max(0, Math.min(n - 4, Math.max(total, n + 1) - shown));
  return (
    <StepStrip columns={6} role="img" aria-label={summary}>
      {Array.from({ length: shown }, (_, offset) => dot(start + offset))}
    </StepStrip>
  );
}

/** "Your best · last" on the left, Undo on the right. */
export function StripFooter({
  note,
  onUndo,
  canUndo,
  children,
}: {
  note: ReactNode;
  onUndo?: () => void;
  canUndo: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 text-[13px] text-fg-subtle">{note}</span>
      <div className="flex shrink-0 gap-2">
        {children}
        {onUndo ? (
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="press dsp h-9 rounded-full border-[1.5px] border-fg bg-surface px-3.5 text-[11px] disabled:opacity-40"
          >
            Undo
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** One saved result on the session-complete screen. */
export function ResultRow({
  name,
  detail,
  score,
  best,
}: {
  name: string;
  detail: ReactNode;
  score: ReactNode;
  best?: boolean;
}) {
  return (
    <li className="flex items-center gap-3 rounded-[22px] bg-surface px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-bold">{name}</span>
        <span className={cn("mt-0.5 block text-[12.5px]", best ? "font-semibold text-accent-strong" : "text-fg-subtle")}>
          {detail}
        </span>
      </span>
      <span
        className={cn(
          "font-display tabular flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[17px]",
          best ? "bg-accent text-white" : "bg-surface-2",
        )}
      >
        {score}
      </span>
    </li>
  );
}
