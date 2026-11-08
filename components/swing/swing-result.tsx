import type { SwingResult } from "@/lib/swing/result";
import { Card, Eyebrow, InkCard } from "@/components/ui/primitives";

const list = new Intl.ListFormat("en", { type: "conjunction" });

/** What a player sees after an analysis: the score, the weakness and drills to fix it. */
export function SwingResultCard({ result }: { result: SwingResult }) {
  const { score, reason, checks, weaknesses, drills } = result;
  return <section id="swing-analysis" className="scroll-mt-6 space-y-3" aria-label="Swing result">
    <InkCard className="p-5">
      <Eyebrow className="text-ink-fg/70">Swing score</Eyebrow>
      {score !== null
        ? <p className="font-display tabular mt-2 text-[56px] leading-none">{score}<span className="text-[20px] text-ink-fg/60"> / 100</span></p>
        : <p className="mt-2 text-[18px] font-semibold">No score for this video</p>}
      <p className="mt-3 text-[12px] leading-relaxed text-ink-fg/70">{reason ?? `From ${list.format(checks.map((check) => check.toLowerCase()))}.`}</p>
    </InkCard>

    {checks.length ? <Card className="p-5">
      <h2 className="text-[15px] font-semibold">{weaknesses.length > 1 ? "Your main weaknesses" : "Your main weakness"}</h2>
      {weaknesses.length ? <ol className="mt-3 space-y-3">{weaknesses.map((item) => <li key={item.id}>
        <p className="text-[14px] font-medium leading-snug">{item.issue}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{item.evidence}</p>
      </li>)}</ol> : <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">No clear weakness in the checks we can measure.</p>}
    </Card> : null}

    {drills.length ? <Card className="p-5">
      <h2 className="text-[15px] font-semibold">{weaknesses.length ? "Drills to fix it" : "Drills to keep it sharp"}</h2>
      <ol className="mt-3 space-y-4">{drills.map((drill, index) => <li key={drill.id} className="border-t border-border pt-4 first:border-0 first:pt-0">
        <p className="text-[14px] font-semibold leading-snug"><span className="text-fg-subtle">{index + 1}.</span> {drill.name}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{drill.description}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed">{drill.instructions.map((step) => <li key={step}>{step}</li>)}</ol>
        <p className="mt-2 text-[12px] text-fg-subtle">{drill.recommended_reps} reps · {drill.recommended_duration} min
          {drill.equipment_required.length ? ` · needs ${list.format(drill.equipment_required)}` : ""}</p>
      </li>)}</ol>
    </Card> : null}
  </section>;
}
