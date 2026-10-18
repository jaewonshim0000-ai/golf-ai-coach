import { Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import type { FaceOnReview } from "@/lib/golf/face-on-review";
import type { MotionReading, MotionReport } from "@/lib/golf/motion-analysis";
import type { BallFlight, SwingPhases } from "@/lib/golf/pose";
import type { SwingFeedback } from "@/lib/golf/faults";
import { SwingSeekButton } from "./seek-button";
import { BallFlightQuestion } from "./ball-flight";
import { FaultFeedback } from "./fault-feedback";

export function SwingAnalysis({ review, report, phaseTimes, setup, comparison, previousHref, sessionId, coachingKey, flight, handedness, feedback, progress }: {
  review: FaceOnReview; report: MotionReport; phaseTimes: Record<keyof SwingPhases, number> | null;
  /** Club readings from the player's setup marks; empty until they check their setup. */
  setup: MotionReading[];
  comparison?: string | null; previousHref?: string; sessionId: string; coachingKey: string;
  flight: BallFlight | null; handedness: "right" | "left"; feedback: SwingFeedback;
  /** The earlier swing's main fault, measured again on this one. */
  progress?: { text: string; href: string } | null;
}) {
  const supported = report.usable || review.status !== "record_again";
  return <section id="swing-analysis" className="scroll-mt-6 space-y-4" aria-label="Swing video analysis">
    <Card>
      <CardHeader><CardTitle>2D swing analysis</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone="neutral">{report.view === "face_on" ? "Face on" : report.view === "down_the_line" ? "Down the line" : "Other camera angle"}</Badge>
          <Badge tone={supported ? "good" : "warn"}>{supported ? "Video reviewed" : "Limited tracking"}</Badge>
          {phaseTimes ? <Badge tone={setup.length ? "good" : "neutral"}>{setup.length ? "Setup checked" : "Setup not checked"}</Badge> : null}
        </div>
        <p className="text-[13px] leading-relaxed text-fg-muted">{report.usable ? report.summary : review.message}</p>
        {phaseTimes ? <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface-2 p-3">
          {(["address", "top", "impact"] as const).map((phase) => <div key={phase}>
            <p className="text-[12px] font-semibold">{phase === "address" ? "Setup" : phase === "top" ? report.timing?.topWindow ? "Top estimate" : "Top" : report.timing?.source === "marked" ? "Contact (marked)" : "Contact estimate"}</p>
            <SwingSeekButton time={phaseTimes[phase]} />
          </div>)}
        </div> : <p className="rounded-xl bg-info-soft p-3 text-[12px] leading-relaxed text-fg-muted">Exact swing positions could not be identified. Use “Adjust swing timing” beside the video to mark the visible setup, top and contact frames.</p>}
        {setup.length ? <div className="rounded-xl border border-border p-3">
          <h3 className="text-[13px] font-semibold">Club at setup</h3>
          {setup.map((reading) => <p key={reading.id} className="mt-1 text-[12px] leading-relaxed text-fg-muted"><span className="font-medium text-fg">{reading.label}.</span> {reading.note}</p>)}
          <SwingSeekButton time={setup[0]!.time} />
        </div> : phaseTimes ? <p className="rounded-xl bg-info-soft p-3 text-[12px] leading-relaxed text-fg-muted">Use “Check your setup” beside the video to confirm the tracking is on you and mark your club. The shaft angle{report.view === "down_the_line" ? " and plane line come" : report.view === "face_on" ? " and ball position come" : " comes"} from those marks.</p> : null}
        {report.tempo ? <div className="rounded-xl border border-border p-3">
          <h3 className="text-[13px] font-semibold">Video timing · about {report.tempo.ratio}:1</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">Backswing {report.tempo.backswing.toFixed(2)}s · downswing {report.tempo.downswing.toFixed(2)}s · timing uncertainty about ±{report.tempo.uncertainty.toFixed(2)}s. Slow-motion recordings change these durations; contact is estimated from the hand path.</p>
        </div> : phaseTimes ? <p className="text-[12px] leading-relaxed text-fg-muted">Timing is too uncertain for a rhythm measurement in this recording.</p> : null}
        {report.warnings.length ? <details className="rounded-xl bg-info-soft p-3 text-[12px] leading-relaxed text-fg-muted">
          <summary className="min-h-8 cursor-pointer font-medium">Recording notes ({report.warnings.length})</summary>
          {report.warnings.map((note) => <p key={note} className="mt-2">{note}</p>)}
        </details> : null}
        {review.status !== "record_again" ? <details className="text-[12px] leading-relaxed text-fg-muted">
          <summary className="min-h-10 cursor-pointer font-medium text-accent">Movement during {review.scope === "backswing" ? "the backswing" : "the visible segment"}</summary>
          {review.metrics.map((metric) => <div key={metric.id} className="mt-2 rounded-xl bg-surface-2 p-3">
            <h3 className="text-[13px] font-semibold">{metric.label}</h3>
            <p className="mt-1">{metric.evidence}</p>
            <SwingSeekButton time={metric.time} />
          </div>)}
          {review.notes.map((note) => <p key={note} className="mt-2">{note}</p>)}
        </details> : null}
        {comparison ? <div className="rounded-xl border border-border p-3">
          <p className="text-[13px] font-semibold">Compared with your earlier swing</p>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">{comparison}</p>
          {previousHref ? <a href={previousHref} className="mt-2 inline-block min-h-10 text-[12px] font-medium text-accent">Open earlier recording</a> : null}
        </div> : null}
        <BallFlightQuestion sessionId={sessionId} saved={flight} handedness={handedness} />
        <FaultFeedback key={coachingKey} sessionId={sessionId} feedback={feedback} reported={Boolean(flight)} />
        {progress ? <div className="rounded-xl border border-border p-3">
          <p className="text-[13px] font-semibold">Since your last swing with this club</p>
          <p className="mt-2 text-[12px] leading-relaxed text-fg-muted">{progress.text}</p>
          <a href={progress.href} className="mt-2 inline-block min-h-10 text-[12px] font-medium text-accent">Open earlier recording</a>
        </div> : null}
        {!feedback.primary && supported ? <div className="space-y-2 border-t border-border pt-4">
          <h3 className="text-[15px] font-semibold">Try this · {review.practice.title}</h3>
          <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-fg-muted">
            {review.practice.steps.map((step) => <li key={step}>{step}</li>)}
          </ol>
          <p className="text-[12px] leading-relaxed text-fg-muted">{review.practice.check}</p>
        </div> : null}
        <p className="text-[11px] leading-relaxed text-fg-subtle">Measurements describe visible positions in this camera view. The clubface, the club's low point and foot pressure are not visible; ball flight comes from your answer.</p>
      </CardContent>
    </Card>
  </section>;
}
