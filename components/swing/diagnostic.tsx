import { Info } from "lucide-react";

import type { SwingMeasurement, SwingSession } from "@/types/practice";
import { CLUB_LABELS, labelize } from "@/types/golf";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import {
  PHASE_LABELS,
  diagnoseSwing,
  formatMetricValue,
  type MetricReading,
  type SwingPhase,
} from "@/lib/golf/swing-metrics";
import { cn, formatDate } from "@/lib/utils";
import { Badge, Card, CardContent, CardHeader, CardTitle, Eyebrow } from "@/components/ui/primitives";

/**
 * The swing diagnostic: every tracked position against its reference band,
 * worst first. Same shape as a 3D capture report, with one difference stated
 * on the screen rather than buried - these values were typed in by a person,
 * because this app does not measure a swing from video.
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
      <div className="flex gap-3 rounded-xl border border-info/30 bg-info-soft p-3.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <p className="text-[12px] leading-[1.55] text-fg-muted">
          <span className="font-medium text-fg">Hand-measured, not machine-measured.</span> There is
          no pose estimation here, so every value below was entered by you or your coach. The bands
          are general references, not rules.
        </p>
      </div>

      {session ? (
        <p className="text-[11.5px] text-fg-subtle">
          {CLUB_LABELS[session.club]} &middot; {labelize(session.camera_angle)} &middot;{" "}
          {formatDate(session.created_at.slice(0, 10))}
        </p>
      ) : null}

      {diagnostic.measured === 0 ? (
        <Card>
          <CardContent className="p-5 text-[13px] text-fg-muted">
            Nothing measured yet. Add a value below and it appears here against its band.
          </CardContent>
        </Card>
      ) : (
        <>
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

          {phases.map((phase) => {
            const rows = diagnostic.readings.filter((r) => r.metric.phase === phase);
            if (rows.length === 0) return null;
            return (
              <Card key={phase}>
                <CardHeader>
                  <CardTitle>{PHASE_LABELS[phase]}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5">
                  {rows.map((reading) => (
                    <MetricRow key={reading.metric.id} reading={reading} />
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      {diagnostic.missing.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Not measured</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {diagnostic.missing.map((metric) => (
                <Badge key={metric.id} tone="neutral">
                  {metric.label} · {PHASE_LABELS[metric.phase].toLowerCase()}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function MetricRow({ reading }: { reading: MetricReading }) {
  const { metric, status } = reading;
  const inRange = status === "in_range";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[12.5px]">{metric.label}</span>
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
