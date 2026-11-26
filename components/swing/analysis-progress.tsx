"use client";

import { useEffect, useRef, useState } from "react";

import { creep, isRestart, type AnalysisStage, type AnalysisStep } from "@/lib/swing/analysis-progress";
import { cn } from "@/lib/utils";

/** The video player says how far it has got; the review sheet listens. */
export const ANALYSIS_EVENT = "swing:analysis";
export type AnalysisEventDetail = { id: string; step: AnalysisStep | null };

/** The percent on screen: it creeps through stages that report nothing and never goes back within a run. */
export function useShownPercent(step: AnalysisStep | null): number {
  const [shown, setShown] = useState(0);
  const latest = useRef(step);
  const before = useRef<AnalysisStep | null>(null);
  latest.current = step;
  useEffect(() => {
    const previous = before.current;
    before.current = step;
    if (!step) {
      setShown(0);
      return;
    }
    const restart = isRestart(previous, step);
    setShown((current) => creep(restart ? 0 : current, step));
    const timer = window.setInterval(() => {
      if (latest.current) setShown((current) => creep(current, latest.current!));
    }, 150);
    return () => window.clearInterval(timer);
  }, [step]);
  return Math.floor(shown);
}

function stageLine(step: AnalysisStep): string {
  if (step.stage === "reading" && step.total) return `Reading frame ${step.done ?? 0} of ${step.total}`;
  return { preparing: "Getting the video ready", reading: "Reading every frame", saving: "Saving your review", done: "Writing your report" }[step.stage];
}

/** Over the video while it is read: the percent, the bar and what is happening now. */
export function AnalysisOverlay({ step }: { step: AnalysisStep }) {
  const percent = useShownPercent(step);
  return (
    <div role="status" className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-[18px] bg-black/75 px-3.5 py-3 text-white">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-[12px] text-white/85">{stageLine(step)}</span>
        <span className="font-display tabular text-[22px] leading-none">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Swing analysis"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-white/15"
      >
        <div className="h-full rounded-full bg-gold transition-[width] duration-200 ease-linear" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const STEPS: { stage: AnalysisStage; label: string }[] = [
  { stage: "preparing", label: "Getting the video ready" },
  { stage: "reading", label: "Reading every frame" },
  { stage: "saving", label: "Saving your review" },
  { stage: "done", label: "Writing your report" },
];

/**
 * The review sheet while the swing is analysed: the percent in a ring where
 * the score will appear, and the steps ticking off. Before an analysis starts
 * (or if it fails) it shows what it is given; once the result is on the page
 * it steps aside.
 */
export function AnalysisProgress({ id, hasResult, children }: { id: string; hasResult: boolean; children?: React.ReactNode }) {
  const [step, setStep] = useState<AnalysisStep | null>(null);
  useEffect(() => {
    const listen = (event: Event) => {
      const detail = (event as CustomEvent<AnalysisEventDetail>).detail;
      if (detail.id === id) setStep(detail.step);
    };
    window.addEventListener(ANALYSIS_EVENT, listen);
    return () => window.removeEventListener(ANALYSIS_EVENT, listen);
  }, [id]);
  const percent = useShownPercent(step);

  // A finished run is replaced by the result as soon as the page has it.
  if (!step || (step.stage === "done" && hasResult)) return <>{children}</>;

  const full = 2 * Math.PI * 38;
  const current = STEPS.findIndex((item) => item.stage === step.stage);
  return (
    <section aria-label="Analysing your swing" className="flex flex-col gap-3.5">
      <div className="flex items-center gap-4">
        <div className="relative h-[92px] w-[92px] shrink-0">
          <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden className="absolute inset-0 -rotate-90">
            <circle cx="46" cy="46" r="38" fill="none" stroke="var(--c-surface-2)" strokeWidth="9" />
            <circle
              cx="46"
              cy="46"
              r="38"
              fill="none"
              stroke="var(--c-accent)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={full}
              strokeDashoffset={full * (1 - percent / 100)}
              className="transition-[stroke-dashoffset] duration-200 ease-linear"
            />
          </svg>
          <span
            role="progressbar"
            aria-label="Swing analysis"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="font-display tabular absolute inset-0 flex items-center justify-center text-[26px] leading-none"
          >
            {percent}%
          </span>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="dsp text-[26px] leading-none">Analysing your swing</h2>
          <p aria-live="polite" className="text-[12.5px] leading-[1.45] text-fg-subtle">
            {stageLine(step)}
          </p>
        </div>
      </div>
      <ol aria-label="Analysis progress" className="flex flex-col gap-2.5 rounded-[24px] bg-surface-2 px-4 py-3.5">
        {STEPS.map((item, index) => {
          const state = index < current ? "done" : index === current ? "now" : "next";
          return (
            <li
              key={item.stage}
              aria-current={state === "now" ? "step" : undefined}
              className={cn("flex items-center gap-3 text-[14px]", state === "now" ? "font-bold" : "font-semibold", state === "next" && "text-fg-subtle")}
            >
              {state === "done" ? (
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                </span>
              ) : state === "now" ? (
                <span className="h-7 w-7 shrink-0 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
              ) : (
                <span className="h-7 w-7 shrink-0 rounded-full border-[1.5px] border-dashed border-[#a9ad9f]" />
              )}
              {item.label}
              {item.stage === "reading" && step.stage === "reading" && step.total ? (
                <span className="tabular ml-auto text-[12px] font-semibold text-fg-subtle">
                  {step.done ?? 0} / {step.total}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
