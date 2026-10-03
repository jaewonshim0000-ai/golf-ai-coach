import type { PlayerProfile } from "../../types/player";
import type { Drill, PracticeBlock } from "../../types/practice";
import type { Round, ScoredShot } from "../../types/rounds";
import { buildSegments } from "../analytics/aggregate";
import { identifyWeaknesses } from "../analytics/weaknesses";
import { goalForWeakness, practiceGoal, type GoalId } from "./goals";

/** A stable selection of 30 drills spanning every part of the game. */
export const PRACTICE_DRILL_IDS = [
  "drill_driver_accuracy",
  "drill_iron_accuracy",
  "drill_wedge_accuracy",
  "drill_chip_accuracy",
  "drill_putting_conversion",
  "drill_9_ball_contact",
  "drill_half_swing_contact",
  "drill_towel_gate_contact",
  "drill_gate_face_control",
  "drill_split_hand_face",
  "drill_headcover_path",
  "drill_pause_at_top",
  "drill_three_to_one_tempo",
  "drill_driver_fairway_finder",
  "drill_tee_height_strike",
  "drill_driver_pressure_ladder",
  "drill_long_iron_ladder",
  "drill_short_iron_dartboard",
  "drill_wedge_matrix",
  "drill_strike_zone_wedge",
  "drill_pitch_landing_zone",
  "drill_chip_circle",
  "drill_one_club_chipping",
  "drill_up_and_down_game",
  "drill_bunker_line",
  "drill_gate_putting",
  "drill_clock_putting",
  "drill_lag_ladder",
  "drill_speed_control_uphill",
  "drill_pressure_putting_ladder",
] as const;

const catalog = new Set<string>(PRACTICE_DRILL_IDS);

/** Metadata is a preference, never a permission or an unvalidated drill id. */
export function cleanDrillPriorities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && catalog.has(id)))];
}

export function goalsForDrill(drill: Drill): GoalId[] {
  const quick = practiceGoal(drill.id);
  if (quick) return [quick.id];
  if (["chipping", "pitching", "bunker"].includes(drill.category) ||
      ["chipping_proximity", "pitching_proximity", "bunker_technique"].includes(drill.skill_trained)) {
    return ["chip_accuracy"];
  }
  if (drill.clubs.length > 0 && drill.clubs.every((club) => club === "putter")) {
    return ["putting_conversion"];
  }
  const goals: GoalId[] = [];
  if (drill.clubs.includes("driver") || drill.category === "driver") goals.push("driver_accuracy");
  if (drill.clubs.some((club) => club.includes("iron") || club.includes("wood") || club.includes("hybrid"))) {
    goals.push("iron_accuracy");
  }
  if (drill.category === "wedges" || drill.clubs.some((club) => ["pw", "gw", "sw", "lw"].includes(club))) {
    goals.push("wedge_accuracy");
  }
  return goals;
}

/** Keep a selected drill in the part of the plan its exercise is designed for. */
export function blocksForDrill(drill: Drill): PracticeBlock[] {
  if (practiceGoal(drill.id) || drill.category === "full_swing") return [];
  if (drill.category === "pressure_practice" || drill.category === "course_simulation") return ["pressure"];
  if (drill.category === "random_practice") return ["variable"];
  return ["technical", "variable"];
}

export type RankedPracticeDrill = {
  drill: Drill;
  score: number;
  reason: string | null;
  signal: "rounds" | "early" | null;
};

/** Recent course performance drives the order; preferences don't hide a need. */
export function rankPracticeDrills(
  drills: Drill[],
  { rounds, shots, profile }: { rounds: Round[]; shots: ScoredShot[]; profile: PlayerProfile | null },
): RankedPracticeDrill[] {
  const recentRounds = [...rounds]
    .filter((round) => round.holes_played > 0 || shots.some((shot) => shot.round_id === round.id))
    .sort((a, b) => b.played_on.localeCompare(a.played_on) || b.created_at.localeCompare(a.created_at))
    .slice(0, 10);
  const ids = new Set(recentRounds.map((round) => round.id));
  const recentShots = shots.filter((shot) => ids.has(shot.round_id));
  const weaknesses = identifyWeaknesses({
    segments: buildSegments(recentShots),
    profile,
    totalRounds: new Set(recentShots.map((shot) => shot.round_id)).size,
  });

  // Scorecards can show missed fairways and three-putts. A total score alone
  // cannot tell us which skill caused it. Don't count a shot-tracked round twice.
  const tracked = new Set(recentShots.map((shot) => shot.round_id));
  const cards = recentRounds.filter((round) => !tracked.has(round.id) && round.hole_stats?.some(Boolean));
  const holes = cards.flatMap((round) => round.hole_stats?.filter((hole) => hole !== null) ?? []);
  const fairways = holes.filter((hole) => hole.fairway !== null);
  const missed = fairways.filter((hole) => hole.fairway !== "hit").length;
  const countedPutts = holes.filter((hole) => hole.putts !== null);
  const threePutts = countedPutts.filter((hole) => hole.putts! >= 3).length;

  return drills.filter((drill) => catalog.has(drill.id)).map((drill) => {
    const goals = goalsForDrill(drill);
    let score = 0;
    let reason: string | null = null;
    let signal: RankedPracticeDrill["signal"] = null;
    for (const weakness of weaknesses) {
      if (!goals.includes(goalForWeakness(weakness))) continue;
      // Bunker work needs evidence from a bunker, rather than general chips.
      if (drill.category === "bunker" && !weakness.key.includes("bunker")) continue;
      const clubMatch = weakness.kind === "club" && drill.clubs.includes(weakness.key as Drill["clubs"][number]);
      const skillMatch = weakness.related_skills.includes(drill.skill_trained);
      const candidate = weakness.priority * (clubMatch ? 1.3 : skillMatch ? 1.15 : 1);
      if (candidate <= score) continue;
      score = candidate;
      reason = `${weakness.title}: ${weakness.strokes_lost_per_round.toFixed(2)} strokes lost per round across ${weakness.sample_size} recorded shots.`;
      signal = weakness.sufficient_sample ? "rounds" : "early";
    }
    if (goals.includes("driver_accuracy") && missed > 0) {
      const candidate = missed / (cards.length || 1) * Math.min(1, fairways.length / 14) * 0.1;
      if (candidate > score) {
        score = candidate;
        reason = `${missed} of ${fairways.length} recorded fairways missed in recent scorecards.`;
        signal = fairways.length >= 14 ? "rounds" : "early";
      }
    }
    if (goals.includes("putting_conversion") && threePutts > 0) {
      const candidate = threePutts / (cards.length || 1) * Math.min(1, countedPutts.length / 18) *
        (["lag_putting", "speed_control"].includes(drill.skill_trained) ? 1.15 : 1);
      if (candidate > score) {
        score = candidate;
        reason = `${threePutts} three-putt hole${threePutts === 1 ? "" : "s"} in ${countedPutts.length} holes with putts recorded.`;
        signal = countedPutts.length >= 18 ? "rounds" : "early";
      }
    }
    return { drill, score, reason, signal };
  }).sort((a, b) => b.score - a.score ||
    PRACTICE_DRILL_IDS.indexOf(a.drill.id as typeof PRACTICE_DRILL_IDS[number]) -
    PRACTICE_DRILL_IDS.indexOf(b.drill.id as typeof PRACTICE_DRILL_IDS[number]));
}
