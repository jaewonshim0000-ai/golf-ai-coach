import type { SwingResult } from "@/lib/swing/result";

const list = new Intl.ListFormat("en", { type: "conjunction" });

/**
 * What a player sees after an analysis, as the design's "What we found": the
 * score in a stone circle, each weakness as a row with a warning mark and a
 * Drill button, a tick when nothing is out of band, then the drills.
 */
export function SwingResultCard({ result }: { result: SwingResult }) {
  const { score, reason, checks, weaknesses, drills } = result;
  return (
    <section id="swing-analysis" className="flex scroll-mt-6 flex-col gap-3.5" aria-label="Swing result">
      <div className="flex items-center justify-between gap-3">
        <h2 className="dsp text-[26px] leading-none">What we found</h2>
        <span
          aria-label={score !== null ? `Swing score ${score.toFixed(1)} out of 10` : "No score for this video"}
          className="font-display tabular flex h-[50px] min-w-[50px] items-center justify-center rounded-full bg-surface-2 px-2 text-[20px]"
        >
          {score !== null ? score.toFixed(1) : "—"}
        </span>
      </div>
      {reason || score === null ? (
        <p className="text-[13px] leading-relaxed text-fg-subtle">{reason ?? "Too little of the swing was measured for a score."}</p>
      ) : checks.length ? (
        <p className="text-[12.5px] leading-relaxed text-fg-subtle">Out of 10, from {list.format(checks.map((check) => check.toLowerCase()))}.</p>
      ) : null}

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
                <details className="group rounded-[22px] bg-surface-2">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-3">
                    <span className="font-display flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-fg text-[15px]">
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
                  <div className="px-4 pb-4 text-[13px] leading-relaxed">
                    <p className="text-fg-muted">{drill.description}</p>
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
