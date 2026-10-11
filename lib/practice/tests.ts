import type { Club } from "../../types/golf";
import type { Drill, DrillAttempt, PracticeItem, Skill } from "../../types/practice";

export const TEST_GROUPS = ["range", "chipping", "putting"] as const;
export type TestGroup = (typeof TEST_GROUPS)[number];
export type TestKind = "line" | "dispersion" | "carry" | "fairway" | "proximity" | "landing" | "up_down" | "make" | "gate" | "spiral";

export const PRACTICE_TEST_IDS = [
  "test_line_50_100", "test_line_100_150", "test_line_150_200", "test_line_200_250",
  "test_dispersion_50_100", "test_dispersion_100_150", "test_dispersion_150_200", "test_dispersion_200_250",
  "test_driver_distance", "test_driver_accuracy",
  "test_short_chip", "test_medium_chip", "test_long_chip", "test_short_sided_chip", "test_rough_chip",
  "test_bunker", "test_high_lob", "test_mixed_chip", "test_landing_spot", "test_up_and_down",
  "test_putt_3", "test_putt_5", "test_putt_7_10", "test_putt_10_15", "test_putt_15_20",
  "test_lag_20_30", "test_lag_30_40", "test_putt_gate", "test_putt_spiral", "test_putt_random",
] as const;
export type PracticeTestId = (typeof PRACTICE_TEST_IDS)[number];

export type PracticeTest = {
  id: PracticeTestId;
  name: string;
  group: TestGroup;
  focus: string;
  kind: TestKind;
  scoring: string;
  /** Editable before starting; stored with the session, in yards or feet. */
  defaultTolerance?: number;
  category?: Drill["category"];
  skill: Skill;
  clubs: Club[];
  instructions: string[];
};

const rangeBands = ["50–100", "100–150", "150–200", "200–250"];
const rangeClubs: Club[][] = [["pw", "gw", "sw", "lw"], ["7_iron", "8_iron", "9_iron", "pw"], ["4_iron", "5_iron", "6_iron"], ["3_wood", "5_wood", "3_hybrid", "4_hybrid"]];

export const PRACTICE_TESTS: PracticeTest[] = [
  ...rangeBands.map((band, index): PracticeTest => ({
    id: PRACTICE_TEST_IDS[index]!, name: `Line Test — ${band} yd`, group: "range", focus: `${band} yd`, kind: "line",
    scoring: "Shots inside target line /10", defaultTolerance: [5, 10, 15, 20][index]!,
    skill: "start_line", clubs: rangeClubs[index]!,
    instructions: ["Choose one target within this yardage band and a club that reaches it.", "Set your allowed sideways miss before starting. Keep the target and club the same for all ten shots.", "Hit ten balls and plot each finish relative to your target in yards. Count shots within the target-line band."],
  })),
  ...rangeBands.map((band, index): PracticeTest => ({
    id: PRACTICE_TEST_IDS[index + 4]!, name: `Dispersion Combine — ${band} yd`, group: "range", focus: `${band} yd`, kind: "dispersion",
    scoring: "Dispersion diameter", skill: "distance_control", clubs: rangeClubs[index]!,
    instructions: ["Choose one target within this yardage band and use the same club for all ten shots.", "Hit ten balls and plot both the sideways and short/long miss of every finish in yards.", "The dispersion diameter is the distance between the two farthest-apart finishes. Compare it with your next test at the same distance."],
  })),
  { id: "test_driver_distance", name: "Driver Distance Test", group: "range", focus: "Driver", kind: "carry", scoring: "Average carry distance", category: "driver", skill: "strike_quality", clubs: ["driver"],
    instructions: ["Choose one target and use your normal driver swing for ten balls.", "Record each ball's carry in yards using a launch monitor or a measured range. Exclude roll.", "Log all ten carries, including mishits. The result is their average; keep conditions similar when comparing tests."] },
  { id: "test_driver_accuracy", name: "Driver Accuracy Test", group: "range", focus: "Driver", kind: "fairway", scoring: "Fairway hits /10", category: "driver", skill: "start_line", clubs: ["driver"],
    instructions: ["Choose two markers to define your simulated fairway before starting.", "Hit ten drives with your normal routine, keeping the fairway boundaries fixed.", "Tap Fairway or Missed for each finish. Count only balls that finish inside the fairway."] },
  ...([
    ["test_short_chip", "Short Chip Accuracy", "5–10 yd"],
    ["test_medium_chip", "Medium Chip Accuracy", "10–20 yd"],
    ["test_long_chip", "Long Chip Accuracy", "20–30 yd"],
    ["test_short_sided_chip", "Short-Sided Chip Test", "Short-sided lies"],
    ["test_rough_chip", "Rough Chip Test", "From rough"],
    ["test_bunker", "Bunker Shot Test", "Greenside bunker"],
    ["test_high_lob", "High-Lob Chip Test", "High trajectory"],
    ["test_mixed_chip", "Mixed-Distance Test", "5, 10, 15, 20 yd"],
    ["test_landing_spot", "Landing-Spot Accuracy", "Varying landing spots"],
  ] as const).map(([id, name, focus]): PracticeTest => ({
    id, name, group: "chipping", focus, kind: id === "test_landing_spot" ? "landing" : "proximity", defaultTolerance: 6,
    scoring: id === "test_landing_spot" ? "Land within X ft of spot /10" : "Finish within X ft /10",
    category: id === "test_bunker" ? "bunker" : "chipping", skill: id === "test_bunker" ? "bunker_technique" : "chipping_proximity", clubs: ["pw", "gw", "sw", "lw"],
    instructions: [
      id === "test_landing_spot" ? "Mark a landing spot and choose the allowed miss in feet before starting." : `Choose a hole and ${focus.toLowerCase()}. Set the allowed finishing distance in feet before starting.`,
      id === "test_mixed_chip" ? "Hit ten chips, cycling through 5, 10, 15 and 20 yards." : id === "test_landing_spot" ? "Hit ten chips, choosing and marking a landing spot before each shot." : "Hit ten balls from the stated distance or lie.",
      id === "test_landing_spot" ? "Plot where each ball first lands relative to its chosen spot, in feet. Ignore where it rolls afterward." : "Plot each ball's final position relative to the hole in feet. Count finishes within your chosen radius.",
    ],
  })),
  { id: "test_up_and_down", name: "Up-and-Down Challenge", group: "chipping", focus: "10 different lies", kind: "up_down", scoring: "Hole out in 2 strokes, X/10 times", category: "chipping", skill: "pressure_performance", clubs: ["sw", "lw", "putter"],
    instructions: ["Choose ten different lies around the green.", "Play one ball from each lie and putt out. Each lie is one attempt.", "Count a success when you hole out in two strokes or fewer. Record successful up-and-downs out of ten."] },
  ...([
    ["test_putt_3", "Short Putt Test", "3 ft"], ["test_putt_5", "Short-Mid Putt Test", "5 ft"],
    ["test_putt_7_10", "Mid-Range Putt Test", "7–10 ft"], ["test_putt_10_15", "Long Mid-Range Putt Test", "10–15 ft"],
    ["test_putt_15_20", "Long Putt Test", "15–20 ft"],
  ] as const).map(([id, name, focus]): PracticeTest => ({
    id, name, group: "putting", focus, kind: "make", scoring: "Make X/10", skill: "short_putt_conversion", clubs: ["putter"],
    instructions: [`Choose a putt at ${focus}. For a distance band, pick one distance and keep it for all ten putts.`, "Hit ten putts, using your normal read and routine.", "Tap Made or Missed after each putt. Record makes out of ten."],
  })),
  ...([
    ["test_lag_20_30", "Lag Putting Test", "20–30 ft"], ["test_lag_30_40", "Long Lag Putting Test", "30–40 ft"],
  ] as const).map(([id, name, focus]): PracticeTest => ({
    id, name, group: "putting", focus, kind: "proximity", scoring: "Finish within X ft, X/10 times", defaultTolerance: 3, skill: "lag_putting", clubs: ["putter"],
    instructions: [`Choose a putt at ${focus} and set your allowed finishing radius in feet.`, "Hit ten putts and plot each final position relative to the hole in feet.", "Count putts that finish within your chosen radius, including holed putts at zero."],
  })),
  { id: "test_putt_gate", name: "Start-Line Gate Drill", group: "putting", focus: "Short putts with tees", kind: "gate", scoring: "Roll X/10 through the gate", skill: "start_line", clubs: ["putter"],
    instructions: ["Choose a short, straight putt. Place two tees a little wider than a golf ball on your intended start line ahead of the ball.", "Roll ten putts through the same gate.", "Count a success only if the ball passes between the tees without touching either tee. Holing the putt is not required."] },
  { id: "test_putt_spiral", name: "Spiral Short-Putt Challenge", group: "putting", focus: "3, 5, 7, 9 ft", kind: "spiral", scoring: "Make all 4 in a row; restart if you miss", skill: "pressure_performance", clubs: ["putter"],
    instructions: ["Place four balls at 3, 5, 7 and 9 feet from the hole, arranged in a spiral.", "Putt in that order, from shortest to longest.", "If you miss any putt, restart at 3 feet. Keep going until you make all four consecutively.", "Record the number of putts and restarts needed. If you stop early, save the run as incomplete." ] },
  { id: "test_putt_random", name: "Random-Distance Putt Test", group: "putting", focus: "Random distances, 3–30 ft", kind: "make", scoring: "Make X/10", skill: "green_reading", clubs: ["putter"],
    instructions: ["Choose a new putt between 3 and 30 feet before each attempt.", "Hit ten putts with your normal read and routine.", "Tap Made or Missed after each putt. Record makes out of ten."] },
];

const testById = new Map(PRACTICE_TESTS.map((test) => [test.id as string, test]));
export const practiceTest = (id: string) => testById.get(id);
export const measuredTest = (test: PracticeTest) => test.kind === "dispersion" || test.kind === "carry";
export const plottedTest = (test: PracticeTest) => ["line", "dispersion", "proximity", "landing"].includes(test.kind);

export const TEST_DRILLS: Drill[] = PRACTICE_TESTS.map((test) => ({
  id: test.id, name: test.name, category: test.category ?? (test.group === "range" ? (test.focus === "50–100 yd" ? "wedges" : "mid_irons") : test.group),
  sub_category: test.focus, description: `${test.focus}. ${test.scoring}.`, instructions: test.instructions,
  skill_trained: test.skill, difficulty: "intermediate", recommended_duration: test.kind === "spiral" || test.kind === "up_down" ? 15 : 10,
  recommended_reps: test.kind === "spiral" ? 4 : 10,
  equipment_required: test.kind === "gate" ? ["putter", "balls", "2 tees"] : test.kind === "carry" ? ["driver", "balls", "launch monitor or measured range"] : ["club and balls"],
  clubs: test.clubs, metric_to_track: test.scoring, metric_unit: measuredTest(test) ? "yd" : test.kind === "spiral" ? "streak" : "%",
  scoring_method: measuredTest(test) ? "average_distance" : test.kind === "spiral" ? "streak" : "ratio",
  // Measured tests have no invented pass percentage; raw values are compared in yards.
  success_threshold: measuredTest(test) ? 0 : test.kind === "spiral" ? 1 : 0.7,
  progression_level: null, regression_level: null,
}));

export function testObjective(test: PracticeTest, tolerance = test.defaultTolerance ?? null): string {
  if (test.kind === "line") return `10 shots. Count finishes within ${tolerance} yd either side of your target line.`;
  if (test.kind === "proximity" || test.kind === "landing") return `10 balls. ${test.kind === "landing" ? "Land" : "Finish"} within ${tolerance} ft ${test.kind === "landing" ? "of the chosen spot" : "of the hole"}.`;
  if (test.kind === "up_down") return "10 different lies. Count hole-outs in two strokes or fewer.";
  return test.scoring + (test.kind === "spiral" ? ". Continue until completed." : " · 10 balls.");
}

export function testItem(test: PracticeTest, tolerance = test.defaultTolerance ?? null): Omit<PracticeItem, "id" | "session_id"> {
  return { drill_id: test.id, block: "skill", order_index: 0, duration: test.kind === "spiral" || test.kind === "up_down" ? 15 : 10,
    target_reps: test.kind === "spiral" ? 4 : 10, target_value: measuredTest(test) ? 0 : test.kind === "spiral" ? 1 : 0.7,
    tolerance, objective: testObjective(test, tolerance) };
}

export function spiralProgress(outcomes: number[]) {
  let streak = 0, longest = 0, restarts = 0;
  for (const made of outcomes) {
    if (made === 1) streak += 1;
    else { streak = 0; restarts += 1; }
    longest = Math.max(longest, streak);
  }
  return { streak, longest, restarts, complete: longest >= 4, nextDistance: [3, 5, 7, 9][Math.min(streak, 3)]! };
}

export function dispersionDiameter(points: [number, number][]): number {
  let diameter = 0;
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
    diameter = Math.max(diameter, Math.hypot(points[i]![0] - points[j]![0], points[i]![1] - points[j]![1]));
  }
  return diameter;
}

/** Recompute results from samples on the server; submitted counts are never trusted. */
export function scoreTest(test: PracticeTest, item: Pick<PracticeItem, "tolerance">, points: [number, number][] | null, samples: number[] | null) {
  let attempts = 10, successes = 0, score = 0, raw_value: number | null = null;
  if (plottedTest(test)) {
    if (!points || points.length !== 10 || points.some((point) => point.some((v) => !Number.isFinite(v) || Math.abs(v) > 300))) throw new Error("Plot all 10 balls before saving.");
    if (test.kind === "dispersion") raw_value = dispersionDiameter(points);
    else {
      const tolerance = item.tolerance ?? test.defaultTolerance!;
      if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error("Choose a valid target band before starting.");
      const offsets = points.map(([x, y]) => test.kind === "line" ? Math.abs(x) : Math.hypot(x, y));
      successes = offsets.filter((offset) => Math.round(offset * 10) / 10 <= tolerance).length;
      raw_value = offsets.reduce((sum, v) => sum + v, 0) / 10;
      score = successes / 10;
    }
  } else {
    if (!samples?.length || samples.some((v) => !Number.isFinite(v))) throw new Error("Record each attempt before saving.");
    attempts = samples.length;
    if (test.kind === "spiral") {
      if (attempts > 500 || samples.some((v) => v !== 0 && v !== 1)) throw new Error("Enter valid made or missed putts.");
      // The challenge stops at the first completed sequence.
      if (spiralProgress(samples.slice(0, -1)).complete) throw new Error("This spiral was already completed.");
      const progress = spiralProgress(samples);
      successes = progress.longest; raw_value = progress.restarts; score = progress.longest / 4;
    } else {
      if (attempts !== 10) throw new Error("This test uses exactly 10 balls.");
      if (test.kind === "carry") {
        if (samples.some((v) => v < 0 || v > 600)) throw new Error("Enter carry distances between 0 and 600 yd.");
        raw_value = samples.reduce((sum, v) => sum + v, 0) / 10;
      } else {
        if (samples.some((v) => v !== 0 && v !== 1)) throw new Error("Enter valid successful or unsuccessful attempts.");
        successes = samples.filter((v) => v === 1).length; score = successes / 10;
      }
    }
  }
  return { attempts, successes, score, raw_value: raw_value === null ? null : Math.round(raw_value * 1000) / 1000,
    shot_points: plottedTest(test) ? points : null, shot_offsets: plottedTest(test) ? null : samples };
}

export function testResultLabel(test: PracticeTest, result: Pick<DrillAttempt, "attempts" | "successes" | "raw_value" | "score">): string {
  if (measuredTest(test)) return result.raw_value === null ? "No measurement" : `${result.raw_value.toFixed(1)} yd ${test.kind === "carry" ? "average carry" : "dispersion diameter"}`;
  if (test.kind === "spiral") return `${result.score >= 1 ? "Completed" : `Incomplete · best streak ${result.successes}/4`} in ${result.attempts} putts · ${result.raw_value ?? 0} restart${result.raw_value === 1 ? "" : "s"}`;
  return `${result.successes}/10 ${test.kind === "up_down" ? "up-and-downs in 2 strokes or fewer" : test.kind === "fairway" ? "fairways" : test.kind === "gate" ? "through the gate" : test.kind === "make" ? "made" : test.kind === "landing" ? "inside the landing radius" : "inside the target band"}`;
}
