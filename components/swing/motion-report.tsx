import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { PHASE_LABELS } from "@/lib/golf/swing-metrics";
import { describeMotionReading, motionCriteria, type MotionReading, type MotionReport, type MotionView } from "@/lib/golf/motion-analysis";

export function SwingMotionSummary({ report }: { report: MotionReport }) {
  return <Card>
    <CardHeader className="gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Movement analysis</CardTitle>
        <Badge tone="neutral">Video overlay · 2D</Badge>
      </div>
      <p className="text-[12px] leading-relaxed text-fg-muted">{report.summary}</p>
    </CardHeader>
    <CardContent className="space-y-3">
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
    <p className="text-[11px] leading-relaxed text-fg-subtle">Video criteria describe movement rather than grade it against 3D reference bands. Exact chest/hip rotation, distances in inches and foot pressure cannot be established from this single view.</p>
  </div>;
}

function formatReading(reading: MotionReading) {
  const unit = reading.unit === "° in picture" ? "°" : reading.unit;
  return reading.range ? `≈ ${reading.range[0]} to ${reading.range[1]} ${unit}` : `≈ ${reading.value} ${unit}`;
}
