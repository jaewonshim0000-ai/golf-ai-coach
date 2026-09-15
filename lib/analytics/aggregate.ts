import {
  CLUB_LABELS,
  DISTANCE_BANDS,
  SG_CATEGORIES,
  SG_CATEGORY_LABELS,
  distanceBand,
  labelize,
  lateralBucket,
  puttBand,
} from "../../types/golf";
import type { MissDirection, SGCategory } from "../../types/golf";
import type {
  DispersionPoint,
  Segment,
  SegmentKind,
  SGSummary,
  StatsFilters,
  TrendPoint,
} from "../../types/analytics";
import type { Round, ScoredShot } from "../../types/rounds";
import { toYards } from "../golf/expected-strokes";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

const EMPTY_SUMMARY: SGSummary = {
  total: 0,
  per_round: 0,
  rounds: 0,
  shots: 0,
  by_category: {
    off_the_tee: { category: "off_the_tee", total: 0, per_round: 0, shots: 0 },
    approach: { category: "approach", total: 0, per_round: 0, shots: 0 },
    around_the_green: { category: "around_the_green", total: 0, per_round: 0, shots: 0 },
    putting: { category: "putting", total: 0, per_round: 0, shots: 0 },
  },
};

export function summarizeStrokesGained(shots: ScoredShot[]): SGSummary {
  if (shots.length === 0) return structuredClone(EMPTY_SUMMARY);
  const rounds = new Set(shots.map((s) => s.round_id)).size || 1;

  const summary: SGSummary = {
    total: 0,
    per_round: 0,
    rounds,
    shots: shots.length,
    by_category: structuredClone(EMPTY_SUMMARY.by_category),
  };

  for (const shot of shots) {
    summary.total += shot.strokes_gained;
    const bucket = summary.by_category[shot.sg_category];
    bucket.total += shot.strokes_gained;
    bucket.shots += 1;
  }

  summary.total = round2(summary.total);
  summary.per_round = round2(summary.total / rounds);
  for (const category of SG_CATEGORIES) {
    const bucket = summary.by_category[category];
    bucket.total = round2(bucket.total);
    bucket.per_round = round2(bucket.total / rounds);
  }
  return summary;
}

type SegmentSeed = {
  kind: SegmentKind;
  key: string;
  label: string;
  category: SGCategory;
  shots: ScoredShot[];
};

function buildSegment(seed: SegmentSeed, totalRounds: number): Segment {
  const values = seed.shots.map((s) => s.strokes_gained);
  const total = values.reduce((a, b) => a + b, 0);
  const rounds = new Set(seed.shots.map((s) => s.round_id)).size;

  // Trend: recent half minus earlier half, on a chronologically ordered sample.
  let trend: number | null = null;
  if (seed.shots.length >= 8) {
    const ordered = [...seed.shots].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const half = Math.floor(ordered.length / 2);
    const earlier = ordered.slice(0, half).map((s) => s.strokes_gained);
    const recent = ordered.slice(ordered.length - half).map((s) => s.strokes_gained);
    trend = round2(mean(recent) - mean(earlier));
  }

  return {
    kind: seed.kind,
    key: seed.key,
    label: seed.label,
    category: seed.category,
    shots: seed.shots.length,
    rounds,
    total_sg: round2(total),
    sg_per_shot: round2(total / seed.shots.length),
    // Per round is measured against every round in the dataset, not only the
    // rounds this segment appeared in - otherwise a rare miss looks catastrophic.
    sg_per_round: round2(total / Math.max(1, totalRounds)),
    trend,
    volatility: round2(stdev(values)),
  };
}

function group<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

/**
 * Every way we slice performance, in one pass. The weakness engine reads
 * segments; nothing downstream re-groups raw shots.
 */
export function buildSegments(shots: ScoredShot[]): Segment[] {
  if (shots.length === 0) return [];
  const totalRounds = new Set(shots.map((s) => s.round_id)).size || 1;
  const segments: Segment[] = [];

  for (const [key, group_] of group(shots, (s) => s.sg_category)) {
    segments.push(
      buildSegment(
        {
          kind: "category",
          key,
          label: SG_CATEGORY_LABELS[key as SGCategory],
          category: key as SGCategory,
          shots: group_,
        },
        totalRounds,
      ),
    );
  }

  const approaches = shots.filter((s) => s.sg_category === "approach");
  for (const [key, group_] of group(approaches, (s) =>
    distanceBand(toYards(s.starting_distance, s.starting_unit)).id,
  )) {
    const band = DISTANCE_BANDS.find((b) => b.id === key);
    segments.push(
      buildSegment(
        {
          kind: "approach_distance",
          key,
          label: `${band?.label ?? key} yd approach`,
          category: "approach",
          shots: group_,
        },
        totalRounds,
      ),
    );
  }

  const putts = shots.filter((s) => s.sg_category === "putting");
  for (const [key, group_] of group(putts, (s) =>
    puttBand(s.starting_unit === "feet" ? s.starting_distance : s.starting_distance * 3).id,
  )) {
    segments.push(
      buildSegment(
        {
          kind: "putt_distance",
          key,
          label: `Putts ${key.replace("-", "–")} ft`,
          category: "putting",
          shots: group_,
        },
        totalRounds,
      ),
    );
  }

  for (const [key, group_] of group(shots, (s) => s.club)) {
    segments.push(
      buildSegment(
        {
          kind: "club",
          key,
          label: CLUB_LABELS[key as keyof typeof CLUB_LABELS] ?? labelize(key),
          category: dominantCategory(group_),
          shots: group_,
        },
        totalRounds,
      ),
    );
  }

  for (const [key, group_] of group(shots, (s) =>
    s.starting_location === "green" ? null : s.starting_location,
  )) {
    segments.push(
      buildSegment(
        {
          kind: "lie",
          key,
          label: `From ${labelize(key).toLowerCase()}`,
          category: dominantCategory(group_),
          shots: group_,
        },
        totalRounds,
      ),
    );
  }

  for (const [key, group_] of group(shots, (s) => s.shot_type)) {
    segments.push(
      buildSegment(
        {
          kind: "shot_type",
          key,
          label: `${labelize(key)} shots`,
          category: dominantCategory(group_),
          shots: group_,
        },
        totalRounds,
      ),
    );
  }

  for (const [key, group_] of group(shots, (s) => `par_${s.hole_par}`)) {
    segments.push(
      buildSegment(
        {
          kind: "hole_par",
          key,
          label: `Par ${key.replace("par_", "")} holes`,
          category: dominantCategory(group_),
          shots: group_,
        },
        totalRounds,
      ),
    );
  }

  return segments;
}

function dominantCategory(shots: ScoredShot[]): SGCategory {
  const counts = new Map<SGCategory, number>();
  for (const shot of shots) {
    counts.set(shot.sg_category, (counts.get(shot.sg_category) ?? 0) + 1);
  }
  let best: SGCategory = "approach";
  let bestCount = -1;
  for (const [category, count] of counts) {
    if (count > bestCount) {
      best = category;
      bestCount = count;
    }
  }
  return best;
}

/** SG per round over time, oldest first. */
export function sgTrend(
  rounds: Round[],
  shotsByRound: Map<string, ScoredShot[]>,
  category?: SGCategory,
): TrendPoint[] {
  return [...rounds]
    .sort((a, b) => a.played_on.localeCompare(b.played_on))
    .map((r) => {
      const shots = shotsByRound.get(r.id) ?? [];
      const relevant = category ? shots.filter((s) => s.sg_category === category) : shots;
      return {
        date: r.played_on,
        label: r.course_name,
        value: round2(relevant.reduce((sum, s) => sum + s.strokes_gained, 0)),
      };
    });
}

export function scoringTrend(rounds: Round[]): TrendPoint[] {
  return [...rounds]
    .filter((r) => r.score !== null)
    .sort((a, b) => a.played_on.localeCompare(b.played_on))
    .map((r) => ({ date: r.played_on, label: r.course_name, value: r.score as number }));
}

export function dispersion(shots: ScoredShot[]): DispersionPoint[] {
  return shots
    .filter((s) => s.club !== null && s.sg_category !== "putting")
    .map((s) => {
      const yards = toYards(s.starting_distance, s.starting_unit);
      return {
        club: s.club!,
        shot_type: s.shot_type,
        lie: s.starting_location,
        distance: Math.round(yards),
        band: distanceBand(yards).id,
        lateral: lateralBucket(s.miss_direction),
        strokes_gained: s.strokes_gained,
      };
    });
}

export function missBreakdown(shots: ScoredShot[]): { direction: MissDirection; count: number; sg: number }[] {
  const map = new Map<MissDirection, { count: number; sg: number }>();
  for (const shot of shots) {
    if (!shot.miss_direction) continue;
    const entry = map.get(shot.miss_direction) ?? { count: 0, sg: 0 };
    entry.count += 1;
    entry.sg += shot.strokes_gained;
    map.set(shot.miss_direction, entry);
  }
  return [...map.entries()]
    .map(([direction, v]) => ({ direction, count: v.count, sg: round2(v.sg) }))
    .sort((a, b) => b.count - a.count);
}

export function applyFilters(shots: ScoredShot[], filters: StatsFilters, rounds: Round[]): ScoredShot[] {
  const dateByRound = new Map(rounds.map((r) => [r.id, r.played_on]));
  return shots.filter((shot) => {
    const played = dateByRound.get(shot.round_id);
    if (filters.from && played && played < filters.from) return false;
    if (filters.to && played && played > filters.to) return false;
    if (filters.clubs?.length && (!shot.club || !filters.clubs.includes(shot.club))) return false;
    if (filters.lies?.length && !filters.lies.includes(shot.starting_location)) return false;
    if (filters.shotTypes?.length && !filters.shotTypes.includes(shot.shot_type)) return false;
    if (filters.categories?.length && !filters.categories.includes(shot.sg_category)) return false;
    const yards = toYards(shot.starting_distance, shot.starting_unit);
    if (filters.minDistance !== undefined && yards < filters.minDistance) return false;
    if (filters.maxDistance !== undefined && yards > filters.maxDistance) return false;
    return true;
  });
}
