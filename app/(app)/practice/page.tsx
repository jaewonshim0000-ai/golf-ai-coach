import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";

import { PracticeProgress } from "@/components/dashboard/sections";
import { SessionBuilder } from "@/components/practice/session-builder";
import { PracticeTrendChart, SERIES_COLORS } from "@/components/charts";
import {
  Badge,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  SectionHeading,
} from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";
import { loadPlayerState, todaysSession } from "@/lib/player-state";
import { formatDate, percent, relativeDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Practice" };
export const dynamic = "force-dynamic";

export default async function PracticePage({
  searchParams,
}: {
  searchParams: Promise<{ plan_session?: string }>;
}) {
  const user = await repo.currentUser();
  if (!user) return null;

  const params = await searchParams;
  const state = await loadPlayerState(user.id);
  const planSession =
    state.plan?.sessions.find((s) => s.id === params.plan_session) ?? todaysSession(state);

  const upcoming =
    state.plan?.sessions
      .filter((s) => !s.is_rest && s.status === "scheduled")
      .slice(0, 4) ?? [];

  const chartSeries = state.practiceTrends.slice(0, 4).map((trend, index) => ({
    name: trend.drill_name,
    color: SERIES_COLORS[index % SERIES_COLORS.length]!,
    points: trend.points,
  }));

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Practice"
        description="Build a session, record a real number for every drill, and watch whether the number moves."
        action={
          <ButtonLink href="/practice/drills" variant="secondary" size="sm">
            Drill library
          </ButtonLink>
        }
      />

      <SessionBuilder
        drills={state.drills}
        planSession={planSession && !planSession.is_rest ? planSession : null}
        defaultDuration={state.profile?.typical_practice_duration ?? 45}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Upcoming in your plan</CardTitle>
            <Link href="/plans" className="text-xs text-accent hover:underline">
              Full plan
            </Link>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <EmptyState
                title="Nothing scheduled"
                message="Generate a training plan and your next sessions will appear here."
                action={
                  <ButtonLink href="/plans" size="sm">
                    Build a plan
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="space-y-2">
                {upcoming.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{session.title}</span>
                      <span className="block truncate text-xs text-fg-subtle">
                        Week {session.week}, day {session.day} &middot; {session.drill_ids.length} drills
                      </span>
                    </span>
                    <Link
                      href={`/practice?plan_session=${session.id}`}
                      className="flex shrink-0 items-center gap-1 text-xs text-accent hover:underline"
                    >
                      Start <ArrowRight className="h-3 w-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {state.practiceSessions.length === 0 ? (
              <EmptyState
                title="No sessions yet"
                message="Complete your first training session and we'll start building your performance profile."
              />
            ) : (
              <ul className="space-y-2">
                {state.practiceSessions.slice(0, 6).map((session) => {
                  const results = state.drillAttempts.filter((a) => a.session_id === session.id);
                  const best = results.length
                    ? Math.max(...results.map((a) => a.score))
                    : null;
                  return (
                    <li key={session.id}>
                      <Link
                        href={`/practice/sessions/${session.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 transition-colors hover:border-border-strong"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{session.title}</span>
                          <span className="block truncate text-xs text-fg-subtle">
                            {formatDate(session.scheduled_for)} &middot; {relativeDays(session.scheduled_for)}
                            {results.length > 0 ? ` · ${results.length} drills logged` : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {best !== null ? (
                            <span className="tabular text-xs text-fg-muted">{percent(best)}</span>
                          ) : null}
                          {session.status === "complete" ? (
                            <Badge tone="good">
                              <CheckCircle2 className="h-3 w-3" /> done
                            </Badge>
                          ) : (
                            <Badge tone="warn">
                              <Clock className="h-3 w-3" /> open
                            </Badge>
                          )}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Drill metrics over time</CardTitle>
            <p className="mt-0.5 text-xs text-fg-muted">
              Every point is a recorded result, not an estimate.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <PracticeTrendChart series={chartSeries} />
            <ul className="flex flex-wrap gap-3 text-xs text-fg-muted">
              {chartSeries.map((series) => (
                <li key={series.name} className="flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: series.color }}
                    aria-hidden
                  />
                  {series.name}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <PracticeProgress state={state} />
      </div>
    </div>
  );
}
