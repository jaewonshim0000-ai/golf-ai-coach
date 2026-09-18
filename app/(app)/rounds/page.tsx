import Link from "next/link";
import type { Metadata } from "next";
import { Flag } from "lucide-react";

import { Suspense } from "react";

import { CountBars, DivergingBars, TrendLine } from "@/components/charts";
import { BaselinePicker } from "@/components/stats/baseline-picker";
import { StatsFilters } from "@/components/stats/filters";
import {
  Badge,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  MiniCard,
  PageHero,
  SectionHeading,
  Skeleton,
  Stat,
} from "@/components/ui/primitives";
import type { Club, Lie, SGCategory, ShotType } from "@/types/golf";
import { SG_CATEGORIES, SG_CATEGORY_LABELS, bandStart, labelize } from "@/types/golf";
import type { StatsFilters as Filters } from "@/types/analytics";
import {
  applyFilters,
  buildSegments,
  missBreakdown,
  summarizeStrokesGained,
} from "@/lib/analytics/aggregate";
import {
  baselineForHandicap,
  getBaseline,
  rebaseRound,
  rebaseSegment,
  rebaseSummary,
} from "@/lib/golf/baselines";
import { summarizeRound } from "@/lib/golf/strokes-gained";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { cn, formatDate, relativeDays, signed, toParLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Rounds" };
export const dynamic = "force-dynamic";

type Search = {
  baseline?: string;
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

export default async function RoundsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await repo.currentUser();
  if (!user) return null;
  const [state, search] = await Promise.all([loadPlayerState(user.id), searchParams]);

  const baseline = search.baseline
    ? getBaseline(search.baseline)
    : baselineForHandicap(state.profile?.handicap_index ?? null);

  const shots = applyFilters(state.shots, toFilters(search), state.rounds);
  const summary = rebaseSummary(summarizeStrokesGained(shots), baseline);
  const segments = buildSegments(shots).map((segment) => rebaseSegment(segment, baseline));

  const bars = (kind: string, strip = "") =>
    segments
      .filter((segment) => segment.kind === kind)
      .sort((a, b) =>
        kind.endsWith("distance")
          ? bandStart(a.key) - bandStart(b.key)
          : a.sg_per_round - b.sg_per_round,
      )
      .map((segment) => ({ label: segment.label.replace(strip, ""), value: segment.sg_per_round }));

  const misses = missBreakdown(shots).map((miss) => ({
    label: labelize(miss.direction),
    value: miss.count,
  }));

  return (
    <div className="space-y-5">
      <PageHero
        art="course"
        title="All rounds"
        description="Every shot you log. Nothing estimated."
        action={
          <ButtonLink href="/rounds/new" size="sm">
            <Flag className="h-3.5 w-3.5" /> New round
          </ButtonLink>
        }
      />

      {state.rounds.length === 0 ? (
        <EmptyState
          title="No rounds yet"
          message="Play your first round to start discovering where you're gaining and losing shots."
          action={
            <ButtonLink href="/rounds/new" size="sm">
              Log a round
            </ButtonLink>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Scoring</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendLine points={state.scoringTrend} height={150} invert />
            </CardContent>
          </Card>

          <SectionHeading title="Logged rounds" />

          <div className="grid gap-2.5 md:grid-cols-2">
            {state.rounds.map((round) => {
              const stats = rebaseRound(
                summarizeRound(round, state.shotsByRound.get(round.id) ?? []),
                baseline,
              );
              return (
                <MiniCard key={round.id} className="transition-colors hover:border-border-strong">
                  <Link href={`/rounds/${round.id}`} className="block p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold">
                          {round.course_name}
                          {round.status === "in_progress" ? (
                            <Badge tone="warn" className="ml-2 align-middle">
                              in progress
                            </Badge>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[11px] text-fg-subtle">
                          {formatDate(round.played_on)} &middot; {relativeDays(round.played_on)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular text-[20px] font-semibold leading-none">
                          {stats.score ?? "—"}
                        </p>
                        <p className="tabular dsp mt-0.5 text-[10px] tracking-[0.08em] text-fg-subtle">
                          {toParLabel(stats.to_par)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-5 gap-2">
                      <SGCell label="SG" value={stats.sg_total} digits={1} />
                      <SGCell label="Tee" value={stats.sg_by_category.off_the_tee} />
                      <SGCell label="App" value={stats.sg_by_category.approach} />
                      <SGCell label="ARG" value={stats.sg_by_category.around_the_green} />
                      <SGCell label="Putt" value={stats.sg_by_category.putting} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2.5 text-[11px] text-fg-subtle">
                      <span className="tabular">
                        FIR {stats.fairways_hit}/{stats.fairway_opportunities}
                      </span>
                      <span className="tabular">
                        GIR {stats.greens_in_regulation}/{stats.holes_played}
                      </span>
                      <span className="tabular">Putts {stats.putts}</span>
                    </div>
                  </Link>
                </MiniCard>
              );
            })}
          </div>

          <SectionHeading
            title="Breakdown"
            description={`Every segment of your game, against a ${baseline.label.toLowerCase()}.`}
          />

          <BaselinePicker current={baseline.id} />

          <Suspense fallback={<Skeleton className="h-9 w-full" />}>
            <StatsFilters />
          </Suspense>

          {shots.length === 0 ? (
            <EmptyState title="No shots match" message="Widen the filters." />
          ) : (
            <>
              <Card>
                <CardContent className="grid grid-cols-3 gap-x-3 gap-y-4 p-5">
                  <Stat label="Shots" value={summary.shots} sub={`${summary.rounds} rounds`} />
                  <Stat
                    label="SG / round"
                    value={signed(summary.per_round, 2)}
                    tone={summary.per_round >= 0 ? "good" : "bad"}
                  />
                  <Stat
                    label="SG total"
                    value={signed(summary.total, 1)}
                    tone={summary.total >= 0 ? "good" : "bad"}
                  />
                  {SG_CATEGORIES.map((category) => (
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

              <div className="grid gap-5 lg:grid-cols-2">
                <ChartCard title="By category">
                  <DivergingBars
                    data={SG_CATEGORIES.map((category) => ({
                      label: SG_CATEGORY_LABELS[category],
                      value: summary.by_category[category].per_round,
                    }))}
                  />
                </ChartCard>
                <ChartCard title="Approach by distance">
                  <DivergingBars data={bars("approach_distance", " yd approach")} compact />
                </ChartCard>
                <ChartCard title="Putting by distance">
                  <DivergingBars data={bars("putt_distance", "Putts ")} compact />
                </ChartCard>
                <ChartCard title="By club">
                  <DivergingBars data={bars("club").slice(0, 10)} compact />
                </ChartCard>
                <ChartCard title="By lie">
                  <DivergingBars data={bars("lie")} compact />
                </ChartCard>
                <ChartCard title="Miss directions">
                  <CountBars data={misses} height={150} />
                </ChartCard>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SGCell({ label, value, digits = 2 }: { label: string; value: number; digits?: number }) {
  return (
    <div className="min-w-0">
      <p className="dsp text-[8.5px] tracking-[0.15em] text-fg-subtle">{label}</p>
      <p
        className={cn(
          "tabular mt-0.5 text-[12.5px] font-semibold",
          value > 0.05 ? "text-good" : value < -0.05 ? "text-bad" : "text-fg-muted",
        )}
      >
        {signed(value, digits)}
      </p>
    </div>
  );
}
