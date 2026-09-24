import { z } from "zod";

import {
  CLUBS,
  CONDITIONS,
  DOMINANT_HANDS,
  EXPERIENCE_LEVELS,
  LIES,
  MISS_DIRECTIONS,
  PENALTY_TYPES,
  SHOT_TYPES,
  SWING_PATTERNS,
} from "../../types/golf";
import { GOALS, PRACTICE_FACILITIES } from "../../types/player";
import { CERTAINTY_LEVELS, SWING_CATEGORIES, SKILLS } from "../../types/practice";
import { PRACTICE_GOALS, type GoalId } from "../practice/goals";
import { PLAN_LENGTHS, type PlanLength } from "../practice/plan";

/** Input validation at the trust boundary. Every server action parses through here. */

const optionalNumber = (schema: z.ZodNumber) =>
  z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
    schema.optional(),
  );

export const profileSchema = z.object({
  display_name: z.string().trim().min(1, "Name is required").max(80),
  handicap_index: optionalNumber(z.number().min(-10).max(54)),
  experience_level: z.enum(EXPERIENCE_LEVELS),
  dominant_hand: z.enum(DOMINANT_HANDS),
  typical_score: optionalNumber(z.number().int().min(50).max(200)),
  average_driver_distance: optionalNumber(z.number().int().min(80).max(400)),
  swing_pattern: z.enum(SWING_PATTERNS),
  common_miss: z.enum(MISS_DIRECTIONS).optional(),
  primary_goal: z.enum(GOALS),
  secondary_goals: z.array(z.enum(GOALS)).max(4).default([]),
  practice_days_per_week: z.coerce.number().int().min(0).max(7),
  typical_practice_duration: z.coerce.number().int().min(10).max(240),
  facilities: z.array(z.enum(PRACTICE_FACILITIES)).default([]),
  bag: z.array(z.enum(CLUBS)).default([]),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export const roundSchema = z.object({
  course_id: z.string().min(1, "Pick a course"),
  played_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  tees: z.string().trim().max(40).optional(),
  conditions: z.array(z.enum(CONDITIONS)).default([]),
  notes: z.string().trim().max(1000).optional(),
});
export type RoundInput = z.infer<typeof roundSchema>;

export const shotSchema = z
  .object({
    round_id: z.string().min(1),
    hole_number: z.coerce.number().int().min(1).max(18),
    hole_par: z.coerce.number().int().min(3).max(6),
    shot_number: z.coerce.number().int().min(1).max(20),
    starting_location: z.enum(LIES),
    starting_distance: z.coerce.number().min(0).max(700),
    starting_unit: z.enum(["yards", "feet"]),
    club: z.enum(CLUBS).nullable().default(null),
    shot_type: z.enum(SHOT_TYPES),
    ending_location: z.enum(LIES),
    ending_distance: z.coerce.number().min(0).max(700),
    ending_unit: z.enum(["yards", "feet"]),
    penalty_strokes: z.coerce.number().int().min(0).max(3).default(0),
    penalty_type: z.enum(PENALTY_TYPES).default("none"),
    miss_direction: z.enum(MISS_DIRECTIONS).nullable().default(null),
    notes: z.string().trim().max(500).nullable().default(null),
  })
  .refine((shot) => shot.ending_location !== "holed" || shot.ending_distance === 0, {
    message: "A holed shot finishes at zero distance",
    path: ["ending_distance"],
  })
  .refine(
    (shot) =>
      shot.starting_location !== "green" ||
      shot.ending_location === "holed" ||
      shot.ending_location === "green",
    { message: "A putt has to finish on the green or in the hole", path: ["ending_location"] },
  )
  .refine(
    (shot) =>
      !(shot.ending_location === "out_of_bounds" || shot.ending_location === "hazard") ||
      shot.penalty_strokes >= 1,
    { message: "A ball out of bounds or in a hazard costs at least one penalty stroke", path: ["penalty_strokes"] },
  );
export type ShotInput = z.infer<typeof shotSchema>;

export const courseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  city: z.string().trim().max(80).optional(),
  pars: z.array(z.coerce.number().int().min(3).max(6)).refine((values) => values.length === 9 || values.length === 18, "Choose 9 or 18 holes"),
  yards: z.array(z.coerce.number().int().min(60).max(700)).refine((values) => values.length === 9 || values.length === 18, "Choose 9 or 18 holes"),
}).refine((course) => course.pars.length === course.yards.length, {
  message: "Par and yardage must be entered for every hole",
  path: ["yards"],
});
export type CourseInput = z.infer<typeof courseSchema>;

/** One hole of a live scorecard, saved as it is played. */
export const holeSchema = z
  .object({
    round_id: z.string().min(1).max(80),
    hole_number: z.coerce.number().int().min(1).max(18),
    score: z.coerce.number().int().min(1).max(20),
    putts: z.coerce.number().int().min(0).max(10).nullable(),
    fairway: z.enum(["hit", "left", "right"]).nullable(),
    penalties: z.coerce.number().int().min(0).max(10),
  })
  // Penalties are strokes you did not swing, and every putt is one you did.
  .refine((hole) => hole.penalties < hole.score, { message: "More penalties than strokes", path: ["penalties"] })
  .refine((hole) => hole.putts === null || hole.putts <= hole.score - hole.penalties, {
    message: "More putts than strokes",
    path: ["putts"],
  });
export type HoleInput = z.infer<typeof holeSchema>;

export const practiceSessionSchema = z.object({
  minutes: z.coerce.number().refine((value): value is PlanLength => (PLAN_LENGTHS as readonly number[]).includes(value), "Choose 15, 30 or 60 minutes"),
  goal: z.enum(PRACTICE_GOALS.map((goal) => goal.id) as [GoalId, ...GoalId[]]),
  location: z.string().trim().max(90).optional(),
  energy_level: z.coerce.number().int().min(1).max(5).optional(),
  scheduled_for: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type PracticeSessionInput = z.infer<typeof practiceSessionSchema>;

export const drillAttemptSchema = z
  .object({
    session_id: z.string().min(1),
    practice_item_id: z.string().nullable().default(null),
    drill_id: z.string().min(1),
    attempts: z.coerce.number().int().min(1).max(500),
    successes: z.coerce.number().int().min(0).max(500),
    shot_offsets: z.array(z.number().finite().min(-300).max(300)).max(40).nullable().default(null),
    shot_points: z
      .array(z.tuple([z.number().finite().min(-300).max(300), z.number().finite().min(-300).max(300)]))
      .max(40)
      .nullable()
      .default(null),
    notes: z.string().trim().max(500).nullable().default(null),
  })
  .refine((a) => a.successes <= a.attempts, {
    message: "Successes cannot exceed attempts",
    path: ["successes"],
  });
export type DrillAttemptInput = z.infer<typeof drillAttemptSchema>;

export const swingSessionSchema = z.object({
  club: z.enum(CLUBS),
  camera_angle: z.enum(["face_on", "down_the_line", "rear", "overhead"]),
  shot_type: z.string().trim().min(2).max(40),
  swing_pattern: z.enum(SWING_PATTERNS),
  video_url: z.string().trim().url().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional(),
});
export type SwingSessionInput = z.infer<typeof swingSessionSchema>;

export const swingFindingSchema = z.object({
  swing_session_id: z.string().min(1),
  category: z.enum(SWING_CATEGORIES),
  issue: z.string().trim().min(4).max(200),
  severity: z.enum(["low", "medium", "high"]),
  confidence: z.coerce.number().min(0).max(1),
  certainty: z.enum(CERTAINTY_LEVELS),
  description: z.string().trim().max(1000).default(""),
  why_it_matters: z.string().trim().max(1000).default(""),
  related_skill: z.enum(SKILLS).nullable().default(null),
  recommended_drill_id: z.string().nullable().default(null),
});
export type SwingFindingInput = z.infer<typeof swingFindingSchema>;


/** Turns a Zod error into the flat map the forms render. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

/** A swing measurement typed in by a person, so every field is bounded. */
export const measurementSchema = z.object({
  swing_session_id: z.string().min(1),
  metric: z.string().min(1).max(60),
  value: z.coerce.number().finite().min(-90).max(180),
  confidence: z.coerce.number().min(0).max(1).default(0.6),
});

/**
 * A 3D swing model sent up from the browser. Detector output in metres around
 * the hips, so anything outside a few metres is not a body; the frame count
 * matches what the pose runner samples, with room to spare.
 */
const coordinate = z.number().finite().min(-5).max(5);
export const poseModelSchema = z
  .object({
    swing_session_id: z.string().min(1).max(80),
    t: z.array(z.number().finite().min(0).max(3600)).min(3).max(64),
    frames: z
      .array(z.array(z.tuple([coordinate, coordinate, coordinate, z.number().min(0).max(1)])).length(33))
      .min(3)
      .max(64),
  })
  .refine((model) => model.t.length === model.frames.length, "One time per frame.");
