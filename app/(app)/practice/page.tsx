import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { resetDemoAction } from "@/app/actions";
import { AskCoachButton } from "@/components/ask/ask-agent";
import { DemoNotice } from "@/components/dashboard/sections";
import { Avatar } from "@/components/layout/screen-header";
import { PracticeDrillPriorities } from "@/components/practice/drill-priorities";
import { BaselineCard, GetStarted, PriorityHero, SwingScoreCard, TodayCard, WeekCard } from "@/components/practice/home";
import { TodayDate } from "@/components/practice/today-date";
import { Badge, ScreenTitle, SectionHeading, TopBar } from "@/components/ui/primitives";
import { weekStart } from "@/lib/analytics/practice-progress";
import { benchmarkFor, benchmarkNote } from "@/lib/practice/benchmark";
import { defaultPlan } from "@/lib/practice/plan-defaults";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import { scoreTrend } from "@/lib/swing/result";
import { swingScores } from "@/lib/swing/score-trend";
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
  const firstName = name.split(/\s+/)[0] ?? "";
  const priority = state.weaknesses[0] ?? null;

  // Today's session previews the plan Build a session opens on.
  const { minutes, plan } = defaultPlan(state);
  const firstUp = plan.items.find((item) => item.block !== "warm_up") ?? plan.items[0];
  const today = (
    <TodayCard
      minutes={minutes}
      blocks={plan.items}
      firstUp={firstUp ? (DRILLS_BY_ID.get(firstUp.drill_id)?.name ?? null) : null}
    />
  );

  // A new player: no priority to name yet, so the screen says how to get one.
  if (!priority) {
    const steps = [
      { title: "Set up your profile", detail: "Handicap, scores and your common miss", href: "/profile", done: Boolean(state.profile) },
      {
        title: "Log your first round",
        detail: "Shot by shot finds your weak spot fastest",
        href: "/rounds/new",
        done: state.rounds.length > 0,
      },
      { title: "Record one swing", detail: "Face on, phone on a stand", href: "/swing?record=1", done: state.swingSessions.length > 0 },
    ];
    return (
      <div className="flex flex-col gap-4">
        <TopBar left={<AskCoachButton />} right={<Avatar name={name} />} />
        <ScreenTitle>
          Welcome,
          <br />
          {firstName || "golfer"}!
        </ScreenTitle>
        <BaselineCard done={steps.filter((step) => step.done).length} total={steps.length} />
        <GetStarted steps={steps} />
        {today}
        {repo.mode() === "demo" ? <DemoNotice onReset={resetDemoAction} /> : null}
      </div>
    );
  }

  // This week against the player's weekly target, and the swing score beside it.
  const monday = weekStart(new Date().toISOString());
  const week = state.practiceSessions.filter(
    (session) => session.status === "complete" && weekStart(session.completed_at ?? session.scheduled_for) === monday,
  );
  const weekMinutes = week.reduce((sum, session) => sum + (session.actual_duration ?? session.planned_duration), 0);
  const { trend } = await swingScores(user.id, state.swingSessions);
  const swing = scoreTrend(trend);

  return (
    <div className="flex flex-col gap-3.5">
      <TopBar left={<AskCoachButton />} right={<Avatar name={name} />} />

      <div className="flex flex-col gap-1">
        <TodayDate className="dsp text-[12px] tracking-[0.12em] text-fg-subtle" />
        <ScreenTitle className="text-[42px] leading-none">{firstName ? `Hello, ${firstName}!` : "Practice"}</ScreenTitle>
      </div>

      <PriorityHero weakness={priority} />
      <div className="grid grid-cols-2 gap-3">
        <WeekCard done={week.length} target={state.profile?.practice_days_per_week ?? 3} minutes={weekMinutes} />
        <SwingScoreCard average={swing.average} change={swing.change} values={trend.slice(-10).map((point) => point.value)} />
      </div>
      {today}

      <section className="mt-4 flex flex-col gap-3">
        <SectionHeading title="Your benchmarks" description="The numbers you are working to beat." />
        {benchmarks.length === 0 ? (
          <p className="text-[14px] text-fg-muted">Run a session and the standards you are chasing show up here.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {benchmarks.map((benchmark) => {
              const note = benchmarkNote(benchmark);
              const isTest = Boolean(practiceTest(benchmark.drill.id));
              return (
                <li key={benchmark.drill.id} className="flex flex-col gap-1 rounded-[22px] bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-[15px] font-bold">{benchmark.drill.name}</p>
                    <Badge tone={benchmark.beaten ? "good" : "neutral"}>
                      {isTest
                        ? benchmark.beaten
                          ? "completed"
                          : benchmark.best
                            ? "tracked"
                            : "open"
                        : benchmark.beaten
                          ? "beaten"
                          : "open"}
                    </Badge>
                  </div>
                  <p className="font-display tabular text-[22px] leading-none text-accent">{benchmark.label}</p>
                  <p className="text-[12.5px] leading-[1.5] text-fg-subtle">
                    {note ?? `${benchmark.drill.metric_to_track}. No result logged yet.`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <PracticeDrillPriorities drills={rankPracticeDrills(state.drills, state)} initialSelected={state.practiceDrillPriorities} />

      <Link href="/practice/history" className="press-lg flex items-center gap-3.5 rounded-[22px] bg-surface px-4 py-4">
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-bold">Practice history</span>
          <span className="mt-0.5 block text-[12.5px] text-fg-subtle">
            {state.practiceSessions.length} session{state.practiceSessions.length === 1 ? "" : "s"} · this week and before
          </span>
        </span>
        <ChevronRight className="h-5 w-5 text-fg-muted" />
      </Link>

      {repo.mode() === "demo" ? <DemoNotice onReset={resetDemoAction} /> : null}
    </div>
  );
}
