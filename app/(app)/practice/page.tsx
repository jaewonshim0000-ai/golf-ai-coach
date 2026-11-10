import Link from "next/link";
import type { Metadata } from "next";

import { resetDemoAction } from "@/app/actions";
import { DemoNotice, PriorityCard, TodaysSession } from "@/components/dashboard/sections";
import { PracticeDrillPriorities } from "@/components/practice/drill-priorities";
import { PracticeHistory } from "@/components/practice/practice-history";
import {
  Badge,
  ButtonLink,
  EmptyState,
  HeroPill,
  MiniCard,
  PageHero,
  SectionHeading,
} from "@/components/ui/primitives";
import { benchmarkFor, benchmarkNote } from "@/lib/practice/benchmark";
import { rankPracticeDrills } from "@/lib/practice/drill-priorities";
import { practiceTest } from "@/lib/practice/tests";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";

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

  const name = state.profile?.display_name ?? "";
  const initials = name.split(/\s+/).map((word) => word[0] ?? "").join("").slice(0, 2).toUpperCase();
  const handicap = state.profile?.handicap_index;

  return (
    <div className="space-y-5">
      <PageHero
        art="plain"
        title={name ? <>Hello<br />{name}!</> : "Practice"}
        description={handicap !== null && handicap !== undefined ? `HCP ${handicap.toFixed(1)}` : undefined}
        topRight={
          <Link
            href="/profile"
            aria-label="Profile"
            className="flex h-11 w-11 items-center justify-center rounded-full border-[3px] border-white bg-accent text-[14px] font-bold text-accent-fg md:hidden"
          >
            {initials || "You"}
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

      {state.weaknesses.length ? <section className="space-y-3">
        <SectionHeading title="Recommendations from your rounds" count={Math.min(2, state.weaknesses.length)} />
        <div className="grid gap-3 lg:grid-cols-2">{state.weaknesses.slice(0, 2).map((weakness, index) => <PriorityCard key={weakness.key} weakness={weakness} rank={index === 0 ? 1 : 2} />)}</div>
      </section> : null}

      <TodaysSession session={state.session} attempts={state.drillAttempts} />

      <section className="space-y-3">
        <SectionHeading title="Your benchmarks" count={benchmarks.length} description="The numbers you are working to beat." />
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
      </section>

      <PracticeDrillPriorities
        drills={rankPracticeDrills(state.drills, state)}
        initialSelected={state.practiceDrillPriorities}
      />
      <PracticeHistory sessions={state.practiceSessions} />
    </div>
  );
}
