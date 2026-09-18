import type { Club, SwingPattern } from "./golf";

export const DRILL_CATEGORIES = [
  "full_swing",
  "driver",
  "woods",
  "long_irons",
  "mid_irons",
  "short_irons",
  "wedges",
  "pitching",
  "chipping",
  "bunker",
  "putting",
  "contact",
  "distance_control",
  "face_control",
  "club_path",
  "tempo",
  "transition",
  "approach",
  "random_practice",
  "pressure_practice",
  "course_simulation",
] as const;
export type DrillCategory = (typeof DRILL_CATEGORIES)[number];

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const SCORING_METHODS = ["ratio", "count", "percentage", "average_distance", "streak"] as const;
export type ScoringMethod = (typeof SCORING_METHODS)[number];

/** The skill a drill trains. This is the join key between practice data and weaknesses. */
export const SKILLS = [
  "centered_contact",
  "face_control",
  "club_path",
  "start_line",
  "distance_control",
  "trajectory_control",
  "tempo",
  "sequencing",
  "strike_quality",
  "green_reading",
  "speed_control",
  "short_putt_conversion",
  "lag_putting",
  "bunker_technique",
  "chipping_proximity",
  "pitching_proximity",
  "shot_shaping",
  "pressure_performance",
  "course_management",
] as const;
export type Skill = (typeof SKILLS)[number];

export type Drill = {
  id: string;
  name: string;
  category: DrillCategory;
  sub_category: string | null;
  description: string;
  instructions: string[];
  skill_trained: Skill;
  difficulty: Difficulty;
  recommended_duration: number;
  recommended_reps: number;
  equipment_required: string[];
  clubs: Club[];
  metric_to_track: string;
  metric_unit: string;
  scoring_method: ScoringMethod;
  /** Target value on the drill metric that counts as meeting the standard (0-1 normalised). */
  success_threshold: number;
  progression_level: string | null;
  regression_level: string | null;
};

export const PRACTICE_BLOCKS = [
  "warm_up",
  "technical",
  "skill",
  "variable",
  "pressure",
  "reflection",
] as const;
export type PracticeBlock = (typeof PRACTICE_BLOCKS)[number];

export const PRACTICE_BLOCK_LABELS: Record<PracticeBlock, string> = {
  warm_up: "Warm-up",
  technical: "Technical block",
  skill: "Skill block",
  variable: "Variable / random practice",
  pressure: "Pressure block",
  reflection: "Reflection",
};

export type PracticeSession = {
  id: string;
  user_id: string;
  title: string;
  location: string | null;
  focus: string;
  planned_duration: number;
  actual_duration: number | null;
  energy_level: number | null;
  status: "planned" | "in_progress" | "complete";
  scheduled_for: string;
  completed_at: string | null;
  reflection: string | null;
  created_at: string;
};

export type PracticeItem = {
  id: string;
  session_id: string;
  drill_id: string;
  block: PracticeBlock;
  order_index: number;
  duration: number;
  target_reps: number;
  /** Target on the drill metric for this session specifically. */
  target_value: number;
  objective: string;
};

export type DrillAttempt = {
  id: string;
  user_id: string;
  session_id: string;
  practice_item_id: string | null;
  drill_id: string;
  attempts: number;
  successes: number;
  /** Normalised 0-1 result on the drill metric. */
  score: number;
  raw_value: number | null;
  notes: string | null;
  completed_at: string;
};

export type SwingSession = {
  id: string;
  user_id: string;
  video_url: string | null;
  camera_angle: "face_on" | "down_the_line" | "rear" | "overhead";
  club: Club;
  shot_type: string;
  swing_pattern: SwingPattern;
  notes: string | null;
  analysis_status: "manual" | "queued" | "processed" | "failed";
  created_at: string;
};

export const SWING_CATEGORIES = [
  "setup",
  "takeaway",
  "backswing",
  "transition",
  "downswing",
  "impact",
  "follow_through",
  "clubface",
  "club_path",
  "sequencing",
  "tempo",
  "balance",
  "contact",
] as const;
export type SwingCategory = (typeof SWING_CATEGORIES)[number];

export const CERTAINTY_LEVELS = ["observed", "likely", "possible", "uncertain"] as const;
export type Certainty = (typeof CERTAINTY_LEVELS)[number];

export type SwingFinding = {
  id: string;
  swing_session_id: string;
  user_id: string;
  category: SwingCategory;
  issue: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  certainty: Certainty;
  description: string;
  why_it_matters: string;
  recommended_drill_id: string | null;
  related_skill: Skill | null;
  source: "manual" | "ai" | "vision";
  created_at: string;
};

export type ReferenceSwing = {
  id: string;
  name: string;
  year: number | null;
  pattern: SwingPattern;
  summary: string;
  useful_similarities: string[];
  potential_differences: string[];
  /** Structured movement features. Populated by CV later, hand-authored today. */
  features: Record<string, string>;
};

/**
 * Structured measurements a future vision pipeline will write.
 * Nothing produces these in V1 - the table and type exist so the pipeline
 * can be added without touching the coaching layer.
 */
export type SwingMeasurement = {
  id: string;
  swing_session_id: string;
  phase:
    | "address"
    | "takeaway"
    | "top"
    | "transition"
    | "downswing"
    | "impact"
    | "follow_through";
  metric: string;
  value: number;
  unit: string;
  confidence: number;
};
