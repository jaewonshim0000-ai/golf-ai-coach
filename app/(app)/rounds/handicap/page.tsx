import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { InkTrendLine, TrendLine } from "@/components/charts";
import { ChartCard, ScoreMix, one, pct } from "@/components/rounds/play-stats";
import { Card, CardContent, CardHeader, CardTitle, RoundButton, ScreenTitle, Stat, TopBar } from "@/components/ui/primitives";
import { classicStats, classicTrends, holeLines } from "@/lib/analytics/classic";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Handicap & classic stats" };
export const dynamic = "force-dynamic";


/** A classic stat as the design's tile: name and change on the left, value in a stone circle. */
function StatTile({ label, value, change, sub }: { label: string; value: string; change: number | null; sub?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-[22px] bg-surface p-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-[13px] font-bold">{label}</dt>
        {change !== null && Math.round(change) !== 0 ? (
          <span className={cn("text-[11px] font-bold", change > 0 ? "text-accent-strong" : "text-bad")}>
            {change > 0 ? "▲" : "▼"} {Math.abs(Math.round(change))}%
          </span>
        ) : (
          <span className="text-[11px] font-semibold text-fg-subtle">{sub ?? "no change"}</span>
        )}
      </div>
      <dd className="font-display tabular flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[18px]">
        {value}
      </dd>
    </div>
  );
}

export default async function HandicapPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const [state, courses] = await Promise.all([loadPlayerState(user.id), repo.getCourses(user.id)]);

  const perRound = state.rounds
    .map((round) => ({
      round,
      lines: holeLines(round, courses.find((course) => course.id === round.course_id)?.holes ?? [], state.shotsByRound.get(round.id) ?? []),
    }))
    .sort((a, b) => b.round.played_on.localeCompare(a.round.played_on));
  const recent = perRound.slice(0, 9);
  const classic = classicStats(recent.flatMap(({ lines }) => lines));
  // The change: the latest five rounds against the five before them, in points.
  const now = classicStats(perRound.slice(0, 5).flatMap(({ lines }) => lines));
  const before = classicStats(perRound.slice(5, 10).flatMap(({ lines }) => lines));
  const change = (pick: (stats: typeof classic) => number | null) => {
    const a = pick(now);
    const b = pick(before);
    return a === null || b === null || perRound.length <= 5 ? null : (a - b) * 100;
  };
  const trends = classicTrends(perRound);
  const all = classicStats(perRound.flatMap(({ lines }) => lines));

  const history = [...state.handicapHistory].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const year = history.filter((entry) => entry.recorded_on >= yearAgo);
  const current = state.profile?.handicap_index ?? history.at(-1)?.handicap_index ?? null;
  const delta = year.length > 1 ? year.at(-1)!.handicap_index - year[0]!.handicap_index : null;

  return (
    <div className="flex flex-col gap-3.5">
      <TopBar
        left={
          <RoundButton href="/rounds" label="Back to Play">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
      />
      <ScreenTitle className="leading-none">Handicap</ScreenTitle>

      <section aria-label="Handicap index trend" className="flex flex-col gap-2.5 rounded-[28px] bg-ink p-[18px] text-white">
        <div className="flex items-end justify-between gap-3">
          <span className="font-display tabular text-[72px] leading-[0.9]">{current !== null ? current.toFixed(1) : "—"}</span>
          {delta !== null && Math.abs(delta) >= 0.05 ? (
            <span className={cn("inline-flex h-[30px] items-center rounded-full px-3 text-[12px] font-bold", delta < 0 ? "bg-accent" : "bg-[#3a3f33] text-[#e9a08e]")}>
              {delta < 0 ? "▼" : "▲"} {Math.abs(delta).toFixed(1)} this year
            </span>
          ) : null}
        </div>
        {year.length > 1 ? (
          <InkTrendLine label="Handicap index" points={year.map((entry) => ({ date: entry.recorded_on, value: entry.handicap_index }))} />
        ) : (
          <p className="text-[13px] text-[#c9ccbf]">Your trend line appears once your handicap has changed a couple of times.</p>
        )}
      </section>

      <div className="flex items-baseline justify-between px-1">
        <h2 className="dsp text-[22px] leading-none">Classic stats</h2>
        <span className="text-[12px] font-semibold text-fg-subtle">
          Last {recent.length} round{recent.length === 1 ? "" : "s"}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2.5">
        <StatTile label="Fairways" value={pct(classic.fairways.pct)} change={change((stats) => stats.fairways.pct)} />
        <StatTile label="Greens" value={pct(classic.greens.pct)} change={change((stats) => stats.greens.pct)} />
        <StatTile label="Putts" value={one(classic.puttsPerRound)} change={null} sub="per round" />
        <StatTile label="Scrambling" value={pct(classic.scrambling.pct)} change={change((stats) => stats.scrambling.pct)} />
      </dl>

      {all.holes > 0 ? (
        <Card className="mt-2">
          <CardHeader>
            <CardTitle>Your numbers</CardTitle>
            <p className="text-[13px] text-fg-muted">Across {all.holes} holes, from scorecards and shot tracking alike.</p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="3-putts / rd" value={one(all.threePuttsPerRound)} />
              <Stat label="Penalties / rd" value={one(all.penaltiesPerRound)} />
              <Stat label="Holes" value={all.holes} />
            </div>
            <ScoreMix mix={all.mix} />
            <p className="tabular text-[12px] text-fg-muted">
              Average score: {([3, 4, 5] as const).map((par) => `par ${par}s ${one(all.parAverage[par])}`).join(" · ")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      <ChartCard title="Scoring">
        <TrendLine points={state.scoringTrend} height={150} invert />
      </ChartCard>
      <div className="grid gap-3.5 md:grid-cols-2">
        <ChartCard title="Fairways hit">
          <TrendLine points={trends.fairways} height={110} unit="%" />
        </ChartCard>
        <ChartCard title="Greens in regulation">
          <TrendLine points={trends.greens} height={110} unit="%" />
        </ChartCard>
        <ChartCard title="Putts per round">
          <TrendLine points={trends.putts} height={110} invert />
        </ChartCard>
        <ChartCard title="Scrambling">
          <TrendLine points={trends.scrambling} height={110} unit="%" />
        </ChartCard>
      </div>
    </div>
  );
}
