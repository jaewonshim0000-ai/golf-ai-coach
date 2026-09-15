import type { PracticeMetricTrend, RoundSummaryStats, TrendPoint } from "../../types/analytics";
import type { HoleResult } from "../../types/rounds";
import type { Drill, DrillAttempt, PracticeSession } from "../../types/practice";
import { SG_CATEGORY_LABELS } from "../../types/golf";
import { COACH_SYSTEM_PROMPT, getProvider, type AIResult } from "./provider";
import {
  practiceSummarySchema,
  roundSummarySchema,
  trendAnalysisSchema,
  type PracticeSummaryOutput,
  type RoundSummaryOutput,
  type TrendAnalysisOutput,
} from "./schemas";

/** Per-round, per-session and trend narration. Each is an independent service. */

export async function summarizeRound(
  stats: RoundSummaryStats,
  holes: HoleResult[],
): Promise<AIResult<RoundSummaryOutput>> {
  const provider = getProvider();
  const facts = roundFacts(stats, holes);

  return provider.generate({
    name: "round_summary",
    system: COACH_SYSTEM_PROMPT,
    maxTokens: 900,
    prompt: `Summarise this round for the player. Every number below is already computed - use these and nothing else.

${JSON.stringify(facts, null, 1)}

Return JSON matching:
{ "headline": string, "what_went_well": string[], "what_cost_you": string[], "takeaway": string }`,
    schema: roundSummarySchema,
    fallback: () => ruleBasedRoundSummary(stats, holes),
  });
}

function roundFacts(stats: RoundSummaryStats, holes: HoleResult[]) {
  return {
    course: stats.course_name,
    date: stats.played_on,
    score: stats.score,
    toPar: stats.to_par,
    holesPlayed: stats.holes_played,
    strokesGainedTotal: stats.sg_total,
    strokesGainedByCategory: stats.sg_by_category,
    fairways: `${stats.fairways_hit}/${stats.fairway_opportunities}`,
    greensInRegulation: `${stats.greens_in_regulation}/${stats.holes_played}`,
    putts: stats.putts,
    penalties: stats.penalties,
    upAndDowns: `${stats.up_and_downs}/${stats.up_and_down_opportunities}`,
    sandSaves: `${stats.sand_saves}/${stats.sand_save_opportunities}`,
    biggestGain: stats.best_hole,
    biggestLoss: stats.worst_hole,
    worstShots: holes
      .flatMap((h) => h.shots)
      .sort((a, b) => a.strokes_gained - b.strokes_gained)
      .slice(0, 3)
      .map((s) => ({
        hole: s.hole_number,
        club: s.club,
        from: `${Math.round(s.starting_distance)} ${s.starting_unit} ${s.starting_location}`,
        to: s.ending_location,
        strokesGained: s.strokes_gained,
      })),
  };
}

export function ruleBasedRoundSummary(
  stats: RoundSummaryStats,
  holes: HoleResult[],
): RoundSummaryOutput {
  if (stats.holes_played === 0) {
    return {
      headline: "No shots recorded for this round yet",
      what_went_well: [],
      what_cost_you: [],
      takeaway: "Add shots to this round and the analysis will populate automatically.",
    };
  }

  const categories = Object.entries(stats.sg_by_category).sort((a, b) => b[1] - a[1]);
  const best = categories[0];
  const worst = categories[categories.length - 1];

  const wentWell: string[] = [];
  if (best && best[1] > 0) {
    wentWell.push(
      `${SG_CATEGORY_LABELS[best[0] as keyof typeof SG_CATEGORY_LABELS]} gained you ${best[1].toFixed(2)} strokes.`,
    );
  }
  if (stats.fairway_opportunities > 0 && stats.fairways_hit / stats.fairway_opportunities >= 0.6) {
    wentWell.push(`You found ${stats.fairways_hit} of ${stats.fairway_opportunities} fairways.`);
  }
  if (stats.up_and_down_opportunities > 0 && stats.up_and_downs / stats.up_and_down_opportunities >= 0.5) {
    wentWell.push(`${stats.up_and_downs} of ${stats.up_and_down_opportunities} up and downs saved.`);
  }

  const costYou: string[] = [];
  if (worst && worst[1] < 0) {
    costYou.push(
      `${SG_CATEGORY_LABELS[worst[0] as keyof typeof SG_CATEGORY_LABELS]} cost you ${Math.abs(worst[1]).toFixed(2)} strokes.`,
    );
  }
  if (stats.penalties > 0) {
    costYou.push(`${stats.penalties} penalty stroke${stats.penalties === 1 ? "" : "s"}.`);
  }
  if (stats.worst_hole) {
    costYou.push(
      `Hole ${stats.worst_hole.hole_number} was the worst of the day at ${stats.worst_hole.strokes_gained.toFixed(2)} strokes.`,
    );
  }

  const biggestMiss = holes
    .flatMap((h) => h.shots)
    .sort((a, b) => a.strokes_gained - b.strokes_gained)[0];

  return {
    headline:
      stats.to_par !== null
        ? `${stats.score} at ${stats.course_name} (${stats.to_par >= 0 ? "+" : ""}${stats.to_par}), ${stats.sg_total >= 0 ? "+" : ""}${stats.sg_total.toFixed(1)} strokes gained`
        : `${stats.holes_played} holes at ${stats.course_name}`,
    what_went_well: wentWell.slice(0, 3),
    what_cost_you: costYou.slice(0, 3),
    takeaway: biggestMiss
      ? `The single most expensive shot was on hole ${biggestMiss.hole_number} from ${Math.round(biggestMiss.starting_distance)} ${biggestMiss.starting_unit} (${biggestMiss.strokes_gained.toFixed(2)} strokes). One round is a small sample, so treat this as one data point rather than a verdict.`
      : "One round is a small sample. The picture gets reliable after three or four.",
  };
}

export type PracticeSessionFacts = {
  session: PracticeSession;
  attempts: DrillAttempt[];
  drills: Drill[];
  trends: PracticeMetricTrend[];
};

export async function summarizePracticeSession(
  facts: PracticeSessionFacts,
): Promise<AIResult<PracticeSummaryOutput>> {
  const provider = getProvider();
  const drillById = new Map(facts.drills.map((d) => [d.id, d]));
  const payload = {
    title: facts.session.title,
    focus: facts.session.focus,
    minutes: facts.session.actual_duration ?? facts.session.planned_duration,
    results: facts.attempts.map((a) => {
      const drill = drillById.get(a.drill_id);
      return {
        drill: drill?.name ?? a.drill_id,
        metric: drill?.metric_to_track ?? "score",
        result: `${a.successes}/${a.attempts}`,
        score: a.score,
        target: drill?.success_threshold ?? null,
      };
    }),
    history: facts.trends.map((t) => ({
      drill: t.drill_name,
      baseline: t.baseline,
      latest: t.latest,
      target: t.target,
      sessions: t.sessions,
    })),
  };

  return provider.generate({
    name: "practice_summary",
    system: COACH_SYSTEM_PROMPT,
    maxTokens: 900,
    prompt: `Summarise this practice session.

${JSON.stringify(payload, null, 1)}

Return JSON matching:
{ "headline": string, "results": string[], "verdict": "improving"|"holding"|"not_transferring"|"insufficient_data", "next_step": string }`,
    schema: practiceSummarySchema,
    fallback: () => ruleBasedPracticeSummary(facts),
  });
}

export function ruleBasedPracticeSummary(facts: PracticeSessionFacts): PracticeSummaryOutput {
  const drillById = new Map(facts.drills.map((d) => [d.id, d]));

  if (facts.attempts.length === 0) {
    return {
      headline: "Session logged with no drill results",
      results: [],
      verdict: "insufficient_data",
      next_step: "Record a result for each drill and the progress tracking starts working immediately.",
    };
  }

  const lines = facts.attempts.map((a) => {
    const drill = drillById.get(a.drill_id);
    const trend = facts.trends.find((t) => t.drill_id === a.drill_id);
    const previous = trend && trend.points.length > 1 ? trend.points[trend.points.length - 2]?.value : null;
    const change =
      previous !== null && previous !== undefined
        ? ` (previous ${Math.round(previous * 100)}%, ${a.score >= previous ? "+" : ""}${Math.round((a.score - previous) * 100)} pts)`
        : "";
    return `${drill?.name ?? a.drill_id}: ${a.successes}/${a.attempts} = ${Math.round(a.score * 100)}%${change}, target ${Math.round((drill?.success_threshold ?? 0) * 100)}%.`;
  });

  const withHistory = facts.trends.filter((t) => t.sessions >= 3 && t.delta !== null);
  const improving = withHistory.filter((t) => (t.delta as number) > 0.03);
  const declining = withHistory.filter((t) => (t.delta as number) < -0.03);

  const verdict: PracticeSummaryOutput["verdict"] =
    withHistory.length === 0
      ? "insufficient_data"
      : improving.length > declining.length
        ? "improving"
        : declining.length > 0
          ? "not_transferring"
          : "holding";

  const nextStep: Record<PracticeSummaryOutput["verdict"], string> = {
    improving: "The metric is moving. Hold the drill for one more session, then add variability.",
    holding: "Numbers are steady but not climbing. Give it one more session before changing anything.",
    not_transferring: "This drill is not moving the number. Drop to the regression drill and simplify the task.",
    insufficient_data: "Two more sessions on this drill and there will be enough history to judge it.",
  };

  const best = facts.attempts.reduce((a, b) => (b.score > a.score ? b : a));

  return {
    headline: `${facts.attempts.length} drill${facts.attempts.length === 1 ? "" : "s"} logged, best result ${Math.round(best.score * 100)}% on ${drillById.get(best.drill_id)?.name ?? best.drill_id}`,
    results: lines.slice(0, 5),
    verdict,
    next_step: nextStep[verdict],
  };
}

export async function analyzePerformanceTrend(
  label: string,
  points: TrendPoint[],
  unit = "strokes",
): Promise<AIResult<TrendAnalysisOutput>> {
  const provider = getProvider();

  return provider.generate({
    name: "trend_analysis",
    system: COACH_SYSTEM_PROMPT,
    maxTokens: 800,
    prompt: `Interpret this trend. Do not extrapolate beyond the points given.

Metric: ${label} (${unit})
Points: ${JSON.stringify(points)}

Return JSON matching:
{ "headline": string, "direction": "improving"|"flat"|"declining"|"insufficient_data", "observations": string[], "what_to_do": string }`,
    schema: trendAnalysisSchema,
    fallback: () => ruleBasedTrend(label, points, unit),
  });
}

export function ruleBasedTrend(
  label: string,
  points: TrendPoint[],
  unit: string,
): TrendAnalysisOutput {
  if (points.length < 3) {
    return {
      headline: `Not enough history to read a trend in ${label.toLowerCase()}`,
      direction: "insufficient_data",
      observations: [`${points.length} data point${points.length === 1 ? "" : "s"} recorded. Three is the minimum before a direction means anything.`],
      what_to_do: "Keep logging. The trend line becomes useful at around five entries.",
    };
  }

  const half = Math.floor(points.length / 2);
  const earlier = points.slice(0, half);
  const recent = points.slice(points.length - half);
  const avg = (list: TrendPoint[]) => list.reduce((s, p) => s + p.value, 0) / list.length;
  const delta = avg(recent) - avg(earlier);
  const direction: TrendAnalysisOutput["direction"] =
    Math.abs(delta) < 0.15 ? "flat" : delta > 0 ? "improving" : "declining";

  return {
    headline: `${label}: ${direction === "flat" ? "holding steady" : direction} by ${Math.abs(delta).toFixed(2)} ${unit}`,
    direction,
    observations: [
      `Earlier half averaged ${avg(earlier).toFixed(2)} ${unit}, recent half ${avg(recent).toFixed(2)} ${unit}.`,
      `Best: ${Math.max(...points.map((p) => p.value)).toFixed(2)}. Worst: ${Math.min(...points.map((p) => p.value)).toFixed(2)}.`,
      `${points.length} entries between ${points[0]?.date} and ${points[points.length - 1]?.date}.`,
    ],
    what_to_do:
      direction === "improving"
        ? "Whatever the current block is doing, it is working. Do not change it yet."
        : direction === "declining"
          ? "Worth checking whether the practice work is actually transferring, or whether the drill needs simplifying."
          : "Flat is not failure over a short window, but if it stays flat for another two weeks the block needs changing.",
  };
}
