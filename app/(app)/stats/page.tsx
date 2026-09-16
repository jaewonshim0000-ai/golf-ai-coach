import { Suspense } from "react";
import type { Metadata } from "next";

import { WeaknessList } from "@/components/dashboard/sections";
import { StatsFilters } from "@/components/stats/filters";
import {
  CountBars,
  DispersionChart,
  DivergingBars,
  PracticeTrendChart,
  SERIES_COLORS,
  TrendLine,
} from "@/components/charts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHero,
  Skeleton,
  Stat,
} from "@/components/ui/primitives";
import type { Club, Lie, SGCategory, ShotType } from "@/types/golf";
import { CLUB_LABELS, SG_CATEGORIES, SG_CATEGORY_LABELS, bandStart, labelize } from "@/types/golf";
import type { StatsFilters as Filters } from "@/types/analytics";
import {
  applyFilters,
  buildSegments,
  dispersion,
  missBreakdown,
  sgTrend,
  summarizeStrokesGained,
} from "@/lib/analytics/aggregate";
import { MIN_SAMPLE } from "@/lib/analytics/weaknesses";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { signed } from "@/lib/utils";

export const metadata: Metadata = { title: "Stats" };
export const dynamic = "force-dynamic";

type Search = {
  range?: string;
  category?: string;
  club?: string;
  lie?: string;
  shot_type?: string;
  distance?: string;
};

function toFilters(search: Search): Filters {
  const filters: Filters = {};
  if (search.range) {
    const days = Number(search.range);
    if (Number.isFinite(days)) {
      filters.from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    }
  }
  if (search.category) filters.categories = [search.category as SGCategory];
  if (search.club) filters.clubs = [search.club as Club];
  if (search.lie) filters.lies = [search.lie as Lie];
  if (search.shot_type) filters.shotTypes = [search.shot_type as ShotType];
  if (search.distance) {
    const [min, max] = search.distance.split("-").map(Number);
    if (Number.isFinite(min)) filters.minDistance = min;
    if (Number.isFinite(max)) filters.maxDistance = max;
  }
  return filters;
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await repo.currentUser();
  if (!user) return null;

  const search = await searchParams;
  const state = await loadPlayerState(user.id);
  const filters = toFilters(search);
  const shots = applyFilters(state.shots, filters, state.rounds);
  const summary = summarizeStrokesGained(shots);
  const segments = buildSegments(shots);

  const distanceData = segments
    .filter((s) => s.kind === "approach_distance")
    .sort((a, b) => bandStart(a.key) - bandStart(b.key))
    .map((s) => ({ label: s.label.replace(" yd approach", ""), value: s.sg_per_round }));

  const clubData = segments
    .filter((s) => s.kind === "club" && s.shots >= 4)
    .sort((a, b) => a.sg_per_round - b.sg_per_round)
    .map((s) => ({ label: s.label, value: s.sg_per_round }));

  const lieData = segments
    .filter((s) => s.kind === "lie" && s.shots >= 4)
    .sort((a, b) => a.sg_per_round - b.sg_per_round)
    .map((s) => ({ label: s.label, value: s.sg_per_round }));

  const puttData = segments
    .filter((s) => s.kind === "putt_distance")
    .sort((a, b) => bandStart(a.key) - bandStart(b.key))
    .map((s) => ({ label: s.label.replace("Putts ", ""), value: s.sg_per_round }));

  const misses = missBreakdown(shots).map((m) => ({
    label: labelize(m.direction),
    value: m.count,
  }));

  const practiceSeries = state.practiceTrends.slice(0, 5).map((trend, index) => ({
    name: trend.drill_name,
    color: SERIES_COLORS[index % SERIES_COLORS.length]!,
    points: trend.points,
  }));

  const filteredRounds = state.rounds.filter((r) =>
    shots.some((s) => s.round_id === r.id),
  );

  return (
    <div className="space-y-5">
      <PageHero
        art="green"
        size="sm"
        title="Stats"
        description="Every number is computed from your recorded shots, never estimated."
      />

      <Suspense fallback={<Skeleton className="h-10 w-full" />}>
        <StatsFilters />
      </Suspense>

      {shots.length === 0 ? (
        <EmptyState
          title="No shots match those filters"
          message="Widen the filters, or log a round to start building the dataset."
        />
      ) : (
        <>
          <Card>
            <CardContent className="grid grid-cols-3 gap-x-3 gap-y-4 p-5 lg:grid-cols-6">
              <Stat label="Shots" value={summary.shots} sub={`${summary.rounds} rounds`} />
              <Stat
                label="SG total"
                value={signed(summary.total, 1)}
                tone={summary.total >= 0 ? "good" : "bad"}
              />
              <Stat
                label="SG / round"
                value={signed(summary.per_round, 2)}
                tone={summary.per_round >= 0 ? "good" : "bad"}
              />
              {SG_CATEGORIES.slice(0, 3).map((category) => (
                <Stat
                  key={category}
                  label={SG_CATEGORY_LABELS[category]}
                  value={signed(summary.by_category[category].per_round)}
                  sub={`${summary.by_category[category].shots} shots`}
                  tone={summary.by_category[category].per_round >= 0 ? "good" : "bad"}
                />
              ))}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Strokes gained trend" subtitle="Per round, oldest first">
              <TrendLine points={sgTrend(filteredRounds, groupByRound(shots))} height={160} zeroLine />
            </ChartCard>

            <ChartCard title="By category" subtitle="Strokes gained per round">
              <DivergingBars
                data={SG_CATEGORIES.map((c) => ({
                  label: SG_CATEGORY_LABELS[c],
                  value: summary.by_category[c].per_round,
                  sub: `${summary.by_category[c].shots} shots`,
                }))}
              />
            </ChartCard>

            <ChartCard
              title="Approach by distance"
              subtitle={`Bands with fewer than ${MIN_SAMPLE.approach_distance} shots are not yet reliable`}
            >
              <DivergingBars data={distanceData} compact />
            </ChartCard>

            <ChartCard title="Putting by distance" subtitle="Strokes gained per round">
              <DivergingBars data={puttData} compact />
            </ChartCard>

            <ChartCard title="By club" subtitle="Worst first, minimum 4 shots">
              <DivergingBars data={clubData.slice(0, 10)} compact />
            </ChartCard>

            <ChartCard title="By lie" subtitle="Where you are playing from">
              <DivergingBars data={lieData} compact />
            </ChartCard>

            <ChartCard title="Dispersion" subtitle="Distance against miss direction, coloured by SG">
              <DispersionChart points={dispersion(shots)} height={240} />
            </ChartCard>

            <ChartCard title="Miss directions" subtitle="How many shots missed each way">
              <CountBars data={misses} height={150} />
            </ChartCard>
          </div>

          {practiceSeries.length > 0 ? (
            <ChartCard
              title="Practice metrics"
              subtitle="Recorded drill results over time. Practice data is unaffected by the shot filters."
            >
              <PracticeTrendChart series={practiceSeries} height={190} />
              <ul className="mt-3 flex flex-wrap gap-3 text-xs text-fg-muted">
                {practiceSeries.map((series) => (
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
            </ChartCard>
          ) : null}

          <WeaknessList
            weaknesses={state.weaknesses}
            limit={8}
            title="Ranked development areas"
            description="Computed across your whole dataset, not the current filter."
          />

          <Card>
            <CardHeader>
              <CardTitle>Every segment</CardTitle>
              <p className="mt-0.5 text-xs text-fg-muted">
                The raw table behind the charts, so nothing is hidden.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-fg-subtle">
                    <th className="py-2 pr-4 font-medium">Segment</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 text-right font-medium">Shots</th>
                    <th className="py-2 pr-4 text-right font-medium">SG total</th>
                    <th className="py-2 pr-4 text-right font-medium">SG / shot</th>
                    <th className="py-2 pr-4 text-right font-medium">SG / round</th>
                    <th className="py-2 text-right font-medium">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {[...segments]
                    .sort((a, b) => a.sg_per_round - b.sg_per_round)
                    .map((segment) => (
                      <tr key={`${segment.kind}:${segment.key}`} className="border-b border-border last:border-0">
                        <td className="py-2 pr-4 font-medium">{segment.label}</td>
                        <td className="py-2 pr-4 text-fg-subtle">{labelize(segment.kind)}</td>
                        <td className="tabular py-2 pr-4 text-right">{segment.shots}</td>
                        <td className="tabular py-2 pr-4 text-right">{signed(segment.total_sg, 1)}</td>
                        <td className="tabular py-2 pr-4 text-right">{signed(segment.sg_per_shot)}</td>
                        <td className="tabular py-2 pr-4 text-right">{signed(segment.sg_per_round)}</td>
                        <td className="tabular py-2 text-right text-fg-muted">
                          {segment.trend === null ? "—" : signed(segment.trend)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function groupByRound(shots: Awaited<ReturnType<typeof loadPlayerState>>["shots"]) {
  const map = new Map<string, typeof shots>();
  for (const shot of shots) {
    const list = map.get(shot.round_id) ?? [];
    list.push(shot);
    map.set(shot.round_id, list);
  }
  return map;
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {subtitle ? <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
