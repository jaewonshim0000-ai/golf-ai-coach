import type { Club, Condition, Lie, MissDirection, ShotType } from "../../types/golf";
import type { HandicapEntry, PlayerProfile, User } from "../../types/player";
import type { Course, HoleSpec, Round, Shot } from "../../types/rounds";
import type {
  DrillAttempt,
  PracticeItem,
  PracticeSession,
  SwingFinding,
  SwingMeasurement,
  SwingSession,
} from "../../types/practice";
import { scoreShots } from "../golf/strokes-gained";
import { buildSegments } from "../analytics/aggregate";
import { identifyWeaknesses } from "../analytics/weaknesses";
import { practiceTrends } from "../analytics/practice-progress";
import { DRILLS_BY_ID } from "./drills";

/**
 * Demo data.
 *
 * Rounds are SIMULATED shot by shot and then scored by the real strokes-gained
 * engine. No strokes-gained number, weakness or trend is written by hand - they
 * all fall out of the same code that runs on real user data. Change the skill
 * model below and every downstream number changes with it.
 *
 * The story it tells: an 11.8 handicap who drives it well, leaks strokes from
 * 150-175 yards, has stalled mid-iron contact in practice, and whose swing
 * session flagged a possible transition and face issue - and who has started
 * to turn it around in the last three rounds.
 */

const SEED = 20260914;

/** Deterministic PRNG so the demo never changes shape between runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rng: () => number, mean: number, sd: number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function pick<T>(rng: () => number, options: readonly [T, number][]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return options[options.length - 1]![0];
}

function daysAgo(days: number, today: Date): string {
  const date = new Date(today.getTime() - days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- courses

function holes(pars: number[], yards: number[]): HoleSpec[] {
  return pars.map((par, i) => ({
    hole_number: i + 1,
    par,
    yards: yards[i] ?? 400,
    handicap_index: i + 1,
  }));
}

export const DEMO_COURSES: Course[] = [
  {
    id: "course_riverbend",
    user_id: null,
    name: "Riverbend Golf Club",
    city: "Portland, OR",
    par: 72,
    holes: holes(
      [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5],
      [402, 371, 168, 512, 428, 389, 152, 534, 415, 396, 186, 441, 505, 358, 420, 164, 383, 527],
    ),
    created_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "course_stonehill",
    user_id: null,
    name: "Stonehill Links",
    city: "Portland, OR",
    par: 71,
    holes: holes(
      [4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4, 4, 5, 3, 4, 4],
      [389, 174, 412, 521, 366, 434, 141, 398, 498, 377, 425, 197, 351, 408, 540, 158, 392, 419],
    ),
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

// ------------------------------------------------------------ skill model

type SkillModel = {
  driveCarry: number;
  driveSd: number;
  /** Probability of hitting a green, by approach distance band. */
  greenRate: Record<string, number>;
  /** Proximity in feet when the green is hit, as a fraction of yards. */
  proximityFactor: number;
  shortGameProximity: number;
  puttSkill: number;
};

const BASE_SKILL: SkillModel = {
  driveCarry: 248,
  driveSd: 19,
  greenRate: {
    "0-50": 0.72,
    "50-75": 0.66,
    "75-100": 0.61,
    "100-125": 0.54,
    "125-150": 0.45,
    // The hole in the game. Everything else is ordinary for the handicap.
    "150-175": 0.17,
    "175-200": 0.28,
    "200-225": 0.15,
    "225+": 0.07,
  },
  proximityFactor: 0.29,
  shortGameProximity: 10.5,
  puttSkill: 0.93,
};

/**
 * Improvement applied to the most recent rounds, so the demo shows the loop
 * closing rather than a static snapshot.
 */
function skillForRound(index: number, total: number): SkillModel {
  const recent = index >= total - 3;
  if (!recent) return BASE_SKILL;
  return {
    ...BASE_SKILL,
    greenRate: { ...BASE_SKILL.greenRate, "150-175": 0.46, "125-150": 0.53 },
    proximityFactor: 0.26,
  };
}

function bandOf(yards: number): string {
  if (yards < 50) return "0-50";
  if (yards < 75) return "50-75";
  if (yards < 100) return "75-100";
  if (yards < 125) return "100-125";
  if (yards < 150) return "125-150";
  if (yards < 175) return "150-175";
  if (yards < 200) return "175-200";
  if (yards < 225) return "200-225";
  return "225+";
}

function clubFor(yards: number): Club {
  if (yards >= 235) return "3_wood";
  if (yards >= 215) return "5_wood";
  if (yards >= 198) return "3_hybrid";
  if (yards >= 186) return "4_hybrid";
  if (yards >= 176) return "4_iron";
  if (yards >= 164) return "5_iron";
  if (yards >= 153) return "6_iron";
  if (yards >= 141) return "7_iron";
  if (yards >= 127) return "8_iron";
  if (yards >= 113) return "9_iron";
  if (yards >= 96) return "pw";
  if (yards >= 72) return "gw";
  if (yards >= 40) return "sw";
  return "lw";
}

/** Probability of holing a putt from a given distance in feet. */
function makeProbability(feet: number, skill: number): number {
  if (feet <= 1) return 0.99;
  return Math.min(0.99, (1 / (1 + (feet / 8.5) ** 1.8)) * skill);
}

// -------------------------------------------------------------- simulation

type Builder = {
  rng: () => number;
  roundId: string;
  userId: string;
  createdAt: string;
  shots: Shot[];
  counter: { value: number };
};

function push(
  b: Builder,
  hole: HoleSpec,
  shotNumber: number,
  start: { lie: Lie; distance: number; unit: "yards" | "feet" },
  club: Club | null,
  shotType: ShotType,
  end: { lie: Lie; distance: number; unit: "yards" | "feet" },
  extra: Partial<Shot> = {},
): void {
  b.counter.value += 1;
  b.shots.push({
    id: `${b.roundId}_h${hole.hole_number}_s${shotNumber}`,
    round_id: b.roundId,
    user_id: b.userId,
    hole_number: hole.hole_number,
    hole_par: hole.par,
    shot_number: shotNumber,
    starting_location: start.lie,
    starting_distance: Math.round(start.distance * 10) / 10,
    starting_unit: start.unit,
    lie: start.lie,
    club,
    shot_type: shotType,
    intended_target: null,
    ending_location: end.lie,
    ending_distance: Math.round(end.distance * 10) / 10,
    ending_unit: end.unit,
    penalty_strokes: 0,
    penalty_type: "none",
    miss_direction: null,
    notes: null,
    created_at: b.createdAt,
    ...extra,
  });
}

function missFor(rng: () => number, bandIsWeak: boolean): MissDirection {
  return bandIsWeak
    ? pick(rng, [
        ["right", 4],
        ["short", 3],
        ["push", 2],
        ["left", 1],
        ["long", 1],
      ] as const)
    : pick(rng, [
        ["short", 2],
        ["right", 2],
        ["left", 2],
        ["long", 1],
        ["straight", 1],
      ] as const);
}

function simulateHole(b: Builder, hole: HoleSpec, skill: SkillModel): void {
  const rng = b.rng;
  let lie: Lie = "tee";
  let distance = hole.yards;
  let unit: "yards" | "feet" = "yards";
  let shotNumber = 1;
  let guard = 0;

  while (guard++ < 12) {
    if (lie === "green") break;

    // Tee shot on a two-shot hole or longer.
    if (lie === "tee" && hole.par >= 4) {
      const carry = Math.max(150, gauss(rng, skill.driveCarry, skill.driveSd));
      const result = pick(rng, [
        ["fairway", 58],
        ["first_cut", 9],
        ["rough", 23],
        ["fairway_bunker", 5],
        ["recovery", 3],
        ["out_of_bounds", 2],
      ] as const);
      const remaining = Math.max(45, hole.yards - carry);

      if (result === "out_of_bounds") {
        push(
          b,
          hole,
          shotNumber,
          { lie: "tee", distance, unit: "yards" },
          "driver",
          "tee",
          { lie: "rough", distance: Math.max(60, hole.yards - carry * 0.55), unit: "yards" },
          { penalty_strokes: 1, penalty_type: "out_of_bounds", miss_direction: "right" },
        );
        lie = "rough";
        distance = Math.max(60, hole.yards - carry * 0.55);
        shotNumber += 1;
        continue;
      }

      push(
        b,
        hole,
        shotNumber,
        { lie: "tee", distance, unit: "yards" },
        "driver",
        "tee",
        { lie: result, distance: remaining, unit: "yards" },
        { miss_direction: result === "fairway" ? "straight" : missFor(rng, false) },
      );
      lie = result;
      distance = remaining;
      shotNumber += 1;
      continue;
    }

    // Long shot that cannot reach the green: lay up.
    if (distance > 232) {
      const advance = Math.max(120, gauss(rng, 208, 24));
      const result = pick(rng, [
        ["fairway", 55],
        ["first_cut", 12],
        ["rough", 27],
        ["fairway_bunker", 6],
      ] as const);
      const remaining = Math.max(40, distance - advance);
      push(
        b,
        hole,
        shotNumber,
        { lie, distance, unit: "yards" },
        clubFor(distance),
        "layup",
        { lie: result, distance: remaining, unit: "yards" },
        { miss_direction: result === "fairway" ? "straight" : missFor(rng, false) },
      );
      lie = result;
      distance = remaining;
      shotNumber += 1;
      continue;
    }

    // Greenside: chip, pitch or bunker shot.
    if (distance <= 32 && unit === "yards") {
      const fromSand = lie === "greenside_bunker";
      const type: ShotType = fromSand ? "bunker" : distance <= 10 ? "chip" : "pitch";
      const spread = skill.shortGameProximity * (fromSand ? 1.5 : 1) * (lie === "deep_rough" ? 1.3 : 1);
      const proximity = Math.max(0.6, Math.abs(gauss(rng, spread, spread * 0.55)));
      const duffed = rng() < (fromSand ? 0.1 : 0.045);

      if (duffed) {
        const stillOut = Math.max(4, distance * 0.45);
        push(
          b,
          hole,
          shotNumber,
          { lie, distance, unit: "yards" },
          type === "bunker" ? "sw" : clubFor(distance),
          type,
          { lie: fromSand ? "greenside_bunker" : "rough", distance: stillOut, unit: "yards" },
          { miss_direction: "short" },
        );
        distance = stillOut;
        shotNumber += 1;
        continue;
      }

      push(
        b,
        hole,
        shotNumber,
        { lie, distance, unit: "yards" },
        type === "bunker" ? "sw" : distance <= 10 ? "pw" : "sw",
        type,
        { lie: "green", distance: proximity, unit: "feet" },
      );
      lie = "green";
      distance = proximity;
      unit = "feet";
      shotNumber += 1;
      continue;
    }

    // A genuine approach at the green.
    const band = bandOf(distance);
    const hitsGreen = rng() < (skill.greenRate[band] ?? 0.4);
    const club = clubFor(distance);
    const shotType: ShotType = lie === "recovery" ? "recovery" : "approach";

    if (hitsGreen) {
      const proximity = Math.max(
        1.2,
        Math.abs(gauss(rng, distance * skill.proximityFactor, distance * skill.proximityFactor * 0.5)),
      );
      push(
        b,
        hole,
        shotNumber,
        { lie, distance, unit: "yards" },
        club,
        shotType,
        { lie: "green", distance: proximity, unit: "feet" },
        { miss_direction: "straight" },
      );
      lie = "green";
      distance = proximity;
      unit = "feet";
      shotNumber += 1;
      continue;
    }

    const missLie = pick(rng, [
      ["rough", 40],
      ["first_cut", 14],
      ["greenside_bunker", 18],
      ["fringe", 14],
      ["deep_rough", 10],
      ["fairway", 4],
    ] as const);
    const missDistance = Math.max(3, Math.abs(gauss(rng, distance * 0.11 + 8, 6)));
    push(
      b,
      hole,
      shotNumber,
      { lie, distance, unit: "yards" },
      club,
      shotType,
      { lie: missLie, distance: missDistance, unit: "yards" },
      { miss_direction: missFor(rng, band === "150-175") },
    );
    lie = missLie;
    distance = missDistance;
    shotNumber += 1;
  }

  // Putting.
  let puttGuard = 0;
  while (puttGuard++ < 5) {
    const feet = distance;
    if (rng() < makeProbability(feet, skill.puttSkill)) {
      push(
        b,
        hole,
        shotNumber,
        { lie: "green", distance: feet, unit: "feet" },
        "putter",
        "putt",
        { lie: "holed", distance: 0, unit: "feet" },
      );
      return;
    }
    const left = Math.max(0.6, Math.abs(gauss(rng, 1.5 + feet * 0.095, 1.3)));
    push(
      b,
      hole,
      shotNumber,
      { lie: "green", distance: feet, unit: "feet" },
      "putter",
      "putt",
      { lie: "green", distance: left, unit: "feet" },
      { miss_direction: pick(rng, [["short", 3], ["left", 2], ["right", 2], ["long", 1]] as const) },
    );
    distance = left;
    shotNumber += 1;
  }

  // Safety net: hole out rather than loop forever.
  push(
    b,
    hole,
    shotNumber,
    { lie: "green", distance, unit: "feet" },
    "putter",
    "putt",
    { lie: "holed", distance: 0, unit: "feet" },
  );
}

const CONDITION_SETS: Condition[][] = [["calm"], ["breezy"], ["windy", "cold"], ["calm", "hot"], ["wet", "breezy"]];

// ------------------------------------------------------------- assembly

export type DemoData = {
  user: User;
  profile: PlayerProfile;
  handicapHistory: HandicapEntry[];
  courses: Course[];
  rounds: Round[];
  shots: Shot[];
  practiceSessions: PracticeSession[];
  practiceItems: PracticeItem[];
  drillAttempts: DrillAttempt[];
  swingSessions: SwingSession[];
  swingFindings: SwingFinding[];
  swingMeasurements: SwingMeasurement[];
};

export const DEMO_USER_ID = "demo-user-0000-0000-000000000001";

/** Practice trajectories: real recorded results, shaped to tell a coherent story. */
const PRACTICE_TRAJECTORY: Record<string, number[]> = {
  drill_9_ball_contact: [0.56, 0.59, 0.61, 0.59, 0.63, 0.63, 0.67, 0.7, 0.74],
  drill_150_distance_control: [0.42, 0.42, 0.5, 0.5, 0.58, 0.58, 0.67],
  drill_pause_at_top: [0.53, 0.6, 0.6, 0.67, 0.67, 0.73],
  drill_lag_ladder: [0.53, 0.6, 0.6, 0.67, 0.6],
  drill_clock_putting: [0.83, 0.79, 0.88, 0.88],
  drill_chip_circle: [0.4, 0.45, 0.45, 0.5],
  drill_random_approach_challenge: [0.33, 0.42, 0.5],
};

const SESSION_PLAN: { day: number; focus: string; drills: string[]; title: string }[] = [
  { day: 56, focus: "Contact", title: "Range: contact reset", drills: ["drill_9_ball_contact", "drill_lag_ladder"] },
  { day: 51, focus: "Contact", title: "Range: contact + wedges", drills: ["drill_9_ball_contact", "drill_chip_circle"] },
  { day: 46, focus: "Distance control", title: "Mid-iron distance control", drills: ["drill_9_ball_contact", "drill_150_distance_control", "drill_clock_putting"] },
  { day: 40, focus: "Putting", title: "Short game and putting", drills: ["drill_lag_ladder", "drill_clock_putting", "drill_chip_circle"] },
  { day: 33, focus: "Contact", title: "Contact under fatigue", drills: ["drill_9_ball_contact", "drill_150_distance_control"] },
  { day: 27, focus: "Transition", title: "Transition block", drills: ["drill_pause_at_top", "drill_9_ball_contact"] },
  { day: 21, focus: "Transition", title: "Transition + distance", drills: ["drill_pause_at_top", "drill_150_distance_control", "drill_lag_ladder"] },
  { day: 14, focus: "Contact", title: "Contact and face control", drills: ["drill_pause_at_top", "drill_9_ball_contact", "drill_chip_circle"] },
  { day: 9, focus: "Approach", title: "Random approach work", drills: ["drill_9_ball_contact", "drill_150_distance_control", "drill_random_approach_challenge"] },
  { day: 5, focus: "Approach", title: "Random approach + pressure", drills: ["drill_pause_at_top", "drill_150_distance_control", "drill_random_approach_challenge"] },
  { day: 2, focus: "Approach", title: "Transfer test", drills: ["drill_9_ball_contact", "drill_random_approach_challenge", "drill_clock_putting"] },
];

function buildDemoData(today: Date): DemoData {
  const rng = mulberry32(SEED);
  const userId = DEMO_USER_ID;
  const createdAt = new Date(today.getTime() - 120 * 86_400_000).toISOString();

  const user: User = {
    id: userId,
    email: "demo@golfaicoach.app",
    name: "Alex Mercer",
    avatar_url: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  const profile: PlayerProfile = {
    id: "demo_profile",
    user_id: userId,
    display_name: "Alex Mercer",
    handicap_index: 11.8,
    experience_level: "intermediate",
    dominant_hand: "right",
    typical_score: 85,
    average_driver_distance: 252,
    swing_pattern: "draw",
    common_miss: "right",
    primary_goal: "improve_approach",
    secondary_goals: ["break_80", "improve_consistency"],
    practice_days_per_week: 4,
    typical_practice_duration: 45,
    facilities: ["range", "putting_green", "short_game_area", "bunker"],
    bag: [
      "driver", "3_wood", "3_hybrid", "4_iron", "5_iron", "6_iron", "7_iron",
      "8_iron", "9_iron", "pw", "gw", "sw", "lw", "putter",
    ],
    created_at: createdAt,
    updated_at: new Date(today.getTime() - 5 * 86_400_000).toISOString(),
  };

  const handicapHistory: HandicapEntry[] = [
    [180, 13.4],
    [150, 13.1],
    [120, 12.6],
    [90, 12.4],
    [60, 12.2],
    [30, 12.0],
    [7, 11.8],
  ].map(([days, index], i) => ({
    id: `hcp_${i}`,
    user_id: userId,
    recorded_on: daysAgo(days as number, today),
    handicap_index: index as number,
  }));

  // ---- rounds -------------------------------------------------------------
  const roundDays = [86, 72, 58, 45, 31, 20, 12, 4];
  const rounds: Round[] = [];
  const shots: Shot[] = [];
  const counter = { value: 0 };

  roundDays.forEach((day, index) => {
    const course = DEMO_COURSES[index % DEMO_COURSES.length]!;
    const roundId = `round_${index + 1}`;
    const playedOn = daysAgo(day, today);
    const skill = skillForRound(index, roundDays.length);
    const builder: Builder = {
      rng,
      roundId,
      userId,
      createdAt: `${playedOn}T15:00:00.000Z`,
      shots: [],
      counter,
    };

    for (const hole of course.holes) simulateHole(builder, hole, skill);
    shots.push(...builder.shots);

    const strokes = builder.shots.length + builder.shots.reduce((s, x) => s + x.penalty_strokes, 0);
    rounds.push({
      id: roundId,
      user_id: userId,
      course_id: course.id,
      course_name: course.name,
      played_on: playedOn,
      tees: "White",
      holes_played: course.holes.length,
      score: strokes,
      conditions: CONDITION_SETS[index % CONDITION_SETS.length]!,
      notes:
        index === roundDays.length - 1
          ? "Best ball-striking round in a while. Mid irons felt more solid."
          : null,
      status: "complete",
      created_at: `${playedOn}T19:00:00.000Z`,
    });
  });

  // ---- practice -----------------------------------------------------------
  const practiceSessions: PracticeSession[] = [];
  const practiceItems: PracticeItem[] = [];
  const drillAttempts: DrillAttempt[] = [];
  const trajectoryIndex: Record<string, number> = {};

  SESSION_PLAN.forEach((template, index) => {
    const date = daysAgo(template.day, today);
    const sessionId = `practice_${index + 1}`;
    practiceSessions.push({
      id: sessionId,
      user_id: userId,
      title: template.title,
      location: "Meadow Park Range",
      focus: template.focus,
      planned_duration: 45,
      actual_duration: 40 + Math.round(rng() * 20),
      energy_level: 3 + Math.round(rng() * 2),
      status: "complete",
      scheduled_for: date,
      completed_at: `${date}T18:30:00.000Z`,
      reflection:
        index === SESSION_PLAN.length - 1
          ? "Contact felt genuinely different today. Distance control still the weak link."
          : null,
      created_at: `${date}T17:00:00.000Z`,
    });

    template.drills.forEach((drillId, order) => {
      const drill = DRILLS_BY_ID.get(drillId);
      if (!drill) return;
      const trajectory = PRACTICE_TRAJECTORY[drillId] ?? [0.5];
      const step = trajectoryIndex[drillId] ?? 0;
      const score = trajectory[Math.min(step, trajectory.length - 1)]!;
      trajectoryIndex[drillId] = step + 1;

      const itemId = `${sessionId}_item_${order}`;
      practiceItems.push({
        id: itemId,
        session_id: sessionId,
        drill_id: drillId,
        block: order === 0 ? "technical" : order === 1 ? "skill" : "variable",
        order_index: order,
        duration: drill.recommended_duration,
        target_reps: drill.recommended_reps,
        target_value: drill.success_threshold,
        objective: `${drill.metric_to_track} at or above ${Math.round(drill.success_threshold * 100)}%.`,
      });

      const attempts = drill.recommended_reps;
      drillAttempts.push({
        id: `${itemId}_attempt`,
        user_id: userId,
        session_id: sessionId,
        practice_item_id: itemId,
        drill_id: drillId,
        attempts,
        successes: Math.round(score * attempts),
        score,
        raw_value: null,
        notes: null,
        completed_at: `${date}T18:${String(20 + order * 10).padStart(2, "0")}:00.000Z`,
      });
    });
  });

  // ---- swing --------------------------------------------------------------
  const swingDate = daysAgo(24, today);
  const swingSessions: SwingSession[] = [
    {
      id: "swing_1",
      user_id: userId,
      video_url: null,
      camera_angle: "down_the_line",
      club: "7_iron",
      shot_type: "full swing",
      swing_pattern: "draw",
      notes: "Filmed after the range session. Felt like I was rushing from the top.",
      analysis_status: "manual",
      created_at: `${swingDate}T18:00:00.000Z`,
    },
    {
      id: "swing_2",
      user_id: userId,
      video_url: null,
      camera_angle: "face_on",
      club: "driver",
      shot_type: "full swing",
      swing_pattern: "draw",
      notes: null,
      analysis_status: "manual",
      created_at: `${daysAgo(23, today)}T18:00:00.000Z`,
    },
  ];

  const swingFindings: SwingFinding[] = [
    {
      id: "finding_1",
      swing_session_id: "swing_1",
      user_id: userId,
      category: "transition",
      issue: "Club delivery varies between swings",
      severity: "high",
      confidence: 0.82,
      certainty: "likely",
      description:
        "The change of direction looks rushed, with the arms starting down before the lower body has finished shifting. Delivery position differs noticeably between swings in the same session.",
      why_it_matters:
        "An inconsistent delivery makes the face and path relationship different on every swing, which shows up as inconsistent contact and start line.",
      recommended_drill_id: "drill_pause_at_top",
      related_skill: "sequencing",
      source: "manual",
      created_at: `${swingDate}T18:10:00.000Z`,
    },
    {
      id: "finding_2",
      swing_session_id: "swing_1",
      user_id: userId,
      category: "clubface",
      issue: "Face appears open through the delivery position",
      severity: "medium",
      confidence: 0.61,
      certainty: "possible",
      description:
        "From down the line the face looks open relative to the path midway through the downswing, which fits the right-miss pattern recorded on course.",
      why_it_matters:
        "An open face at delivery either produces a right miss or forces a late hand save, and the save is not repeatable under pressure.",
      recommended_drill_id: "drill_gate_face_control",
      related_skill: "face_control",
      source: "manual",
      created_at: `${swingDate}T18:12:00.000Z`,
    },
    {
      id: "finding_3",
      swing_session_id: "swing_1",
      user_id: userId,
      category: "contact",
      issue: "Strike pattern sits toward the toe on mid irons",
      severity: "medium",
      confidence: 0.58,
      certainty: "possible",
      description:
        "Impact tape from the same session showed most strikes toward the toe, consistent with the contact scores recorded in practice.",
      why_it_matters:
        "Toe strikes lose ball speed and turn the face, so distance control suffers even when the swing feels good.",
      recommended_drill_id: "drill_9_ball_contact",
      related_skill: "centered_contact",
      source: "manual",
      created_at: `${swingDate}T18:14:00.000Z`,
    },
    {
      id: "finding_4",
      swing_session_id: "swing_2",
      user_id: userId,
      category: "setup",
      issue: "Ball position drifts back with the driver",
      severity: "low",
      confidence: 0.45,
      certainty: "possible",
      description: "Ball looks closer to centre than to the lead heel on two of the four swings filmed.",
      why_it_matters: "A back ball position with the driver lowers launch and encourages a steeper attack angle.",
      recommended_drill_id: null,
      related_skill: "centered_contact",
      source: "manual",
      created_at: `${daysAgo(23, today)}T18:10:00.000Z`,
    },
  ];

  /*
    Measurements for the down-the-line session. These are hand-entered values
    of the kind a coach reads off a video - the app has no pose estimation, so
    the diagnostic screen labels them as manual, and the numbers are chosen to
    agree with the recorded findings rather than to flatter the player.
  */
  const swingMeasurements: SwingMeasurement[] = [
    ["pelvis_bend_address", "address", 22, 0.7],
    ["chest_bend_address", "address", 34, 0.7],
    ["pelvis_turn_top", "top", 41, 0.6],
    ["chest_turn_top", "top", 86, 0.6],
    ["pelvis_sway_top", "top", 4.2, 0.5],
    ["pelvis_lift_top", "top", 1.1, 0.5],
    ["chest_side_bend_top", "top", 12, 0.6],
    ["pelvis_turn_impact", "impact", 33, 0.6],
    ["chest_turn_impact", "impact", 24, 0.6],
    ["pelvis_sway_impact", "impact", 0.8, 0.5],
    ["pelvis_thrust_impact", "impact", 1.4, 0.5],
    ["head_sway_impact", "impact", -2.9, 0.5],
  ].map(([metric, phase, value, confidence], index) => ({
    id: `measure_${index + 1}`,
    swing_session_id: "swing_1",
    phase: phase as SwingMeasurement["phase"],
    metric: metric as string,
    value: value as number,
    unit: (metric as string).includes("sway") ||
      (metric as string).includes("lift") ||
      (metric as string).includes("thrust")
      ? "in"
      : "deg",
    confidence: confidence as number,
  }));

  return {
    user,
    profile,
    handicapHistory,
    courses: DEMO_COURSES,
    rounds,
    shots,
    practiceSessions,
    practiceItems,
    drillAttempts,
    swingSessions,
    swingFindings,
    swingMeasurements,
  };
}

let cache: { key: string; data: DemoData } | null = null;

/** Memoised per day so the demo is stable within a session but stays recent. */
export function demoData(today: Date = new Date()): DemoData {
  const key = today.toISOString().slice(0, 10);
  if (cache?.key === key) return cache.data;
  cache = { key, data: buildDemoData(today) };
  return cache.data;
}
