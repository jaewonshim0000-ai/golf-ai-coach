import { Suspense } from "react";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { ColumnBars, CountBars, DivergingBars } from "@/components/charts";
import { PriorityCard } from "@/components/dashboard/sections";
import { UpgradePrompt } from "@/components/billing/plan";
import { ChartCard, toFilters, type Search } from "@/components/rounds/play-stats";
import { BaselineSelect } from "@/components/stats/baseline-picker";
import { StatsFilters } from "@/components/stats/filters";
import { Card, CardContent, ChipNav, RoundButton, ScreenTitle, Skeleton, Stat, TopBar } from "@/components/ui/primitives";
import { applyFilters, buildSegments, missBreakdown, summarizeStrokesGained } from "@/lib/analytics/aggregate";
import { getBaseline, rebaseSegment, rebaseSummary } from "@/lib/golf/baselines";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { DISTANCE_BANDS, SG_CATEGORIES, SG_CATEGORY_LABELS, bandStart, labelize } from "@/types/golf";
import { signed } from "@/lib/utils";

export const metadata: Metadata = { title: "Strokes gained" };
export const dynamic = "force-dynamic";

/* What the most common miss from a distance says to do about it. */
const ADVICE: Record<string, string> = {
  short: "Take one more club.",
  long: "Take one less club.",
  left: "Check your aim and the face at impact.",
  right: "Check your aim and the face at impact.",
};

/** The miss pattern target: counts short, long, left and right of the flag. */
function MissTarget({ counts }: { counts: { short: number; long: number; left: number; right: number } }) {
  const top = Math.max(counts.short, counts.long, counts.left, counts.right);
  const tone = (value: number) => (value === top && value > 0 ? "#F2B59B" : "#FFFFFF");
  return (
    <svg
      role="img"
      aria-label={`Misses: ${counts.short} short, ${counts.long} long, ${counts.left} left, ${counts.right} right`}
      width="124"
      height="124"
      viewBox="0 0 124 124"
      className="shrink-0"
    >
      <circle cx="62" cy="62" r="60" fill="#3a3f33" />
      <circle cx="62" cy="62" r="40" fill="#4a5042" />
      <line x1="2" y1="62" x2="122" y2="62" stroke="rgb(255 255 255 / 0.12)" />
      <line x1="62" y1="2" x2="62" y2="122" stroke="rgb(255 255 255 / 0.12)" />
      <circle cx="62" cy="62" r="16" fill="#5C7A2A" />
      <g fontFamily="var(--font-anton), Anton, sans-serif" fontSize="18" textAnchor="middle">
        <text x="62" y="24" fill={tone(counts.long)}>{counts.long}</text>
        <text x="62" y="114" fill={tone(counts.short)}>{counts.short}</text>
        <text x="20" y="68" fill={tone(counts.left)}>{counts.left}</text>
        <text x="104" y="68" fill={tone(counts.right)}>{counts.right}</text>
      </g>
    </svg>
  );
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await repo.currentUser();
  if (!user) return null;
  const [state, search, billing] = await Promise.all([loadPlayerState(user.id), searchParams, repo.getBilling(user.id)]);
  const premium = billing.plan === "premium";
  const baseline = search.baseline ? getBaseline(search.baseline) : state.baseline;

  const shots = applyFilters(state.shots, toFilters(search), state.rounds);
  const summary = rebaseSummary(summarizeStrokesGained(shots), baseline);
  const segments = buildSegments(shots).map((segment) => rebaseSegment(segment, baseline));
  const bars = (kind: string, strip = "") =>
    segments
      .filter((segment) => segment.kind === kind)
      .sort((a, b) => (kind.endsWith("distance") ? bandStart(a.key) - bandStart(b.key) : a.sg_per_round - b.sg_per_round))
      .map((segment) => ({ label: segment.label.replace(strip, ""), value: segment.sg_per_round }));

  // Approach by distance, from 50 yards out, as the design's columns.
  const approach = segments
    .filter((segment) => segment.kind === "approach_distance" && bandStart(segment.key) >= 50)
    .sort((a, b) => bandStart(a.key) - bandStart(b.key));
  const worst = approach.reduce<(typeof approach)[number] | null>((low, segment) => (!low || segment.sg_per_round < low.sg_per_round ? segment : low), null);
  const band = worst ? DISTANCE_BANDS.find((candidate) => candidate.id === worst.key) : undefined;
  const bandShots = band
    ? shots.filter((shot) => {
        if (shot.sg_category !== "approach") return false;
        const yards = shot.starting_unit === "feet" ? shot.starting_distance / 3 : shot.starting_distance;
        return yards >= band.min && (band.max === null || yards < band.max);
      })
    : [];
  const misses = missBreakdown(bandShots);
  const count = (...directions: string[]) => misses.filter((miss) => directions.includes(miss.direction)).reduce((sum, miss) => sum + miss.count, 0);
  const counts = { short: count("short"), long: count("long"), left: count("left", "pull"), right: count("right", "push") };
  const dominant = (Object.entries(counts) as [keyof typeof counts, number][]).sort((a, b) => b[1] - a[1])[0];

  const query = (range: string) => {
    const next = new URLSearchParams();
    if (search.baseline) next.set("baseline", search.baseline);
    if (range) next.set("range", range);
    const text = next.toString();
    return text ? `/rounds/insights?${text}` : "/rounds/insights";
  };

  return (
    <div className="flex flex-col gap-4">
      <TopBar
        left={
          <RoundButton href="/rounds" label="Back to Play">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
        right={<BaselineSelect current={baseline.id} />}
      />
      <ScreenTitle>
        Approach
        <br />
        by distance
      </ScreenTitle>
      <ChipNav
        label="Date range"
        items={[
          { href: query("30"), label: "30 days", active: search.range === "30" },
          { href: query("90"), label: "90 days", active: search.range === "90" },
          { href: query(""), label: "All", active: !search.range },
        ]}
      />

      {!premium ? (
        <UpgradePrompt
          title="Strokes gained by distance"
          message="See where you gain and lose shots by distance, club and lie, against any handicap level."
        />
      ) : (
        <>
          <section className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="dsp text-[20px] leading-none">Strokes per round</h2>
              <span className="text-[12px] font-semibold text-fg-subtle">yards</span>
            </div>
            <ColumnBars
              data={approach.map((segment) => ({
                label: segment.key.endsWith("+") ? segment.key : String(bandStart(segment.key)),
                value: segment.sg_per_round,
              }))}
              label={`Strokes gained per round by distance: ${approach.map((segment) => `${segment.label} ${signed(segment.sg_per_round, 1)}`).join(", ")}`}
            />
          </section>

          {band && dominant && dominant[1] > 0 ? (
            <section className="flex items-center gap-4 rounded-[28px] bg-ink p-5 text-white">
              <MissTarget counts={counts} />
              <div className="flex min-w-0 flex-col gap-2">
                <h2 className="dsp text-[22px] leading-none">Miss pattern</h2>
                <p className="text-[14px] leading-[1.45] text-[#c9ccbf]">
                  From {band.label}, most misses finish <strong className="font-bold text-[#f2b59b]">{dominant[0]}</strong>.{" "}
                  {ADVICE[dominant[0]]}
                </p>
              </div>
            </section>
          ) : null}
        </>
      )}

      {state.weaknesses.length > 0 ? (
        <section className="mt-2 flex flex-col gap-3">
          <h2 className="dsp text-[24px] leading-none">Your priorities</h2>
          {state.weaknesses.slice(0, 2).map((weakness, index) => (
            <div key={weakness.key} id={weakness.key} className="scroll-mt-4">
              <PriorityCard weakness={weakness} rank={index === 0 ? 1 : 2} />
            </div>
          ))}
        </section>
      ) : null}

      {premium ? (
        <section className="mt-2 flex flex-col gap-3">
          <h2 className="dsp text-[24px] leading-none">Full breakdown</h2>
          <p className="text-[13px] text-fg-muted">Every segment of your game, against a {baseline.label.toLowerCase()}.</p>
          <Suspense fallback={<Skeleton className="h-9 w-full" />}>
            <StatsFilters />
          </Suspense>
          {shots.length === 0 ? (
            <p className="rounded-[22px] bg-surface px-4 py-5 text-[14px] text-fg-muted">No shots match. Widen the filters.</p>
          ) : (
            <>
              <Card>
                <CardContent className="grid grid-cols-3 gap-x-3 gap-y-4 p-5">
                  <Stat label="Shots" value={summary.shots} sub={`${summary.rounds} rounds`} />
                  <Stat label="SG / round" value={signed(summary.per_round, 2)} tone={summary.per_round >= 0 ? "good" : "bad"} />
                  <Stat label="SG total" value={signed(summary.total, 1)} tone={summary.total >= 0 ? "good" : "bad"} />
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
              <div className="grid gap-4 lg:grid-cols-2">
                <ChartCard title="By category">
                  <DivergingBars
                    data={SG_CATEGORIES.map((category) => ({ label: SG_CATEGORY_LABELS[category], value: summary.by_category[category].per_round }))}
                  />
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
                  <CountBars data={missBreakdown(shots).map((miss) => ({ label: labelize(miss.direction), value: miss.count }))} height={150} />
                </ChartCard>
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
