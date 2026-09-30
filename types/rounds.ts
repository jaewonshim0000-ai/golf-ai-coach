import type {
  Club,
  Condition,
  Lie,
  MissDirection,
  PenaltyType,
  RoundType,
  SGCategory,
  ShotType,
} from "./golf";

export type Course = {
  id: string;
  user_id: string | null;
  name: string;
  city: string | null;
  par: number;
  holes: HoleSpec[];
  created_at: string;
};

export type HoleSpec = {
  hole_number: number;
  par: number;
  yards: number;
  handicap_index?: number;
};

export type Round = {
  id: string;
  user_id: string;
  course_id: string;
  course_name: string;
  played_on: string;
  tees: string | null;
  /** Null on rounds logged before the type was asked. */
  round_type?: RoundType | null;
  holes_played: number;
  score: number | null;
  /** Hole totals for a fast score-only round. Shot-tracked rounds leave this null. */
  hole_scores?: number[] | null;
  /** The live scorecard, one entry per hole, null until the hole is played. */
  hole_stats?: (HoleStat | null)[] | null;
  conditions: Condition[];
  notes: string | null;
  status: "in_progress" | "complete";
  created_at: string;
};

export type HoleStat = {
  score: number;
  /** Null when the player did not count them. */
  putts: number | null;
  /** Tee shot on a par 4 or 5. Null on a par 3 or when not recorded. */
  fairway: "hit" | "left" | "right" | null;
  penalties: number;
};

export type Shot = {
  id: string;
  round_id: string;
  user_id: string;
  hole_number: number;
  hole_par: number;
  shot_number: number;
  starting_location: Lie;
  /** Distance remaining to the hole before the shot. Yards, except putts (feet). */
  starting_distance: number;
  starting_unit: "yards" | "feet";
  lie: Lie;
  club: Club | null;
  shot_type: ShotType;
  intended_target: string | null;
  ending_location: Lie;
  ending_distance: number;
  ending_unit: "yards" | "feet";
  penalty_strokes: number;
  penalty_type: PenaltyType;
  miss_direction: MissDirection | null;
  notes: string | null;
  created_at: string;
};

/** A shot with its computed strokes-gained figures attached. */
export type ScoredShot = Shot & {
  expected_before: number;
  expected_after: number;
  strokes_gained: number;
  sg_category: SGCategory;
};

export type HoleResult = {
  hole_number: number;
  par: number;
  strokes: number;
  penalties: number;
  score_to_par: number;
  shots: ScoredShot[];
  strokes_gained: number;
  fairway_hit: boolean | null;
  green_in_regulation: boolean;
  putts: number;
  up_and_down: boolean | null;
  sand_save: boolean | null;
};
