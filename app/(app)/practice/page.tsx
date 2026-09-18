import Link from "next/link";
import type { Metadata } from "next";
import { User } from "lucide-react";

import { resetDemoAction } from "@/app/actions";
import { DemoNotice, PriorityCard, TodaysSession } from "@/components/dashboard/sections";
import {
  Badge,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  HeroPill,
  MiniCard,
  PageHero,
  SectionHeading,
} from "@/components/ui/primitives";
import { benchmarkFor, benchmarkNote } from "@/lib/practice/benchmark";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { formatDate, greeting, relativeDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Practice" };
export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const state = await loadPlayerState(user.id);

  // Benchmarks for today's drills plus anything already being tracked.
  const drillIds = new Set([
    ...(state.session?.drills.map((drill) => drill.id) ?? []),
    ...state.practiceTrends.map((trend) => trend.drill_id),
  ]);
  const benchmarks = [...drillIds]
    .map((id) => state.drills.find((drill) => drill.id === id))
    .filter((drill): drill is NonNullable<typeof drill> => Boolean(drill))
    .map((drill) => benchmarkFor(drill, state.drillAttempts));

  return (
    <div className="space-y-5">
      <PageHero
        art="range"
        eyebrow={greeting()}
        title={state.profile?.display_name ?? "Practice"}
        topRight={
          <Link
            href="/profile"
            aria-label="Profile"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 text-white md:hidden"
          >
            <User className="h-4 w-4" />
          </Link>
        }
        pills={
          <>
            <HeroPill tone="solid">{state.volume.sessions_completed} sessions</HeroPill>
            <HeroPill>{state.rounds.length} rounds</HeroPill>
          </>
        }
      />

      {repo.mode() === "demo" ? <DemoNotice onReset={resetDemoAction} /> : null}

      <div className="rise space-y-5">
        <PriorityCard weakness={state.weaknesses[0] ?? null} rank={1} />
        <PriorityCard weakness={state.weaknesses[1] ?? null} rank={2} />
      </div>

      <TodaysSession session={state.session} />

      <SectionHeading
        title="Your benchmarks"
        description="Every drill has a number to beat. Log the result and it is tracked here."
      />
      {benchmarks.length === 0 ? (
        <EmptyState
          title="No drills tracked yet"
          message="Run a session and the standards you are chasing show up here."
          action={
            <ButtonLink href="/practice/drills" size="sm" variant="secondary">
              Browse drills
            </ButtonLink>
          }
        />
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {benchmarks.map((benchmark) => {
            const note = benchmarkNote(benchmark);
            return (
              <MiniCard key={benchmark.drill.id} className="space-y-2 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-[13px] font-semibold">
                    {benchmark.drill.name}
                  </p>
                  <Badge tone={benchmark.beaten ? "good" : "neutral"}>
                    {benchmark.beaten ? "beaten" : "open"}
                  </Badge>
                </div>
                <p className="tabular text-[15px] font-semibold text-accent">{benchmark.label}</p>
                <p className="text-[11.5px] leading-[1.5] text-fg-muted">
                  {note ?? `${benchmark.drill.metric_to_track}. No result logged yet.`}
                </p>
              </MiniCard>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Recent sessions</CardTitle>
          <ButtonLink href="/practice/drills" size="sm" variant="secondary">
            All drills
          </ButtonLink>
        </CardHeader>
        <CardContent>
          {state.practiceSessions.length === 0 ? (
            <EmptyState title="No sessions yet" message="Your logged sessions appear here." />
          ) : (
            <ul className="space-y-1.5">
              {state.practiceSessions.slice(0, 5).map((practice) => (
                <li key={practice.id}>
                  <Link
                    href={`/practice/sessions/${practice.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2.5 transition-colors hover:border-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">
                        {practice.title}
                      </span>
                      <span className="block truncate text-[11px] text-fg-subtle">
                        {formatDate(practice.scheduled_for)} &middot;{" "}
                        {relativeDays(practice.scheduled_for)}
                      </span>
                    </span>
                    <Badge tone={practice.status === "complete" ? "good" : "warn"}>
                      {practice.status === "complete" ? "done" : "open"}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
