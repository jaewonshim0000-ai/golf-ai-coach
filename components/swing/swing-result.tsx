import type { SwingResult } from "@/lib/swing/result";
import { cn } from "@/lib/utils";

const list = new Intl.ListFormat("en", { type: "conjunction" });

/** The score as a ring filling toward 10, the number in the middle. */
function ScoreRing({ score }: { score: number | null }) {
  const full = 2 * Math.PI * 38;
  return (
    <div
      role="img"
      aria-label={score !== null ? `Swing score ${score.toFixed(1)} out of 10` : "No score for this video"}
      className="relative h-[92px] w-[92px] shrink-0"
    >
      <svg width="92" height="92" viewBox="0 0 92 92" aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx="46" cy="46" r="38" fill="none" stroke="var(--c-surface-2)" strokeWidth="9" />
        {score !== null && score > 0 ? (
          <circle
            className="ring-wind"
            cx="46"
            cy="46"
            r="38"
            fill="none"
            stroke="var(--c-accent)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={full}
            strokeDashoffset={full * (1 - Math.min(10, score) / 10)}
            style={{ "--ring-full": full } as React.CSSProperties}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display tabular text-[30px]">{score !== null ? score.toFixed(1) : "—"}</span>
        <span className="mt-0.5 text-[10px] font-bold text-fg-subtle">/ 10</span>
      </span>
    </div>
  );
}

/**
 * What a player sees after an analysis, as the design's "What we found": the
 * score as a ring beside what it is made of and how it moved since the last
 * swing, each weakness as a row with a warning mark and a Drill button, a tick
 * when nothing is out of band, then the drills.
 */
export function SwingResultCard({ result, change = null }: { result: SwingResult; change?: number | null }) {
  const { score, reason, checks, weaknesses, drills } = result;
  return (
    <section id="swing-analysis" className="flex scroll-mt-6 flex-col gap-3.5" aria-label="Swing result">
      <div className="flex items-center gap-4">
        <ScoreRing score={score} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="dsp text-[26px] leading-none">What we found</h2>
          {reason || score === null ? (
            <p className="text-[12.5px] leading-[1.45] text-fg-subtle">{reason ?? "Too little of the swing was measured for a score."}</p>
          ) : checks.length ? (
            <p className="text-[12.5px] leading-[1.45] text-fg-subtle">Out of 10, from {list.format(checks.map((check) => check.toLowerCase()))}.</p>
          ) : null}
          {change !== null && Math.abs(change) >= 0.05 ? (
            <span
              className={cn(
                "inline-flex h-[26px] items-center self-start rounded-full px-2.5 text-[11px] font-bold",
                change > 0 ? "bg-accent-soft text-accent-strong" : "bg-bad-soft text-bad",
              )}
            >
              {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)} on your last swing
            </span>
          ) : null}
        </div>
      </div>

      {checks.length ? (
        <ul className="flex flex-col gap-3">
          {weaknesses.map((item) => (
            <li key={item.id} className="flex items-center gap-3">
              <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warn-soft text-[18px] text-warn" aria-hidden>
                !
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold leading-snug">{item.issue}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-fg-subtle">{item.evidence}</span>
              </span>
              {drills.length ? (
                <a href="#swing-drills" className="press dsp inline-flex h-9 shrink-0 items-center rounded-full border-[1.5px] border-fg px-3.5 text-[11px]">
                  Drill
                </a>
              ) : null}
            </li>
          ))}
          {weaknesses.length === 0 ? (
            <li className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-bold">Everything we measure is in band</span>
                <span className="mt-0.5 block text-[12.5px] text-fg-subtle">No clear weakness in the checks we can see.</span>
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {drills.length ? (
        <section id="swing-drills" className="mt-2 flex scroll-mt-6 flex-col gap-2.5">
          <h3 className="dsp text-[22px] leading-none">{weaknesses.length ? "Drills to fix it" : "Drills to keep it sharp"}</h3>
          <ol className="flex flex-col gap-2">
            {drills.map((drill, index) => (
              <li key={drill.id}>
                <details open={index === 0} className="group rounded-[22px] bg-surface-2">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
                    <span
                      className={cn(
                        "font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[15px]",
                        index === 0 ? "bg-accent text-white" : "border-[1.5px] border-fg",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-bold leading-snug">{drill.name}</span>
                      <span className="block text-[12px] text-fg-subtle">
                        {drill.recommended_reps} reps · {drill.recommended_duration} min
                      </span>
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <div className="pb-4 pl-[62px] pr-4 text-[13px] leading-normal text-fg-muted">
                    <p>{drill.description}</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5">
                      {drill.instructions.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    {drill.equipment_required.length ? (
                      <p className="mt-2 text-[12px] text-fg-subtle">Needs {list.format(drill.equipment_required)}</p>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
