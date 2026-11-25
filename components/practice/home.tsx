import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";

import type { Weakness } from "@/types/analytics";
import type { PracticeBlock } from "@/types/practice";
import { MiniSpark } from "@/components/charts";
import { BlockBar } from "@/components/practice/block-bar";
import { ButtonLink } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/*
  The Practice home pieces from the design: the priority card over the
  fairway, this week's sessions and the swing score side by side, today's
  session as a bar of blocks, and - before there is enough data for a
  priority - the baseline card and the get-started checklist.
*/

/** The fairway behind the priority, with a ball flying to the flag. */
function PriorityArt() {
  return (
    <svg viewBox="0 0 390 300" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="priority-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.3" stopColor="#14180F" stopOpacity="0" />
          <stop offset="1" stopColor="#14180F" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect width="390" height="300" fill="#D9E0CB" />
      <path d="M0 110 Q70 84 140 104 T270 96 T390 104 V300 H0Z" fill="#9AAE74" />
      <path
        d="M0 146 C20 124 34 136 48 126 C62 114 76 132 92 122 C110 110 122 130 140 120 C160 108 174 128 192 118 C212 106 226 126 246 116 C266 104 280 124 300 114 C320 104 336 122 354 114 C370 108 382 118 390 114 V300 H0Z"
        fill="#3E5426"
      />
      <path d="M0 188 Q195 158 390 184 V300 H0Z" fill="#7C9C45" />
      <ellipse cx="262" cy="194" rx="72" ry="14" fill="#A6C266" />
      <path d="M0 240 Q195 220 390 244 V300 H0Z" fill="#62832F" />
      <line x1="276" y1="146" x2="276" y2="194" stroke="#F4F1E8" strokeWidth="2.5" />
      <path className="flag-wave" d="M276 146 l22 7 -22 7z" fill="#E8C547" />
      <circle r="4" fill="#FFFFFF" className="motion-reduce:hidden">
        <animateMotion dur="3s" repeatCount="indefinite" path="M40 272 Q150 30 270 190" calcMode="spline" keyTimes="0;1" keySplines=".25 .6 .4 1" />
        <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.06;.88;1" dur="3s" repeatCount="indefinite" />
      </circle>
      <rect width="390" height="300" fill="url(#priority-scrim)" />
    </svg>
  );
}

const TREND: Record<Weakness["trend_label"], string | null> = {
  improving: "Improving",
  declining: "Getting worse",
  flat: "Holding steady",
  insufficient_data: null,
};

function TrendIcon({ label }: { label: Weakness["trend_label"] }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8C547" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0">
      {label === "declining" ? (
        <>
          <path d="m3 7 6 6 4-4 8 8" />
          <path d="M21 11v6h-6" />
        </>
      ) : label === "flat" ? (
        <path d="M4 12h16M15 7l5 5-5 5" />
      ) : (
        <>
          <path d="m3 17 6-6 4 4 8-8" />
          <path d="M21 13V7h-6" />
        </>
      )}
    </svg>
  );
}

/** The one thing costing the most, over the fairway. Opens the evidence. */
export function PriorityHero({ weakness }: { weakness: Weakness }) {
  const trend = TREND[weakness.trend_label];
  const evidence = weakness.evidence.find((item) => item.source === "course") ?? weakness.evidence[0];
  const lost = weakness.strokes_lost_per_round.toFixed(1);
  const line = [trend, evidence?.statement].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/rounds/insights#${weakness.key}`}
      aria-label={`Priority one: ${weakness.title} costs ${lost} strokes a round${trend ? `, ${trend.toLowerCase()}` : ""}. Open the evidence.`}
      className="press-lg relative block h-[192px] shrink-0 overflow-hidden rounded-[28px] text-white shadow-[0_18px_32px_-20px_rgb(30_33_27_/_0.7)]"
    >
      <PriorityArt />
      <span className="dsp absolute left-4 top-4 inline-flex h-7 items-center rounded-full bg-white/90 px-3 text-[10px] tracking-[0.1em] text-[#1e211b]">
        Priority #1
      </span>
      <span className="absolute right-3.5 top-3.5 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-[#23271f] leading-none">
        <span className="font-display tabular text-[20px] text-[#f2b59b]">−{lost}</span>
        <span className="mt-0.5 text-[9px] font-bold tracking-[0.06em] text-[#c9ccbf]">/ ROUND</span>
      </span>
      <div className="absolute inset-x-[18px] bottom-4 flex flex-col gap-1">
        <span className="text-[22px] font-bold leading-[1.12] tracking-[-0.01em]">{weakness.title}</span>
        {line ? (
          <span className="flex items-start gap-1.5 text-[13px] leading-[1.35] text-white/[0.88]">
            {trend ? <TrendIcon label={weakness.trend_label} /> : null}
            <span className="line-clamp-2">{line}</span>
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/** Sessions done this week against the player's weekly target, as a ring. */
export function WeekCard({ done, target, minutes }: { done: number; target: number; minutes: number }) {
  const full = 2 * Math.PI * 28;
  const share = target > 0 ? Math.min(1, done / target) : 0;
  return (
    <Link
      href="/practice/history"
      className="press-lg flex min-w-0 flex-col gap-2.5 rounded-[26px] bg-surface p-3.5 shadow-[var(--shadow-card)]"
    >
      <span className="dsp text-[11px] tracking-[0.1em] text-fg-subtle">This week</span>
      <span className="flex items-center gap-2.5">
        <span role="img" aria-label={`${done} of ${target} sessions`} className="relative h-16 w-16 shrink-0">
          <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="absolute inset-0 -rotate-90">
            <circle cx="32" cy="32" r="28" fill="none" stroke="var(--c-surface-2)" strokeWidth="7" />
            {share > 0 ? (
              <circle
                className="ring-wind"
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke="var(--c-accent)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={full}
                strokeDashoffset={full * (1 - share)}
                style={{ "--ring-full": full } as React.CSSProperties}
              />
            ) : null}
          </svg>
          <span className="font-display tabular absolute inset-0 flex items-center justify-center text-[18px]">
            {done}/{target}
          </span>
        </span>
        <span className="text-[13px] font-semibold leading-[1.3]">
          session{target === 1 ? "" : "s"}
          <br />
          <span className="font-medium text-fg-subtle">{minutes} min</span>
        </span>
      </span>
    </Link>
  );
}

/** The swing score on the dark card: the recent average, its change and its line. */
export function SwingScoreCard({ average, change, values }: { average: number | null; change: number | null; values: number[] }) {
  const rising = values.length > 1 && values.at(-1)! >= values[0]!;
  return (
    <Link
      href="/swing"
      className="press-lg flex min-w-0 flex-col gap-1.5 overflow-hidden rounded-[26px] bg-ink p-3.5 text-white shadow-[var(--shadow-ink)]"
    >
      <span className="dsp text-[11px] tracking-[0.1em] text-[#c9ccbf]">Swing score</span>
      {average === null ? (
        <span className="text-[13px] leading-[1.35] text-[#c9ccbf]">Record a swing to get a score out of 10.</span>
      ) : (
        <>
          <span className="flex items-baseline gap-1.5">
            <span className="font-display tabular text-[34px] leading-none">{average.toFixed(1)}</span>
            {change !== null && Math.abs(change) >= 0.05 ? (
              <span className={cn("text-[12px] font-bold", change > 0 ? "text-[#a6c266]" : "text-[#f2b59b]")}>
                {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}
              </span>
            ) : null}
          </span>
          <MiniSpark values={values} label={`${rising ? "Rising" : "Falling"} over the last ${values.length} swings`} />
        </>
      )}
    </Link>
  );
}

/** Today's session: its blocks as one bar, the first drill, and the start button. */
export function TodayCard({
  minutes,
  blocks,
  firstUp,
}: {
  minutes: number;
  blocks: { block: PracticeBlock; duration: number }[];
  firstUp: string | null;
}) {
  return (
    <section aria-labelledby="today" className="relative flex flex-col gap-3 rounded-[28px] bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="today" className="dsp text-[22px] leading-none">
          Today&apos;s session
        </h2>
        <span className="tabular inline-flex h-7 items-center rounded-full bg-surface-2 px-2.5 text-[12px] font-bold">
          {minutes} min
        </span>
      </div>
      <BlockBar blocks={blocks} />
      {firstUp ? (
        <p className="text-[13px] text-fg-subtle">
          First up: <strong className="text-fg">{firstUp}</strong>
        </p>
      ) : null}
      <ButtonLink href="/practice/start" className="h-[50px] w-full text-[13px]">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
          <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
        </svg>
        Start session
      </ButtonLink>
    </section>
  );
}

/** Before there is a priority: why not, and how close the baseline is. */
export function BaselineCard({ done, total }: { done: number; total: number }) {
  return (
    <section className="relative flex flex-col gap-3 rounded-[28px] bg-ink p-5 text-white">
      <p className="dsp text-[11px] tracking-[0.12em] text-gold">Priority #1</p>
      <h2 className="dsp text-[30px] leading-none">Building your baseline</h2>
      <p className="text-[14px] leading-[1.5] text-[#c9ccbf]">
        There isn&apos;t enough data to name a priority yet. Guessing would be worse than waiting. Two rounds is usually
        enough.
      </p>
      <div className="mt-1 flex gap-1.5" aria-label={`Baseline ${done} of ${total}`}>
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={cn("h-1.5 flex-1 rounded-full", index < done ? "bg-accent" : "bg-white/[0.12]")} />
        ))}
      </div>
    </section>
  );
}

/** The checklist that gets a new player to their first priority. */
export function GetStarted({
  steps,
}: {
  steps: { title: string; detail: string; href: string; done: boolean }[];
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="dsp text-[24px] leading-none">Get started</h2>
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Link href={step.href} className="press-lg flex items-center gap-3.5 rounded-[22px] bg-surface px-3.5 py-3.5">
              {step.done ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                  <Check className="h-4 w-4" strokeWidth={3} />
                </span>
              ) : (
                <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-fg text-[16px]">
                  {index + 1}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[16px] font-bold", step.done && "text-fg-subtle line-through")}>
                  {step.title}
                </span>
                <span className="mt-0.5 block text-[12.5px] text-fg-subtle">{step.done ? "Done" : step.detail}</span>
              </span>
              {step.done ? null : <ChevronRight className="h-5 w-5 shrink-0 text-fg-muted" />}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
