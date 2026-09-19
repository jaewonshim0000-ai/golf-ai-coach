import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Target } from "lucide-react";

import { SwingDiagnostic } from "@/components/swing/diagnostic";
import { MeasurementForm } from "@/components/swing/measurement-form";
import { SwingVideo } from "@/components/swing/swing-video";
import {
  Badge,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Eyebrow,
  InkCard,
  PageHero,
} from "@/components/ui/primitives";
import { CLUB_LABELS, labelize } from "@/types/golf";
import { GOAL_LABELS } from "@/types/player";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import { diagnoseSwing, formatMetricValue } from "@/lib/golf/swing-metrics";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Swing" };
export const dynamic = "force-dynamic";

export default async function SwingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await repo.currentUser();
  if (!user) return null;

  const state = await loadPlayerState(user.id);
  const session = state.swingSessions.find((candidate) => candidate.id === id);
  if (!session) notFound();

  const measurements = state.swingMeasurements.filter((m) => m.swing_session_id === session.id);
  const findings = state.swingFindings.filter((f) => f.swing_session_id === session.id);
  const diagnostic = diagnoseSwing(measurements);

  const worst = diagnostic.outOfRange[0] ?? null;
  const topFinding = findings[0] ?? null;
  const drill = worst?.drillId ? DRILLS_BY_ID.get(worst.drillId) : undefined;
  const goals = state.profile ? [state.profile.primary_goal, ...state.profile.secondary_goals] : [];

  return (
    <div className="space-y-5">
      <PageHero
        art="dusk"
        size="sm"
        eyebrow={`${labelize(session.camera_angle)} · ${formatDate(session.created_at.slice(0, 10))}`}
        title={CLUB_LABELS[session.club]}
        topLeft={
          <ButtonLink href="/swing" variant="onHero" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" /> Swings
          </ButtonLink>
        }
      />

      <div className="relative grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <SwingVideo id={session.id} videoUrl={session.video_url} trimmable />

        <div className="space-y-5">
          {/* The one thing to fix. Everything else on this screen sits below it. */}
          <InkCard>
            <div className="p-5">
              <Eyebrow className="tracking-[0.2em] text-white/60">Biggest issue</Eyebrow>
              {worst ? (
                <>
                  <h2 className="dsp mt-2.5 text-[26px] font-semibold leading-[1.02] tracking-[-0.015em]">
                    {worst.metric.label}
                  </h2>
                  <p className="tabular mt-2 text-[13px] text-gold">
                    {formatMetricValue(worst.value, worst.metric.unit)} &middot; band{" "}
                    {formatMetricValue(worst.metric.min, worst.metric.unit)} to{" "}
                    {formatMetricValue(worst.metric.max, worst.metric.unit)}
                  </p>
                  <p className="mt-3 text-[13px] leading-[1.55] text-ink-fg/80">{worst.note}</p>
                  {drill ? (
                    <div className="mt-4 border-t border-white/15 pt-4">
                      <Eyebrow className="tracking-[0.17em] text-white/50">Work on it</Eyebrow>
                      <p className="mt-1.5 text-[13px] font-medium">{drill.name}</p>
                      <ButtonLink
                        href="/practice/start?goal=swing"
                        size="sm"
                        variant="onHeroSolid"
                        className="mt-3"
                      >
                        <Target className="h-3.5 w-3.5" /> Practise this
                      </ButtonLink>
                    </div>
                  ) : null}
                </>
              ) : topFinding ? (
                <>
                  <h2 className="dsp mt-2.5 text-[26px] font-semibold leading-[1.02] tracking-[-0.015em]">
                    {topFinding.issue}
                  </h2>
                  <p className="mt-3 text-[13px] leading-[1.55] text-ink-fg/80">
                    {topFinding.description}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[13px] leading-[1.55] text-ink-fg/75">
                  {diagnostic.measured === 0
                    ? "Nothing measured on this swing yet. Add a position below and the worst one shows here."
                    : "Everything measured is inside its band. Measure another position to go deeper."}
                </p>
              )}
            </div>
          </InkCard>

          {/* Scroll down: what the flaw tends to produce, then what you are chasing. */}
          <Card>
            <CardHeader>
              <CardTitle>What it tends to do</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {diagnostic.outOfRange.length === 0 && findings.length === 0 ? (
                <p className="text-[13px] text-fg-muted">
                  Nothing out of band, so there is no tendency to name yet.
                </p>
              ) : (
                <ul className="space-y-3">
                  {diagnostic.outOfRange.slice(0, 3).map((reading) => (
                    <li key={reading.metric.id} className="flex gap-2.5">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />
                      <span className="text-[13px] leading-[1.55] text-fg-muted">
                        <span className="font-medium text-fg">{reading.metric.label}.</span>{" "}
                        {reading.metric.matters}
                      </span>
                    </li>
                  ))}
                  {findings.slice(0, 2).map((finding) => (
                    <li key={finding.id} className="flex gap-2.5">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />
                      <span className="text-[13px] leading-[1.55] text-fg-muted">
                        <span className="font-medium text-fg">{finding.issue}.</span>{" "}
                        {finding.why_it_matters} <Badge tone="neutral">{finding.certainty}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {state.profile?.common_miss ? (
                <p className="rounded-xl border border-border bg-surface-2 px-3.5 py-2.5 text-[12px] text-fg-muted">
                  Your logged miss is{" "}
                  <span className="font-medium text-fg">{labelize(state.profile.common_miss)}</span>.
                  A tendency that does not match it is worth a second look.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Goals</CardTitle>
              <ButtonLink href="/profile" size="sm" variant="secondary">
                Edit
              </ButtonLink>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {goals.length === 0 ? (
                <p className="text-[13px] text-fg-muted">No goals set yet.</p>
              ) : (
                goals.map((goal, index) => (
                  <Badge key={goal} tone={index === 0 ? "accent" : "neutral"}>
                    {GOAL_LABELS[goal]}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SwingDiagnostic session={session} measurements={measurements} />
      <MeasurementForm sessionId={session.id} />
    </div>
  );
}
