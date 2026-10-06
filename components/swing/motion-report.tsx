import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PHASE_LABELS } from "@/lib/golf/swing-metrics";
import { describeMotionReading, motionCriteria, type MotionReading, type MotionReport, type MotionView } from "@/lib/golf/motion-analysis";
import { scoreSwing } from "@/lib/golf/swing-score";
import { SwingSeekButton } from "./seek-button";

export function SwingMotionSummary({ report, ballSide }: { report: MotionReport; ballSide?: "left" | "right" }) {
  const score = scoreSwing(report, ballSide);
  return <Card>
    <CardHeader className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Movement analysis</CardTitle>
        <Badge tone="neutral">Video overlay · 2D</Badge>
      </div>
      <p className="text-[12px] leading-relaxed text-fg-muted">{report.summary}</p>
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-[12px] font-semibold">Overall swing score · {report.view === "down_the_line" ? "Down the line" : report.view === "face_on" ? "Face on" : "Choose a view"}</p>
        {score.total === null ? <p className="mt-2 text-[22px] font-semibold leading-snug text-fg">{report.usable ? "Analysis complete · limited score" : "Complete swing needed"}</p> :
          <p className="tabular mt-2 text-[38px] font-semibold leading-none text-accent">{formatScore(score.total, score.totalRange)}<span className="text-[16px] text-fg-muted"> / 100</span></p>}
        <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">{score.reason ?? `${score.components.length} of 3 movement checks scored${score.missing.length ? " · partial score" : ""}. ${score.priorities.length ? "Start with the biggest opportunity below." : score.reviews.length ? "The transition range spans multiple scoring bands. Review that position below before changing your swing." : "These checks look controlled. Keep working on centered contact and confirm with another recording."}`}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-fg-subtle">A coaching estimate of visible movement, not a validated rating of technique or ball flight. Compare recordings from the same view and camera position.</p>
        {score.totalRange ? <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">{score.totalRange[0] === score.totalRange[1] ? "The observed hip positions across the estimated transition all fall in the same scoring band." : "The score range comes from the observed hip positions across the estimated transition. The exact top was hidden."} Rhythm is included only when its timing is precise enough.</p> : null}
      </div>
      {score.components.length ? <div className="grid gap-2 sm:grid-cols-3">{score.components.map((item) => <div key={item.id} className="rounded-lg border border-border p-3">
        <p className="text-[11px] text-fg-muted">{item.label}</p><p className="tabular mt-1 text-[20px] font-semibold">{formatScore(item.score, item.scoreRange)}<span className="text-[11px] text-fg-subtle"> / 100</span></p>
        {item.scoreRange ? <p className="mt-1 text-[10px] text-fg-subtle">Observed transition range</p> : null}
      </div>)}</div> : null}
      {score.priorities.length ? <div className="space-y-3 border-t border-border pt-3">
        <h3 className="text-[14px] font-semibold">Where to improve</h3>
        {score.priorities.map((item, index) => <div key={item.id} className="rounded-xl border border-border p-3">
          <p className="text-[13px] font-semibold">{index + 1}. {item.label}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{item.evidence}</p>
          <p className="mt-2 text-[12px] leading-relaxed"><span className="font-semibold">Try this: </span>{item.cue}</p>
          <p className="mt-2 text-[11px] leading-relaxed text-fg-muted"><span className="font-semibold">Check the change: </span>{item.check}</p>
          <SwingSeekButton time={item.time} />
        </div>)}
      </div> : null}
      {score.reviews.length ? <div className="space-y-3 border-t border-border pt-3">
        <h3 className="text-[14px] font-semibold">Position to review</h3>
        {score.reviews.map((item) => <div key={item.id} className="rounded-xl border border-border p-3">
          <p className="text-[13px] font-semibold">{item.label}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{item.evidence}</p>
          <p className="mt-2 text-[12px] leading-relaxed">The observed range spans controlled and less controlled positions, so it does not establish an improvement priority.</p>
          <p className="mt-2 text-[11px] leading-relaxed text-fg-muted">{item.check}</p>
          <SwingSeekButton time={item.time} />
        </div>)}
      </div> : null}
      {score.missing.length ? <div className="rounded-lg bg-info-soft p-3"><p className="text-[12px] font-semibold">Checks not scored in this recording</p><ul className="mt-2 space-y-1">{score.missing.map((message) => <li key={message} className="text-[11px] leading-relaxed text-fg-muted">{message}</li>)}</ul></div> : null}
      {score.components.length ? <details className="text-[11px] leading-relaxed text-fg-subtle"><summary className="min-h-8 cursor-pointer">How the score is calculated</summary>
        <p>Version 1 uses broad, adjustable coaching thresholds. Each check scores 0–100; the overall score is the weighted mean of available checks. At least two checks covering 70% of the planned weight are required. Observed hip-height ranges produce lower and upper score bounds rather than a guessed top position. Tracking quality only determines whether we can score.</p>
        {score.components.map((item) => <p key={item.id} className="mt-2"><span className="font-semibold">{item.label}: </span>{item.rubric}</p>)}
        <p className="mt-2">Normal movement varies between players. These thresholds need validation with coach-reviewed clips; a high score does not establish clubface control, swing plane, speed, pressure transfer or a good strike.</p>
      </details> : null}
      <div className="flex flex-wrap gap-2">
        <Badge tone={report.quality.coverage >= 0.85 ? "good" : "warn"}>Body visible: {Math.round(report.quality.coverage * 100)}%</Badge>
        <Badge tone="neutral">{report.phases ? report.timing?.source === "marked" ? "Video analysis" : "Automatic analysis" : "Complete swing needed"}</Badge>
        <Badge tone="neutral">{report.quality.total} samples</Badge>
      </div>
      {report.observations.length ? <ul className="space-y-3 border-t border-border pt-3">
        {report.observations.map((item) => <li key={item.title}>
          <p className="text-[13px] font-semibold">{item.title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{item.detail}</p>
        </li>)}
      </ul> : null}
      {report.warnings.length ? <details className="rounded-lg bg-warn-soft p-3">
        <summary className="cursor-pointer text-[12px] font-medium">Tracking notes ({report.warnings.length})</summary>
        <div className="mt-2 space-y-2">{report.warnings.map((warning) => <p key={warning} className="text-[11px] leading-relaxed text-fg-muted">{warning}</p>)}</div>
      </details> : null}
      <p className="text-[11px] leading-relaxed text-fg-subtle">Joint visibility is not an accuracy score. Contact is estimated from the hand path; timing is less precise when the hands are hidden or the video has fewer frames.</p>
    </CardContent>
  </Card>;
}

function formatScore(value: number, range?: [number, number]) {
  return range && range[0] !== range[1] ? `${range[0]}–${range[1]}` : String(value);
}

export function SwingMotionReport({ report, view = "other" }: { report: MotionReport | null; view?: MotionView }) {
  const criteria = motionCriteria(view);
  const measured = criteria.filter((criterion) => report?.readings.some((reading) => reading.id === criterion.id)).length;
  const missing = (id: string) => {
    if (!report) return "Select Analyze movement to read this from your clip.";
    if (!report.phases) return "Include one complete swing from setup through follow-through, then analyze again.";
    if (/^(lift|hips|head)_/.test(id) && !report.quality.cameraStable) return "The camera, feet or image scale moved. A fixed full-body recording is needed for this reading.";
    return "A required body joint is hidden in this frame. A clearer camera angle is needed for this reading.";
  };
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="dsp text-[20px] font-semibold tracking-[0.02em]">Swing criteria</h2>
      <Badge tone={measured === criteria.length ? "good" : "neutral"}>{measured} / {criteria.length} analyzed</Badge>
    </div>
    <p className="text-[12px] leading-relaxed text-fg-muted">These criteria are analyzed from the visible body in your video. Angles are measured in the picture; movement uses your stance or body height as its scale and compares against your own setup.</p>
    {(["address", "top", "impact"] as const).map((phase) => {
      const time = report?.readings.find((reading) => reading.phase === phase)?.time;
      const uncertainTop = phase === "top" && report?.timing?.topWindow;
      return <Card key={phase}>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>{PHASE_LABELS[phase]}{phase === "impact" || uncertainTop ? " estimate" : ""}</CardTitle>
          <span className="tabular text-[11px] text-fg-subtle">{time === undefined ? "Awaiting video analysis" : `${time.toFixed(3)}s${uncertainTop ? ` ± ${report!.timing!.uncertainty.toFixed(2)}s` : ""}`}</span>
        </CardHeader>
        <CardContent className="space-y-3.5">
          {uncertainTop ? <p className="rounded-lg bg-info-soft p-2.5 text-[11px] leading-relaxed text-fg-muted">The hands are briefly hidden. Readings show the observed body range across the estimated backswing transition.</p> : null}
          {criteria.filter((criterion) => criterion.phase === phase).map((criterion) => {
            const reading = report?.readings.find((row) => row.id === criterion.id);
            return <div key={criterion.id} data-swing-criterion={criterion.id} data-motion-criterion={criterion.id} data-analyzed={Boolean(reading)} className="border-t border-border pt-3.5 first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[12.5px] font-medium">{reading?.label ?? criterion.label}</p>
                {reading ? <p className="tabular text-[13px] font-semibold text-accent">{formatReading(reading)}</p> : <Badge tone="neutral">Cannot read this clip</Badge>}
              </div>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-fg-muted">{reading && report ? describeMotionReading(reading, report) : missing(criterion.id)}</p>
              {reading ? <details className="mt-1.5 text-[10.5px] leading-relaxed text-fg-subtle">
                <summary className="cursor-pointer">How this is measured</summary>
                <p className="mt-1">{reading.note}</p>
              </details> : null}
            </div>;
          })}
        </CardContent>
      </Card>;
    })}
    <p className="text-[11px] leading-relaxed text-fg-subtle">{view === "down_the_line" ? "Down-the-line readings use one consistently visible shoulder, hip and ankle. Shoulder-line tilt is omitted because the shoulders overlap in this view. " : ""}Exact chest/hip rotation, distances in inches and foot pressure cannot be established from this single view.</p>
  </div>;
}

function formatReading(reading: MotionReading) {
  const unit = reading.unit === "° in picture" ? "°" : reading.unit;
  return reading.range ? `≈ ${reading.range[0]} to ${reading.range[1]} ${unit}` : `≈ ${reading.value} ${unit}`;
}
