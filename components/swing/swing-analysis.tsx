import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import type { PoseModel } from "@/lib/golf/pose";
import type { MotionReport } from "@/lib/golf/motion-analysis";
import { scoreReconstruction } from "@/lib/golf/reconstruction-score";
import { SwingSeekButton } from "./seek-button";

export function SwingAnalysis({ model, report }: { model: PoseModel; report: MotionReport }) {
  const score = scoreReconstruction(model, report);
  const strength = score.components.find((component) => (component.scoreRange?.[0] ?? component.score) >= 85);
  return <section id="swing-analysis" className="scroll-mt-6 grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]" aria-label="Swing score and analysis">
    <Card>
      <CardHeader><CardTitle>Swing score</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {score.total === null ? <p className="text-[22px] font-semibold">More evidence needed</p> : <p className="tabular text-[54px] font-semibold leading-none text-accent">
          {score.totalRange && score.totalRange[0] !== score.totalRange[1] ? `${score.totalRange[0]}–${score.totalRange[1]}` : score.total}<span className="text-[18px] text-fg-muted"> / 100</span>
        </p>}
        <Badge tone="neutral">{score.total !== null && score.missing.length ? "Partial coaching score" : "Coaching estimate"}</Badge>
        <p className="text-[12px] leading-relaxed text-fg-muted">{score.reason ?? (score.missing.length ? `A partial score from ${score.components.length} supported checks. ${score.missing.join(" ")}` : "Based on reconstructed posture, visible body control and swing rhythm. Compare your own recordings from the same position.")}</p>
        <p className="text-[11px] leading-relaxed text-fg-subtle">One-camera depth is estimated. This score does not measure clubface, ball flight or handicap.</p>
        <details className="text-[11px] leading-relaxed text-fg-subtle"><summary className="min-h-8 cursor-pointer">About this score</summary>
          <p>Posture contributes 40%, body control 30%, rhythm 30%. Missing checks are excluded; two checks covering at least 70% are required. Nearby observed model positions produce a score range when needed. These coaching thresholds have not been validated against coach-rated swings.</p>
          {score.components.map((component) => <p key={component.id} className="mt-2">{component.rubric}</p>)}
          {score.missing.map((message) => <p key={message} className="mt-2">{message}</p>)}
        </details>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>Your swing analysis</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {strength ? <div className="rounded-xl bg-good-soft p-3">
          <p className="text-[12px] font-semibold text-good">What looks controlled · {strength.label}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{strength.evidence}</p>
        </div> : null}
        {score.priorities.map((component, index) => <div key={component.id} className="border-t border-border pt-4 first:border-0 first:pt-0">
          <h3 className="text-[14px] font-semibold">{index + 1}. {component.label}</h3>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">{component.evidence}</p>
          <p className="mt-2 text-[12px] leading-relaxed"><span className="font-semibold">Try this: </span>{component.cue}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">{component.check}</p>
          <SwingSeekButton time={component.time} />
        </div>)}
        {score.reviews.map((component) => <div key={component.id} className="rounded-xl border border-border p-3">
          <p className="text-[13px] font-semibold">Review {component.label.toLowerCase()}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{component.evidence} Nearby model positions span different scoring bands, so this is a position to review before changing your swing.</p>
          <SwingSeekButton time={component.time} />
        </div>)}
        {!score.priorities.length && !score.reviews.length ? <p className="text-[12px] leading-relaxed text-fg-muted">{score.total === null ? report.summary : "No large movement deductions in the supported checks. Keep working on centered contact and repeat the recording to check consistency."}</p> : null}
        {report.warnings.length ? <details className="text-[11px] leading-relaxed text-fg-subtle"><summary className="min-h-8 cursor-pointer">Recording notes</summary>
          {report.warnings.map((warning) => <p key={warning} className="mt-2">{warning}</p>)}
        </details> : null}
      </CardContent>
    </Card>
  </section>;
}
