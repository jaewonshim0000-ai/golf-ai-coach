import type { Lie, SGCategory } from "../../../types/golf";
import type { HoleResult, Round, ScoredShot, Shot } from "../../../types/rounds";
import type { RoundSummaryStats } from "../../../types/analytics";
import { expectedStrokes, toYards, type BallState } from "../expected-strokes";

/**
 * Strokes gained.
 *
 *   SG = E(state before) - E(state after) - 1 - penalty strokes
 *
 * Everything else in the app reads SG from here. No component recomputes it.
 */

/** Distance (yards) inside which a non-green shot counts as "around the green". */
export const AROUND_GREEN_YARDS = 30;

/** A ball that finished OB or in a hazard has no playable expectation. */
const TERMINAL_LIES: readonly Lie[] = ["hazard", "out_of_bounds"];

function startState(shot: Shot): BallState {
  return {
    lie: shot.starting_location,
    distance: shot.starting_distance,
    unit: shot.starting_unit,
  };
}

function endState(shot: Shot): BallState {
  if (shot.ending_location === "holed") {
    return { lie: "holed", distance: 0, unit: "yards" };
  }
  // A recorded hazard/OB finish means the ball was dropped. We score the drop
  // as rough at the same distance; the penalty stroke is charged separately.
  if (TERMINAL_LIES.includes(shot.ending_location)) {
    return { lie: "rough", distance: shot.ending_distance, unit: shot.ending_unit };
  }
  return {
    lie: shot.ending_location,
    distance: shot.ending_distance,
    unit: shot.ending_unit,
  };
}

export function categorizeShot(shot: Shot): SGCategory {
  if (shot.starting_location === "green") return "putting";
  if (shot.starting_location === "tee" && shot.hole_par >= 4) return "off_the_tee";
  const yards = toYards(shot.starting_distance, shot.starting_unit);
  if (yards <= AROUND_GREEN_YARDS) return "around_the_green";
  return "approach";
}

/** Strokes gained for one shot, plus the expectations it was derived from. */
export function scoreShot(shot: Shot): ScoredShot {
  const before = expectedStrokes(startState(shot));
  const after = expectedStrokes(endState(shot));
  const penalty = Math.max(0, shot.penalty_strokes);
  // A recorded hazard/OB finish always carries at least one penalty stroke,
  // even if the entry form left the field at zero.
  const effectivePenalty =
    TERMINAL_LIES.includes(shot.ending_location) && penalty === 0 ? 1 : penalty;
  return {
    ...shot,
    expected_before: round3(before),
    expected_after: round3(after),
    strokes_gained: round3(before - after - 1 - effectivePenalty),
    sg_category: categorizeShot(shot),
  };
}

export function scoreShots(shots: Shot[]): ScoredShot[] {
  return shots.map(scoreShot);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function bySequence(a: Shot, b: Shot): number {
  return a.hole_number - b.hole_number || a.shot_number - b.shot_number;
}

/**
 * Group scored shots into per-hole results with the derived counting stats
 * (fairways, GIR, putts, up-and-downs) the dashboard and round page need.
 */
export function buildHoleResults(shots: Shot[]): HoleResult[] {
  const scored = scoreShots([...shots].sort(bySequence));
  const byHole = new Map<number, ScoredShot[]>();
  for (const shot of scored) {
    const list = byHole.get(shot.hole_number) ?? [];
    list.push(shot);
    byHole.set(shot.hole_number, list);
  }

  const results: HoleResult[] = [];
  for (const [holeNumber, holeShots] of [...byHole.entries()].sort((a, b) => a[0] - b[0])) {
    const par = holeShots[0]?.hole_par ?? 4;
    const penalties = holeShots.reduce((sum, s) => sum + Math.max(0, s.penalty_strokes), 0);
    const strokes = holeShots.length + penalties;
    const putts = holeShots.filter((s) => s.starting_location === "green").length;
    const strokesGained = round3(holeShots.reduce((sum, s) => sum + s.strokes_gained, 0));

    const teeShot = holeShots.find((s) => s.shot_number === 1);
    const fairwayHit =
      par >= 4 && teeShot
        ? teeShot.ending_location === "fairway" || teeShot.ending_location === "first_cut"
        : null;

    // Strokes used at the moment the ball first reached the putting surface.
    let strokesToGreen: number | null = null;
    let used = 0;
    for (const shot of holeShots) {
      used += 1 + Math.max(0, shot.penalty_strokes);
      if (shot.ending_location === "green" || shot.ending_location === "holed") {
        strokesToGreen = used;
        break;
      }
    }
    const gir = strokesToGreen !== null && strokesToGreen <= par - 2;

    // Up-and-down: the last approach-to-green shot from inside the short-game
    // radius, followed by at most one more stroke.
    let upAndDown: boolean | null = null;
    let sandSave: boolean | null = null;
    if (!gir) {
      const index = holeShots.findIndex(
        (s) =>
          s.starting_location !== "green" &&
          toYards(s.starting_distance, s.starting_unit) <= AROUND_GREEN_YARDS + 20 &&
          (s.ending_location === "green" || s.ending_location === "holed"),
      );
      if (index >= 0) {
        const chip = holeShots[index]!;
        const strokesFromThere = holeShots
          .slice(index)
          .reduce((sum, s) => sum + 1 + Math.max(0, s.penalty_strokes), 0);
        upAndDown = strokesFromThere <= 2;
        if (chip.starting_location === "greenside_bunker") sandSave = upAndDown;
      }
    }

    results.push({
      hole_number: holeNumber,
      par,
      strokes,
      penalties,
      score_to_par: strokes - par,
      shots: holeShots,
      strokes_gained: strokesGained,
      fairway_hit: fairwayHit,
      green_in_regulation: gir,
      putts,
      up_and_down: upAndDown,
      sand_save: sandSave,
    });
  }
  return results;
}

const EMPTY_CATEGORIES: Record<SGCategory, number> = {
  off_the_tee: 0,
  approach: 0,
  around_the_green: 0,
  putting: 0,
};

export function summarizeRound(round: Round, shots: Shot[]): RoundSummaryStats {
  const holes = buildHoleResults(shots);
  const scored = holes.flatMap((h) => h.shots);

  const byCategory = { ...EMPTY_CATEGORIES };
  for (const shot of scored) byCategory[shot.sg_category] += shot.strokes_gained;
  for (const key of Object.keys(byCategory) as SGCategory[]) {
    byCategory[key] = round3(byCategory[key]);
  }

  const strokes = holes.reduce((sum, h) => sum + h.strokes, 0);
  const par = holes.reduce((sum, h) => sum + h.par, 0);
  const score = round.score ?? (holes.length > 0 ? strokes : null);

  const fairwayOpportunities = holes.filter((h) => h.fairway_hit !== null).length;
  const udOpportunities = holes.filter((h) => h.up_and_down !== null).length;
  const sandOpportunities = holes.filter((h) => h.sand_save !== null).length;

  const ranked = [...holes].sort((a, b) => b.strokes_gained - a.strokes_gained);

  return {
    round_id: round.id,
    course_name: round.course_name,
    played_on: round.played_on,
    score,
    to_par: score !== null && holes.length > 0 ? score - par : null,
    holes_played: holes.length,
    sg_total: round3(scored.reduce((sum, s) => sum + s.strokes_gained, 0)),
    sg_by_category: byCategory,
    fairways_hit: holes.filter((h) => h.fairway_hit === true).length,
    fairway_opportunities: fairwayOpportunities,
    greens_in_regulation: holes.filter((h) => h.green_in_regulation).length,
    putts: holes.reduce((sum, h) => sum + h.putts, 0),
    penalties: holes.reduce((sum, h) => sum + h.penalties, 0),
    up_and_downs: holes.filter((h) => h.up_and_down === true).length,
    up_and_down_opportunities: udOpportunities,
    sand_saves: holes.filter((h) => h.sand_save === true).length,
    sand_save_opportunities: sandOpportunities,
    best_hole: ranked[0]
      ? { hole_number: ranked[0].hole_number, strokes_gained: ranked[0].strokes_gained }
      : null,
    worst_hole: ranked[ranked.length - 1]
      ? {
          hole_number: ranked[ranked.length - 1]!.hole_number,
          strokes_gained: ranked[ranked.length - 1]!.strokes_gained,
        }
      : null,
  };
}

export { expectedStrokes } from "../expected-strokes";
