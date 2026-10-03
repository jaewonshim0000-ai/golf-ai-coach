import { Info } from "lucide-react";

import type { SwingMeasurement, SwingSession } from "@/types/practice";
import { CLUB_LABELS, labelize } from "@/types/golf";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import {
  PHASE_LABELS,
  SWING_METRICS,
  diagnoseSwing,
  formatMetricValue,
  type MetricReading,
  type SwingPhase,
} from "@/lib/golf/swing-metrics";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader, CardTitle, Eyebrow } from "@/components/ui/primitives";

/**
 * Capture-style reference bands apply only to comparable coach measurements.
 * The automatic video criteria are rendered separately by SwingMotionReport.
 */
export function SwingDiagnostic({
  session,
  measurements,
}: {
  session: SwingSession | null;
  measurements: SwingMeasurement[];
}) {
  const diagnostic = diagnoseSwing(measurements);
  const phases: SwingPhase[] = ["address", "top", "impact"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="dsp text-[20px] font-semibold tracking-[0.02em]">Coach measurements</h2>
        <Badge tone="neutral">{diagnostic.measured} measurements</Badge>
      </div>
      <div className="flex gap-3 rounded-xl border border-info/30 bg-info-soft p-3.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p className="text-[12px] leading-[1.55] text-fg-muted">
          {diagnostic.posed > 0 ? (
            <>
              <span className="font-medium text-fg">
                {diagnostic.posed} of these {diagnostic.measured} were read off your body in the
                video.
              </span>{" "}
              A pose detector found your skeleton and measured it here on your device. One camera
              has to infer depth, so the turns are the softest numbers; type over anything that
              looks wrong. The bands are general references, not rules.
            </>
          ) : diagnostic.estimated > 0 ? (
            <>
              <span className="font-medium text-fg">
                {diagnostic.estimated} of these {diagnostic.measured} were estimated from video
                frames.
              </span>{" "}
              A model read them by eye, which is a good first pass and not a measurement. Type over
              anything that looks wrong and it becomes a measured value. The bands are general
              references, not rules.
            </>
          ) : (
            <>
              <span className="font-medium text-fg">Measurements added by you or your coach.</span>{" "}
              These reference bands use 3D angles or physical distances. They are general references,
              not rules, and are separate from the automatic video criteria.
            </>
          )}
        </p>
      </div>

      {session ? (
        <p className="text-[11.5px] text-fg-subtle">
          {CLUB_LABELS[session.club]} &middot; {labelize(session.camera_angle)} &middot;{" "}
          {formatDate(session.created_at.slice(0, 10))}
        </p>
      ) : null}

      {diagnostic.measured > 0 ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Out of range</CardTitle>
              <Badge tone={diagnostic.outOfRange.length === 0 ? "good" : "warn"}>
                {diagnostic.inRange}/{diagnostic.measured} in band
              </Badge>
            </CardHeader>
            <CardContent>
              {diagnostic.outOfRange.length === 0 ? (
                <p className="text-[13px] text-fg-muted">
                  Every measured position is inside its reference band.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {diagnostic.outOfRange.slice(0, 3).map((reading) => {
                    const drill = reading.drillId ? DRILLS_BY_ID.get(reading.drillId) : null;
                    return (
                      <li
                        key={reading.metric.id}
                        className="rounded-xl border border-border bg-surface-2 p-3.5"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[13px] font-semibold">{reading.metric.label}</span>
                          <Badge tone="neutral">{PHASE_LABELS[reading.metric.phase]}</Badge>
                          <span className="tabular text-[13px] font-semibold text-bad">
                            {formatMetricValue(reading.value, reading.metric.unit)}
                          </span>
                        </div>
                        <p className="mt-1.5 text-[12px] leading-[1.55] text-fg-muted">
                          {reading.note} {reading.metric.matters}
                        </p>
                        {drill ? (
                          <p className="mt-1.5 text-[12px]">
                            <span className="text-fg-subtle">Drill: </span>
                            {drill.name}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
      ) : null}
          {phases.map((phase) => {
            const metrics = SWING_METRICS.filter((metric) => metric.phase === phase && diagnostic.readings.some((row) => row.metric.id === metric.id));
            if (!metrics.length) return null;
            return (
              <Card key={phase}>
                <CardHeader>
                  <CardTitle>{PHASE_LABELS[phase]}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5">
                  {metrics.map((metric) => {
                    const reading = diagnostic.readings.find((row) => row.metric.id === metric.id);
                    return <div key={metric.id} className="border-t border-border pt-3.5 first:border-0 first:pt-0">
                      {reading ? <MetricRow reading={reading} /> : null}
                    </div>;
                  })}
                </CardContent>
              </Card>
            );
          })}
    </div>
  );
}

function MetricRow({ reading }: { reading: MetricReading }) {
  const { metric, status } = reading;
  const inRange = status === "in_range";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[12.5px]">
          {metric.label}
          {reading.source === "vision" ? (
            <span className="dsp ml-1.5 text-[9px] tracking-[0.14em] text-fg-subtle">est.</span>
          ) : reading.source === "pose" ? (
            <span className="dsp ml-1.5 text-[9px] tracking-[0.14em] text-fg-subtle">pose</span>
          ) : null}
        </span>
        <span
          className={cn(
            "tabular shrink-0 text-[12.5px] font-semibold",
            inRange ? "text-good" : "text-bad",
          )}
        >
          {formatMetricValue(reading.value, metric.unit)}
        </span>
      </div>

      {/*
        The band is the middle 70% of the track, so a value outside it has
        somewhere to sit without the marker falling off the end.
      */}
      <div className="relative mt-1.5 h-2 rounded-full bg-track">
        <div className="absolute inset-y-0 left-[15%] right-[15%] rounded-full bg-good-soft" />
        <span
          className={cn(
            "absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface",
            inRange ? "bg-good" : "bg-bad",
          )}
          style={{
            left: inRange
              ? `${15 + reading.position * 70}%`
              : status === "below"
                ? `${Math.max(3, 15 - reading.severity * 15)}%`
                : `${Math.min(97, 85 + reading.severity * 15)}%`,
          }}
        />
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-fg-subtle">
        <span className="tabular">{formatMetricValue(metric.min, metric.unit)}</span>
        <Eyebrow className="tracking-[0.12em]">
          {inRange ? "in band" : status === "below" ? metric.low : metric.high}
        </Eyebrow>
        <span className="tabular">{formatMetricValue(metric.max, metric.unit)}</span>
      </div>
    </div>
  );
}
