import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";

import type { Weakness } from "@/types/analytics";
import type { SuggestedSession } from "@/lib/practice/session";
import { ButtonLink } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/*
  The Practice home pieces from the design: the priority card over the
  fairway, today's session as a numbered list, and - before there is enough
  data for either - the baseline card and the get-started checklist.
*/

/** The fairway behind the priority, with a ball flying to the flag. */
function PriorityArt() {
  return (
    <svg viewBox="0 0 390 300" preserveAspectRatio="xMidYMid slice" aria-hidden className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="priority-scrim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.35" stopColor="#14180F" stopOpacity="0" />
          <stop offset="1" stopColor="#14180F" stopOpacity="0.82" />
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
      <path d="M40 272 Q150 30 270 190" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="2 6" />
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

/** The one thing costing the most, over the fairway. Opens the evidence. */
export function PriorityHero({ weakness }: { weakness: Weakness }) {
  const trend = TREND[weakness.trend_label];
  const evidence = weakness.evidence.find((item) => item.source === "course") ?? weakness.evidence[0];
  return (
    <Link
      href={`/rounds/insights#${weakness.key}`}
      aria-label={`Priority one: ${weakness.title}, ${weakness.strokes_lost_per_round.toFixed(1)} strokes a round. Open the evidence.`}
      className="press-lg relative block h-[212px] shrink-0 overflow-hidden rounded-[28px] text-white"
    >
      <PriorityArt />
      <span className="dsp absolute left-4 top-4 inline-flex h-[30px] items-center rounded-full bg-white/[0.88] px-3 text-[11px] text-[#1e211b]">
        Priority #1
      </span>
      {trend ? (
        <span className="absolute right-4 top-4 inline-flex h-[30px] items-center gap-1.5 rounded-full bg-[rgb(20_24_15_/_0.55)] px-3 text-[12px] font-semibold">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#E8C547" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {weakness.trend_label === "declining" ? (
              <>
                <path d="m3 7 6 6 4-4 8 8" />
                <path d="M21 11v6h-6" />
              </>
            ) : weakness.trend_label === "flat" ? (
              <path d="M4 12h16M15 7l5 5-5 5" />
            ) : (
              <>
                <path d="m3 17 6-6 4 4 8-8" />
                <path d="M21 13V7h-6" />
              </>
            )}
          </svg>
          {trend}
        </span>
      ) : null}
      <div className="absolute inset-x-[18px] bottom-4 flex flex-col gap-1.5">
        <span className="text-[24px] font-bold leading-[1.12] tracking-[-0.01em]">{weakness.title}</span>
        <span className="line-clamp-2 text-[13px] leading-[1.4] text-white/[0.86]">
          Costing you {weakness.strokes_lost_per_round.toFixed(1)} strokes a round.
          {evidence ? ` ${evidence.statement}` : ""}
        </span>
      </div>
    </Link>
  );
}

/** Today's session: numbered drills, all drills, and the start button. */
export function TodayCard({ session }: { session: SuggestedSession | null }) {
  return (
    <section aria-labelledby="today" className="relative flex flex-col gap-3 rounded-[28px] bg-surface p-[18px]">
      <div className="flex items-center justify-between gap-3">
        <h2 id="today" className="dsp text-[24px] leading-none">
          Today&apos;s session
        </h2>
        <Link
          href="/practice/drills"
          className="press dsp inline-flex h-[30px] items-center rounded-full border-[1.5px] border-fg px-3 text-[11px] tracking-[0.06em]"
        >
          All drills
        </Link>
      </div>

      {session && session.drills.length > 0 ? (
        <>
          <ol className="flex flex-col gap-2">
            {session.drills.map((drill, index) => (
              <li key={drill.id} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px]",
                      index === 0 ? "bg-accent text-white" : "bg-surface-2 text-fg",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{drill.name}</span>
                  <span className="shrink-0 text-[13px] font-semibold text-fg-subtle">
                    {drill.recommended_duration} min
                  </span>
              </li>
            ))}
          </ol>
          <ButtonLink href="/practice/start" className="h-[50px] w-full text-[14px] tracking-[0.06em]">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
              <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
            </svg>
            Start session
          </ButtonLink>
        </>
      ) : (
        <>
          <p className="text-[14px] leading-relaxed text-fg-muted">
            Log a round and today&apos;s work is built from whatever is costing you the most. Until then, build your
            own.
          </p>
          <ButtonLink href="/practice/start" className="h-[50px] w-full text-[14px] tracking-[0.06em]">
            Build a session
          </ButtonLink>
        </>
      )}
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
