import type {
  Club,
  DominantHand,
  ExperienceLevel,
  MissDirection,
  SwingPattern,
} from "./golf";

export type User = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export const PRACTICE_FACILITIES = [
  "range",
  "putting_green",
  "short_game_area",
  "bunker",
  "simulator",
  "home_net",
] as const;
export type PracticeFacility = (typeof PRACTICE_FACILITIES)[number];

export const GOALS = [
  "break_100",
  "break_90",
  "break_80",
  "break_par",
  "lower_handicap",
  "improve_consistency",
  "improve_driving",
  "improve_approach",
  "improve_short_game",
  "improve_putting",
  "tournament_prep",
] as const;
export type Goal = (typeof GOALS)[number];

export const GOAL_LABELS: Record<Goal, string> = {
  break_100: "Break 100",
  break_90: "Break 90",
  break_80: "Break 80",
  break_par: "Break par",
  lower_handicap: "Lower my handicap",
  improve_consistency: "Improve consistency",
  improve_driving: "Improve driving",
  improve_approach: "Improve approach play",
  improve_short_game: "Improve short game",
  improve_putting: "Improve putting",
  tournament_prep: "Tournament preparation",
};

export type PlayerProfile = {
  id: string;
  user_id: string;
  display_name: string;
  handicap_index: number | null;
  experience_level: ExperienceLevel;
  dominant_hand: DominantHand;
  typical_score: number | null;
  average_driver_distance: number | null;
  swing_pattern: SwingPattern;
  common_miss: MissDirection | null;
  primary_goal: Goal;
  secondary_goals: Goal[];
  practice_days_per_week: number;
  typical_practice_duration: number;
  facilities: PracticeFacility[];
  bag: Club[];
  created_at: string;
  updated_at: string;
};

/** Historical handicap snapshots — drives the handicap trend chart. */
export type HandicapEntry = {
  id: string;
  user_id: string;
  recorded_on: string;
  handicap_index: number;
};
