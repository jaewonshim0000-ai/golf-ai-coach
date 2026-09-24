import type { Drill } from "../../types/practice";

export const PRACTICE_GOALS = [
  { id: "driver_accuracy", label: "Driver — tighter dispersion", category: "driver", skill: "start_line", club: "driver", tolerance: 15, unit: "yards" },
  { id: "iron_accuracy", label: "Irons — hit your target line", category: "mid_irons", skill: "start_line", club: "7_iron", tolerance: 10, unit: "yards" },
  { id: "wedge_accuracy", label: "Wedges — tighter dispersion", category: "wedges", skill: "start_line", club: "sw", tolerance: 5, unit: "yards" },
  { id: "chip_accuracy", label: "Chipping — finish close", category: "chipping", skill: "chipping_proximity", club: "sw", tolerance: 6, unit: "feet" },
  { id: "putting_conversion", label: "Putting — make short putts", category: "putting", skill: "short_putt_conversion", club: "putter", tolerance: null, unit: "feet" },
] as const;

export function practiceGoal(drillId: string) {
  return PRACTICE_GOALS.find((goal) => `drill_${goal.id}` === drillId);
}

export const QUICK_DRILLS: Drill[] = PRACTICE_GOALS.map((goal) => ({
  id: `drill_${goal.id}`,
  name: goal.label,
  category: goal.category,
  sub_category: "10-ball practice",
  description: goal.id === "chip_accuracy"
    ? "Chip ten balls at one hole and estimate how far each finishes from it."
    : goal.tolerance === null
      ? "Putt ten balls from a comfortable short-putt distance and count makes."
      : "Hit ten balls at a visible target. Estimate the sideways miss; carry distance is not needed.",
  instructions: goal.id === "chip_accuracy"
    ? ["Choose one hole and one chipping position.", "Chip 10 balls. Estimate each ball's distance from the hole in feet.", "A finish within 6 feet counts as good; aim for 7 of 10."]
    : goal.tolerance === null
      ? ["Pick a straight putt around 3–6 feet.", "Hit 10 putts from the same spot.", "Count makes and aim for at least 7 of 10."]
      : ["Pick a visible target and keep the same club for all 10 shots.", `Estimate each miss in ${goal.unit}: negative for left, positive for right, 0 on line.`, `A shot within ${goal.tolerance} ${goal.unit} either side counts as good. Aim for 7 of 10.`],
  skill_trained: goal.skill,
  difficulty: "beginner",
  recommended_duration: 10,
  recommended_reps: 10,
  equipment_required: [goal.club === "putter" ? "putter and balls" : "club and balls"],
  clubs: [goal.club],
  metric_to_track: goal.tolerance === null ? "Putts made" : goal.id === "chip_accuracy" ? "Chips within 6 feet" : `Shots within ${goal.tolerance} ${goal.unit} of target line`,
  metric_unit: "%",
  scoring_method: "ratio",
  success_threshold: 0.7,
  progression_level: null,
  regression_level: null,
}));

export function dispersion(values: number[], tolerance: number) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  return {
    count: values.length,
    successes: values.filter((value) => Math.abs(value) <= tolerance).length,
    averageMiss: values.reduce((sum, value) => sum + Math.abs(value), 0) / values.length,
    bias: values.reduce((sum, value) => sum + value, 0) / values.length,
    spread: Math.max(...values) - Math.min(...values),
  };
}

export type PracticeGoal = (typeof PRACTICE_GOALS)[number];
export type GoalId = PracticeGoal["id"];

/** Short names for titles and chips. */
export const GOAL_SHORT: Record<GoalId, string> = {
  driver_accuracy: "Driver",
  iron_accuracy: "Irons",
  wedge_accuracy: "Wedges",
  chip_accuracy: "Chipping",
  putting_conversion: "Putting",
};

/** The bands a goal can be scored against, loosest first, in the goal's unit. */
export const TOLERANCE_LADDER: Record<GoalId, number[]> = {
  driver_accuracy: [25, 20, 15, 12, 10, 8],
  iron_accuracy: [15, 12, 10, 8, 6, 5],
  wedge_accuracy: [10, 8, 6, 5, 4, 3],
  chip_accuracy: [10, 8, 6, 5, 4, 3],
  putting_conversion: [],
};

/**
 * The number a ball is scored on: the sideways miss for a full swing, the
 * distance from the hole for a chip. Points are [left/right, short/long].
 */
export function offsetFor(goal: PracticeGoal, point: [number, number]): number {
  const value = goal.id === "chip_accuracy" ? Math.hypot(point[0], point[1]) : point[0];
  return Math.round(value * 10) / 10;
}

/**
 * Today's band: the tightest one the last session would still have passed at
 * seven in ten. Hit it and the next session asks for more; have a bad day and
 * it gives some back. So the target tracks the player instead of sitting at a
 * number that is either trivial or hopeless for them.
 */
export function earnedTolerance(
  goal: PracticeGoal,
  lastOffsets: number[] | null | undefined,
): number | null {
  if (goal.tolerance === null) return null;
  const ladder = TOLERANCE_LADDER[goal.id];
  if (!lastOffsets?.length) return goal.tolerance;
  const needed = Math.ceil(lastOffsets.length * 0.7);
  const earned = [...ladder]
    .reverse()
    .find((band) => lastOffsets.filter((value) => Math.abs(value) <= band).length >= needed);
  return earned ?? ladder[0]!;
}

/** Which way the misses lean, from tapped points. Null with nothing to read. */
export function missPattern(points: [number, number][], goal: PracticeGoal, tolerance: number) {
  if (points.length === 0) return null;
  const offsets = points.map((point) => offsetFor(goal, point));
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const lateral = mean(points.map(([x]) => x));
  const depth = mean(points.map(([, y]) => y));
  const xs = points.map(([x]) => x);
  const unit = goal.unit === "feet" ? "ft" : "yd";
  const lean = (value: number, negative: string, positive: string) =>
    Math.abs(value) < tolerance / 4
      ? null
      : `${Math.abs(value).toFixed(1)} ${unit} ${value < 0 ? negative : positive}`;
  const leans = [lean(lateral, "left", "right"), lean(depth, "short", "long")].filter(Boolean);
  return {
    count: points.length,
    successes: offsets.filter((value) => Math.abs(value) <= tolerance).length,
    averageMiss: mean(offsets.map(Math.abs)),
    lateral,
    depth,
    spread: Math.max(...xs) - Math.min(...xs),
    summary:
      leans.length === 0
        ? "No lean: the misses are centred on the target."
        : `Leaning ${leans.join(" and ")} on average.`,
  };
}

/** The goal that attacks a weakness, by where on the course it costs strokes. */
export function goalForWeakness(weakness: { category: string; key: string } | null): GoalId {
  if (!weakness) return "iron_accuracy";
  if (weakness.category === "off_the_tee") return "driver_accuracy";
  if (weakness.category === "putting") return "putting_conversion";
  if (weakness.category === "around_the_green") return "chip_accuracy";
  const start = parseInt(weakness.key, 10);
  return (Number.isFinite(start) && start < 100) || /^(pw|gw|sw|lw)$/.test(weakness.key)
    ? "wedge_accuracy"
    : "iron_accuracy";
}
