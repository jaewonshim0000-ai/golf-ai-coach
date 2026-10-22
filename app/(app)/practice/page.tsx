import Link from "next/link";
import type { Metadata } from "next";
import { User } from "lucide-react";

import { resetDemoAction } from "@/app/actions";
import { DemoNotice, PriorityCard, TodaysSession } from "@/components/dashboard/sections";
import { PracticeDrillPriorities } from "@/components/practice/drill-priorities";
import { PracticeHistory } from "@/components/practice/practice-history";
import { Disclosure } from "@/components/ui/disclosure";
import {
  Badge,
  ButtonLink,
  EmptyState,
  HeroPill,
  MiniCard,
  PageHero,
} from "@/components/ui/primitives";
import { benchmarkFor, benchmarkNote } from "@/lib/practice/benchmark";
import { rankPracticeDrills } from "@/lib/practice/drill-priorities";
import { practiceTest } from "@/lib/practice/tests";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { greeting } from "@/lib/utils";

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

      {state.weaknesses.length ? <Disclosure title="Recommendations from your rounds" count={Math.min(2, state.weaknesses.length)}>
        <div className="space-y-3">{state.weaknesses.slice(0, 2).map((weakness, index) => <PriorityCard key={weakness.key} weakness={weakness} rank={index === 0 ? 1 : 2} />)}</div>
      </Disclosure> : null}

      <TodaysSession session={state.session} attempts={state.drillAttempts} />

      <Disclosure title="Your benchmarks" count={benchmarks.length} description="Open to see the numbers you are working to beat.">
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
                      {practiceTest(benchmark.drill.id) ? benchmark.beaten ? "completed" : benchmark.best ? "tracked" : "open" : benchmark.beaten ? "beaten" : "open"}
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
      </Disclosure>

      <PracticeDrillPriorities
        drills={rankPracticeDrills(state.drills, state)}
        initialSelected={state.practiceDrillPriorities}
      />
      <PracticeHistory sessions={state.practiceSessions} />
    </div>
  );
}
