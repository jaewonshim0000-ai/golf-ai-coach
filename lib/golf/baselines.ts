import type { SGCategory } from "../../types/golf";
import { SG_CATEGORIES } from "../../types/golf";
import type { CategorySG, RoundSummaryStats, SGSummary, Segment } from "../../types/analytics";

/**
 * Comparison baselines.
 *
 * Every strokes-gained number in this app is computed against the PGA Tour
 * expected-strokes tables, which is the only baseline the shot-level maths
 * knows about. That is the correct place to compute it and the wrong place to
 * read it: an 11-handicap is not trying to beat the Tour, and "-10.7 a round"
 * tells them nothing about whether they are ahead of their own level.
 *
 * Rebasing is subtraction, not a second engine. If a 10-handicap averages
 * -4.3 a round on approach against Tour, then this player's approach against a
 * 10-handicap is simply their Tour figure minus that. So the shot-level
 * calculation, and every test of it, is untouched - this is a display
 * transform applied at the edge.
 *
 * The gaps below are rounded approximations of the published strokes-gained-by
 * -handicap figures (Broadie). They are reference data of the same kind as the
 * expected-strokes tables, and they are deliberately held to one decimal: they
 * are accurate enough to answer "am I ahead of my level?" and not precise
 * enough to pretend to be anything more. The UI says "approx." for that reason.
 */

export type BaselineId = "tour" | "scratch" | "hcp_5" | "hcp_10" | "hcp_15" | "hcp_20";

export type Baseline = {
  id: BaselineId;
  label: string;
  short: string;
  /** Representative handicap index, used to pick a default. Null for Tour. */
  handicap: number | null;
  /** Strokes gained per round this level averages against the Tour baseline. */
  gap: Record<SGCategory, number>;
};

export const BASELINES: Baseline[] = [
  {
    id: "tour",
    label: "PGA Tour",
    short: "Tour",
    handicap: null,
    gap: { off_the_tee: 0, approach: 0, around_the_green: 0, putting: 0 },
  },
  {
    id: "scratch",
    label: "Scratch golfer",
    short: "Scratch",
    handicap: 0,
    gap: { off_the_tee: -0.7, approach: -1.1, around_the_green: -0.5, putting: -0.4 },
  },
  {
    id: "hcp_5",
    label: "5 handicap",
    short: "5 hcp",
    handicap: 5,
    gap: { off_the_tee: -1.7, approach: -2.7, around_the_green: -1.4, putting: -1.2 },
  },
  {
    id: "hcp_10",
    label: "10 handicap",
    short: "10 hcp",
    handicap: 10,
    gap: { off_the_tee: -2.6, approach: -4.3, around_the_green: -2.3, putting: -1.8 },
  },
  {
    id: "hcp_15",
    label: "15 handicap",
    short: "15 hcp",
    handicap: 15,
    gap: { off_the_tee: -3.5, approach: -5.8, around_the_green: -3.2, putting: -2.5 },
  },
  {
    id: "hcp_20",
    label: "20 handicap",
    short: "20 hcp",
    handicap: 20,
    gap: { off_the_tee: -4.4, approach: -7.3, around_the_green: -4.1, putting: -3.2 },
  },
];

const BY_ID = new Map(BASELINES.map((baseline) => [baseline.id, baseline]));

export const TOUR = BASELINES[0]!;

export function getBaseline(id: string | undefined | null): Baseline {
  return (id && BY_ID.get(id as BaselineId)) || TOUR;
}

/** The listed level closest to a player's handicap, so the default is useful. */
export function baselineForHandicap(handicap: number | null | undefined): Baseline {
  if (handicap === null || handicap === undefined) return TOUR;
  let best = TOUR;
  let bestGap = Infinity;
  for (const baseline of BASELINES) {
    if (baseline.handicap === null) continue;
    const distance = Math.abs(baseline.handicap - handicap);
    if (distance < bestGap) {
      bestGap = distance;
      best = baseline;
    }
  }
  return best;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Re-express a summary against another level. Totals are recomputed from the
 * rebased per-round figures rather than scaled, so the four categories still
 * sum to the total - the property the strokes-gained tests pin down.
 */
export function rebaseSummary(summary: SGSummary, baseline: Baseline): SGSummary {
  if (baseline.id === "tour") return summary;
  const rounds = Math.max(1, summary.rounds);

  const by_category = {} as Record<SGCategory, CategorySG>;
  let total = 0;
  for (const category of SG_CATEGORIES) {
    const source = summary.by_category[category];
    const perRound = round2(source.per_round - baseline.gap[category]);
    by_category[category] = {
      category,
      per_round: perRound,
      total: round2(perRound * rounds),
      shots: source.shots,
    };
    total += perRound;
  }

  return {
    ...summary,
    by_category,
    per_round: round2(total),
    total: round2(total * rounds),
  };
}

/**
 * Rebase one round's strokes gained. A round is one round, so it carries the
 * level's whole per-round gap exactly once.
 */
export function rebaseRound(stats: RoundSummaryStats, baseline: Baseline): RoundSummaryStats {
  if (baseline.id === "tour") return stats;
  const by = {} as Record<SGCategory, number>;
  for (const category of SG_CATEGORIES) {
    by[category] = round2(stats.sg_by_category[category] - baseline.gap[category]);
  }
  return {
    ...stats,
    sg_total: round2(SG_CATEGORIES.reduce((sum, c) => sum + by[c], 0)),
    sg_by_category: by,
  };
}

/**
 * Rebase a segment. The category gap is a whole-round figure, so it is shared
 * out across the rounds the segment actually appears in - a segment seen in
 * three of eight rounds carries three rounds' worth of it, not eight.
 */
export function rebaseSegment(segment: Segment, baseline: Baseline): Segment {
  if (baseline.id === "tour") return segment;
  const gap = baseline.gap[segment.category];
  const share = segment.shots > 0 ? gap * shareOfCategory(segment) : 0;
  const perRound = round2(segment.sg_per_round - share);
  const rounds = Math.max(1, segment.rounds);
  return {
    ...segment,
    sg_per_round: perRound,
    total_sg: round2(perRound * rounds),
    sg_per_shot: round2((perRound * rounds) / segment.shots),
  };
}

/**
 * How much of its category's round-level gap a segment should carry.
 *
 * ponytail: proportional to shots per round, capped at 1. A segment that is
 * the whole category takes the whole gap; a band that is a fifth of the
 * approach shots takes a fifth. Exact attribution would need per-band tour and
 * amateur distributions, which are not published at that resolution - so this
 * stays a stated approximation rather than a fake precision.
 */
function shareOfCategory(segment: Segment): number {
  if (segment.kind === "category") return 1;
  const perRound = segment.shots / Math.max(1, segment.rounds);
  // Typical shots per round in each category, used only to apportion the gap.
  const typical: Record<SGCategory, number> = {
    off_the_tee: 14,
    approach: 22,
    around_the_green: 10,
    putting: 31,
  };
  return Math.min(1, perRound / typical[segment.category]);
}
