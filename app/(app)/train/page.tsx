import Link from "next/link";
import type { Metadata } from "next";

import { WeaknessList } from "@/components/dashboard/sections";
import { SessionBuilder } from "@/components/practice/session-builder";
import { SwingDiagnostic } from "@/components/swing/diagnostic";
import { MeasurementForm } from "@/components/swing/measurement-form";
import { NewSwingSessionForm } from "@/components/swing/swing-forms";
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
import { formatDate, relativeDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Train" };
export const dynamic = "force-dynamic";

type Search = { tab?: string };

export default async function TrainPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await repo.currentUser();
  if (!user) return null;

  const [state, search] = await Promise.all([loadPlayerState(user.id), searchParams]);
  const tab = search.tab === "swing" ? "swing" : "practice";

  const session = state.session;

  /*
    Show the newest swing that actually has measurements, and only that
    swing's rows. Taking the newest session and every measurement would label
    one swing's numbers with another swing's club and camera angle.
  */
  const measured = new Set(state.swingMeasurements.map((m) => m.swing_session_id));
  const swingSession =
    state.swingSessions.find((candidate) => measured.has(candidate.id)) ??
    state.swingSessions[0] ??
    null;
  const swingMeasurements = swingSession
    ? state.swingMeasurements.filter((m) => m.swing_session_id === swingSession.id)
    : [];

  // Benchmarks for the drills in today's session, plus anything already tracked.
  const drillIds = new Set([
    ...(session?.drills.map((d) => d.id) ?? []),
    ...state.practiceTrends.map((t) => t.drill_id),
  ]);
  const benchmarks = [...drillIds]
    .map((id) => state.drills.find((drill) => drill.id === id))
    .filter((drill): drill is NonNullable<typeof drill> => Boolean(drill))
    .map((drill) => benchmarkFor(drill, state.drillAttempts));

  return (
    <div className="space-y-5">
      <PageHero
        art="range"
        eyebrow={session ? session.block : "Today"}
        title="Train"
        pills={
          <>
            <HeroPill tone="solid">{state.volume.sessions_completed} sessions</HeroPill>
            <HeroPill>{state.swingSessions.length} swings</HeroPill>
          </>
        }
      />

      <nav className="no-bar flex gap-1.5 overflow-x-auto" aria-label="Train sections">
        <Tab href="/train" label="Practice" active={tab === "practice"} />
        <Tab href="/train?tab=swing" label="Swing" active={tab === "swing"} />
        <Tab href="/train/drills" label="All drills" active={false} />
      </nav>

      {tab === "practice" ? (
        <>
          <SessionBuilder
            drills={state.drills}
            suggested={session}
            defaultDuration={state.profile?.typical_practice_duration ?? 45}
          />

          <SectionHeading
            title="Your benchmarks"
            description="Every drill has a number to beat. Log the result and it is tracked here."
          />
          {benchmarks.length === 0 ? (
            <EmptyState
              title="No drills tracked yet"
              message="Run a session and the standards you are chasing show up here."
              action={
                <ButtonLink href="/train/drills" size="sm" variant="secondary">
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
                    <p className="tabular text-[15px] font-semibold text-accent">
                      {benchmark.label}
                    </p>
                    <p className="text-[11.5px] leading-[1.5] text-fg-muted">
                      {note ?? `${benchmark.drill.metric_to_track}. No result logged yet.`}
                    </p>
                  </MiniCard>
                );
              })}
            </div>
          )}

          <WeaknessList
            weaknesses={state.weaknesses}
            limit={6}
            title="Where the strokes are going"
            description="Ranked by cost, confidence and how much practice moves them."
          />

          <Card>
            <CardHeader>
              <CardTitle>Recent sessions</CardTitle>
            </CardHeader>
            <CardContent>
              {state.practiceSessions.length === 0 ? (
                <EmptyState title="No sessions yet" message="Your logged sessions appear here." />
              ) : (
                <ul className="space-y-1.5">
                  {state.practiceSessions.slice(0, 5).map((practice) => (
                    <li key={practice.id}>
                      <Link
                        href={`/train/sessions/${practice.id}`}
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
        </>
      ) : (
        <>
          <div className="flex justify-end">
            <NewSwingSessionForm />
          </div>

          <SwingDiagnostic session={swingSession} measurements={swingMeasurements} />

          {swingSession ? <MeasurementForm sessionId={swingSession.id} /> : null}
        </>
      )}
    </div>
  );
}

function Tab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "dsp shrink-0 rounded-full bg-[image:var(--grad-accent)] px-4 py-2 text-[10px] font-medium tracking-[0.15em] text-white"
          : "dsp shrink-0 rounded-full border border-border-strong bg-surface px-4 py-2 text-[10px] font-medium tracking-[0.15em] text-fg-muted"
      }
    >
      {label}
    </Link>
  );
}
