import type { Metadata } from "next";
import { ExternalLink, Info } from "lucide-react";

import { SourceBadge } from "@/components/dashboard/sections";
import { AddFindingForm, DeleteFindingButton, NewSwingSessionForm } from "@/components/swing/swing-forms";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SectionHeading,
} from "@/components/ui/primitives";
import type { Drill, SwingFinding, SwingSession } from "@/types/practice";
import { CLUB_LABELS, labelize } from "@/types/golf";
import { analyzeSwingSession, extractMeasurements, visionAvailable } from "@/lib/ai/swing-analysis";
import { referenceFor } from "@/lib/seed/reference-swings";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import * as repo from "@/lib/db/repo";
import { formatDate, percent, relativeDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Swing" };
export const dynamic = "force-dynamic";

const SEVERITY_TONE = { high: "bad", medium: "warn", low: "neutral" } as const;
const CERTAINTY_TONE = {
  observed: "good",
  likely: "accent",
  possible: "warn",
  uncertain: "neutral",
} as const;

export default async function SwingPage() {
  const user = await repo.currentUser();
  if (!user) return null;

  const [sessions, findings, profile] = await Promise.all([
    repo.getSwingSessions(user.id),
    repo.getSwingFindings(user.id),
    repo.getProfile(user.id),
  ]);
  const drills = repo.getDrills();
  const reference = referenceFor(profile?.swing_pattern ?? "unknown");

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Swing"
        description="Upload a swing, record what you or your coach can actually see, and it becomes the third input to your development priority."
        action={<NewSwingSessionForm />}
      />

      <div className="flex gap-3 rounded-lg border border-info/30 bg-info-soft p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div className="space-y-1">
          <p className="font-medium text-fg">
            {visionAvailable()
              ? "Automated swing measurement is enabled."
              : "No automated swing measurement yet."}
          </p>
          <p className="text-fg-muted">
            {visionAvailable()
              ? "Measurements from the vision pipeline are shown alongside your manual findings."
              : "Pose estimation, club tracking and phase detection are not implemented, so nothing here is machine-measured. The data model and the analysis interface already accept measurements, so the pipeline can be added without changing the coaching layer - and until then the app says so rather than pretending."}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reference pattern: {reference.name}</CardTitle>
          <p className="mt-0.5 text-xs text-fg-muted">
            Matched to your {profile?.swing_pattern ?? "unknown"} ball flight. A teaching example, not a
            template - there is deliberately no similarity percentage here.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-fg-muted">{reference.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-good">
                Useful similarities
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-fg-muted">
                {reference.useful_similarities.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-warn">
                Potential differences
              </p>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-fg-muted">
                {reference.potential_differences.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {sessions.length === 0 ? (
        <EmptyState
          title="No swings yet"
          message="Upload a swing when you're ready. We'll use it as another piece of your player profile."
        />
      ) : (
        <div className="space-y-6">
          {sessions.map((session) => (
            <SwingSessionCard
              key={session.id}
              session={session}
              findings={findings.filter((f) => f.swing_session_id === session.id)}
              drills={drills}
            />
          ))}
        </div>
      )}
    </div>
  );
}

async function SwingSessionCard({
  session,
  findings: sessionFindings,
  drills,
}: {
  session: SwingSession;
  findings: SwingFinding[];
  drills: Drill[];
}) {
  const measurements = await extractMeasurements(session);
  const analysis = await analyzeSwingSession(session, sessionFindings, measurements);

  return (
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      {CLUB_LABELS[session.club]} &middot; {labelize(session.camera_angle)}
                    </CardTitle>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {formatDate(session.created_at)} &middot; {relativeDays(session.created_at)} &middot;{" "}
                      {labelize(session.swing_pattern)} pattern
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="neutral">{session.analysis_status}</Badge>
                    <SourceBadge source={analysis.source} note={analysis.note} />
                  </div>
                </CardHeader>

                <CardContent className="space-y-5">
                  {session.video_url ? (
                    <a
                      href={session.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
                    >
                      Watch the swing <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}

                  {session.notes ? (
                    <p className="text-sm italic text-fg-muted">&ldquo;{session.notes}&rdquo;</p>
                  ) : null}

                  <p className="text-sm leading-relaxed text-fg-muted">
                    {analysis.data.pattern_summary}
                  </p>

                  {analysis.data.priorities.length > 0 ? (
                    <ol className="space-y-3">
                      {analysis.data.priorities.map((priority) => {
                        const drill = priority.drill_id ? DRILLS_BY_ID.get(priority.drill_id) : null;
                        return (
                          <li
                            key={priority.rank}
                            className="rounded-lg border border-border bg-surface-2 p-4"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge tone="accent">Priority #{priority.rank}</Badge>
                              <span className="text-sm font-semibold">
                                {labelize(priority.category)}
                              </span>
                              <Badge tone={CERTAINTY_TONE[priority.certainty]}>
                                {priority.certainty}
                              </Badge>
                              <Badge tone={SEVERITY_TONE[priority.priority]}>
                                {priority.priority} priority
                              </Badge>
                              <span className="tabular text-xs text-fg-subtle">
                                {percent(priority.confidence)} confidence
                              </span>
                            </div>

                            <p className="mt-2 text-sm font-medium">{priority.issue}</p>

                            <dl className="mt-2 space-y-1.5 text-sm text-fg-muted">
                              <div>
                                <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                                  What we&apos;re seeing
                                </dt>
                                <dd>{priority.what_we_see}</dd>
                              </div>
                              <div>
                                <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                                  Why it matters
                                </dt>
                                <dd>{priority.why_it_matters}</dd>
                              </div>
                              {drill ? (
                                <div>
                                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
                                    Drill
                                  </dt>
                                  <dd className="text-fg">
                                    {drill.name}{" "}
                                    <span className="text-fg-subtle">
                                      ({drill.recommended_duration} min &middot; {drill.metric_to_track})
                                    </span>
                                  </dd>
                                </div>
                              ) : null}
                            </dl>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="text-sm text-fg-muted">
                      No findings recorded for this swing yet.
                    </p>
                  )}

                  {analysis.data.reference_note ? (
                    <p className="border-t border-border pt-3 text-xs leading-relaxed text-fg-subtle">
                      {analysis.data.reference_note}
                    </p>
                  ) : null}

                  {sessionFindings.length > 0 ? (
                    <details className="text-sm">
                      <summary className="cursor-pointer list-none text-xs text-accent">
                        All {sessionFindings.length} recorded finding{sessionFindings.length === 1 ? "" : "s"}
                      </summary>
                      <ul className="mt-2 space-y-1.5">
                        {sessionFindings.map((finding) => (
                          <li
                            key={finding.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                          >
                            <span className="min-w-0 truncate">
                              <span className="text-xs uppercase tracking-wide text-fg-subtle">
                                {labelize(finding.category)}
                              </span>{" "}
                              {finding.issue}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                              <Badge tone={CERTAINTY_TONE[finding.certainty]}>
                                {finding.certainty}
                              </Badge>
                              <DeleteFindingButton findingId={finding.id} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  <AddFindingForm session={session} drills={drills} />
                </CardContent>
              </Card>
  );
}
