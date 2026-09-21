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
