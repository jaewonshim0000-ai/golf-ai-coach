import { Suspense } from "react";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { ColumnBars, CountBars, DivergingBars } from "@/components/charts";
import { PriorityCard } from "@/components/dashboard/sections";
import { UpgradePrompt } from "@/components/billing/plan";
import { ChartCard, toFilters, type Search } from "@/components/rounds/play-stats";
import { BaselineSelect } from "@/components/stats/baseline-picker";
import { StatsFilters } from "@/components/stats/filters";
import { Card, CardContent, ChipNav, RoundButton, ScreenTitle, Skeleton, Sparkle, Stat, TopBar } from "@/components/ui/primitives";
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
      width="132"
      height="132"
      viewBox="0 0 132 132"
      className="shrink-0"
    >
      <circle cx="66" cy="66" r="62" fill="#2F352A" />
      <circle cx="66" cy="66" r="40" fill="#3A4232" />
      <circle cx="66" cy="66" r="16" fill="#5C7A2A" />
      <path d="M4 66h124M66 4v124" stroke="#4A5042" strokeWidth="1" />
      <g fontFamily="var(--font-anton), Anton, sans-serif" fontSize="16" textAnchor="middle">
        <text x="66" y="28" fill={tone(counts.long)}>{counts.long}</text>
        <text x="66" y="118" fill={tone(counts.short)}>{counts.short}</text>
        <text x="24" y="72" fill={tone(counts.left)}>{counts.left}</text>
        <text x="108" y="72" fill={tone(counts.right)}>{counts.right}</text>
      </g>
    </svg>
  );
}

/* The main chart's three readings, as the design's tabs. */
const VIEWS = [
  { id: "distance", label: "Distance", unit: "yards" },
  { id: "club", label: "Club", unit: "by club" },
  { id: "lie", label: "Lie", unit: "by lie" },
] as const;

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Search & { by?: string }> }) {
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

  // Tabs keep every other filter; the date range lives with the full breakdown's filters.
  const view = VIEWS.find((item) => item.id === search.by) ?? VIEWS[0];
  const query = (by: string) => {
    const next = new URLSearchParams(Object.entries(search).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
    next.delete("by");
    if (by !== "distance") next.set("by", by);
    const text = next.toString();
    return text ? `/rounds/insights?${text}` : "/rounds/insights";
  };
  const columns =
    view.id === "distance"
      ? approach.map((segment) => ({
          label: segment.key.endsWith("+") ? segment.key : String(bandStart(segment.key)),
          value: segment.sg_per_round,
          name: segment.label,
        }))
      : segments
          .filter((segment) => segment.kind === view.id)
          .sort((a, b) => a.sg_per_round - b.sg_per_round)
          .slice(0, 7)
          .map((segment) => ({ label: segment.label, value: segment.sg_per_round, name: segment.label }));
  const range = search.range ? `last ${search.range} days` : "all rounds";

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
      <div className="flex flex-col gap-2">
        <span className="dsp inline-flex h-[26px] items-center gap-1.5 self-start rounded-full bg-ink pl-1 pr-2.5 text-[10px] tracking-[0.1em] text-white">
          <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#3a3f33] text-gold">
            <Sparkle className="h-2.5 w-2.5" />
          </span>
          Premium
        </span>
        <ScreenTitle>
          Strokes
          <br />
          gained
        </ScreenTitle>
      </div>
      <ChipNav
        label="Break it down by"
        items={VIEWS.map((item) => ({ href: query(item.id), label: item.label, active: item.id === view.id }))}
      />

      {!premium ? (
        <UpgradePrompt
          title="Strokes gained by distance"
          message="See where you gain and lose shots by distance, club and lie, against any handicap level."
        />
      ) : (
        <>
          <section className="flex flex-col gap-2.5 rounded-[28px] bg-surface px-4 pb-3.5 pt-4 shadow-[var(--shadow-card)]">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="dsp text-[20px] leading-none">Strokes per round</h2>
              <span className="text-[12px] font-semibold text-fg-subtle">
                {view.unit} · {range}
              </span>
            </div>
            <ColumnBars
              data={columns}
              label={`Strokes gained per round ${view.unit === "yards" ? "by distance" : view.unit}: ${columns.map((column) => `${column.name} ${signed(column.value, 1)}`).join(", ")}`}
            />
          </section>

          {band && dominant && dominant[1] > 0 ? (
            <section className="flex items-center gap-3.5 rounded-[28px] bg-ink p-4 text-white">
              <MissTarget counts={counts} />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h2 className="dsp text-[20px] leading-none">Miss pattern</h2>
                <p className="text-[13px] leading-[1.45] text-[#c9ccbf]">
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
