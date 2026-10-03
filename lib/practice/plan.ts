import type { PracticeBlock, PracticeItem } from "../../types/practice";
import { DRILLS, DRILLS_BY_ID } from "../seed/drills";
import { GOAL_SHORT, PRACTICE_GOALS, earnedTolerance, type GoalId } from "./goals";
import { blocksForDrill, goalsForDrill } from "./drill-priorities";

/**
 * A practice plan: warm up, fix it, test it, then prove it under pressure.
 *
 * The skill block is always the goal's ten-ball test, scored against a band
 * the player earned last time, so every plan produces a number comparable
 * with the one before. Matching saved drills fill the other work blocks,
 * with a fixed set of defaults when the player hasn't chosen one.
 */

export const PLAN_LENGTHS = [15, 30, 60] as const;
export type PlanLength = (typeof PLAN_LENGTHS)[number];

const LAYOUT: Record<PlanLength, [PracticeBlock, number][]> = {
  15: [
    ["warm_up", 5],
    ["skill", 10],
  ],
  30: [
    ["warm_up", 5],
    ["technical", 10],
    ["skill", 10],
    ["pressure", 5],
  ],
  60: [
    ["warm_up", 10],
    ["technical", 15],
    ["skill", 10],
    ["variable", 10],
    ["pressure", 15],
  ],
};

const LIBRARY: Record<GoalId, Partial<Record<PracticeBlock, string>>> = {
  driver_accuracy: {
    warm_up: "drill_warmup_ladder",
    technical: "drill_tee_height_strike",
    variable: "drill_driver_fairway_finder",
    pressure: "drill_driver_pressure_ladder",
  },
  iron_accuracy: {
    warm_up: "drill_warmup_ladder",
    technical: "drill_gate_face_control",
    variable: "drill_random_approach_challenge",
    pressure: "drill_one_ball_pressure",
  },
  wedge_accuracy: {
    warm_up: "drill_warmup_ladder",
    technical: "drill_strike_zone_wedge",
    variable: "drill_wedge_random_yardage",
    pressure: "drill_one_ball_pressure",
  },
  chip_accuracy: {
    warm_up: "drill_putting_warmup",
    technical: "drill_one_club_chipping",
    variable: "drill_chip_circle",
    pressure: "drill_up_and_down_game",
  },
  putting_conversion: {
    warm_up: "drill_putting_warmup",
    technical: "drill_gate_putting",
    variable: "drill_lag_ladder",
    pressure: "drill_pressure_putting_ladder",
  },
};

export type Plan = {
  title: string;
  focus: string;
  items: Omit<PracticeItem, "id" | "session_id">[];
};

export function buildPlan(
  minutes: PlanLength,
  goalId: GoalId,
  lastOffsets?: number[] | null,
  priorityDrillIds: string[] = [],
): Plan {
  const goal = PRACTICE_GOALS.find((candidate) => candidate.id === goalId)!;
  const priorities = priorityDrillIds.flatMap((id) => {
    const drill = DRILLS_BY_ID.get(id);
    return drill && goalsForDrill(drill).includes(goalId) ? [drill] : [];
  });
  // Reserve the warm-up and test, then use each preferred exercise only once.
  const used = new Set([LIBRARY[goal.id].warm_up!, `drill_${goal.id}`]);
  const items = LAYOUT[minutes].map(([block, duration], order_index) => {
    if (block === "skill") {
      const drill = DRILLS_BY_ID.get(`drill_${goal.id}`)!;
      const tolerance = earnedTolerance(goal, lastOffsets);
      return {
        drill_id: drill.id,
        block,
        order_index,
        duration,
        target_reps: 10,
        target_value: drill.success_threshold,
        tolerance,
        objective:
          tolerance === null
            ? "Make 7 of 10."
            : `7 of 10 within ${tolerance} ${goal.unit === "feet" ? "ft of the hole" : "yd of your line"}.`,
      };
    }
    const fallback = DRILLS_BY_ID.get(LIBRARY[goal.id][block]!)!;
    const drill = block === "warm_up" ? fallback :
      priorities.find((candidate) => !used.has(candidate.id) && blocksForDrill(candidate).includes(block)) ??
      (!used.has(fallback.id) ? fallback : DRILLS.find((candidate) =>
        !used.has(candidate.id) && goalsForDrill(candidate).includes(goalId) && blocksForDrill(candidate).includes(block)))!;
    used.add(drill.id);
    // Keep the drill's own structure when there is time for it; shorten it
    // in proportion when there is not.
    const scale = Math.min(1, duration / drill.recommended_duration);
    const reps = Math.max(5, Math.round(drill.recommended_reps * scale));
    return {
      drill_id: drill.id,
      block,
      order_index,
      duration,
      target_reps: reps,
      target_value: drill.success_threshold,
      tolerance: null,
      objective: `${drill.metric_to_track}: ${Math.ceil(drill.success_threshold * reps)} of ${reps}.`,
    };
  });
  return {
    title: `${minutes}-minute ${GOAL_SHORT[goal.id].toLowerCase()} plan`,
    focus: goal.category,
    items,
  };
}
