import type { Club, DistanceBandId, Lie, SGCategory, ShotType } from "./golf";
import type { Skill } from "./practice";

export type SGSummary = {
  total: number;
  per_round: number;
  rounds: number;
  shots: number;
  by_category: Record<SGCategory, CategorySG>;
};

export type CategorySG = {
  category: SGCategory;
  total: number;
  per_round: number;
  shots: number;
};

export type SegmentKind =
  | "category"
  | "approach_distance"
  | "club"
  | "lie"
  | "shot_type"
  | "putt_distance"
  | "hole_par";

export type Segment = {
  kind: SegmentKind;
  key: string;
  label: string;
  category: SGCategory;
  shots: number;
  rounds: number;
  total_sg: number;
  sg_per_shot: number;
  sg_per_round: number;
  /** Mean per-shot SG over the recent half of the sample minus the earlier half. */
  trend: number | null;
  /** Standard deviation of per-shot SG. A consistency proxy. */
  volatility: number;
};

export type TrendPoint = {
  date: string;
  label: string;
  value: number;
};

export type Weakness = {
  id: string;
  kind: SegmentKind;
  key: string;
  title: string;
  category: SGCategory;
  severity: "watch" | "moderate" | "significant" | "critical";
  /** 0-1. Driven by sample size, consistency and cross-system corroboration. */
  confidence: number;
  sample_size: number;
  sufficient_sample: boolean;
  strokes_lost_per_round: number;
  strokes_lost_total: number;
  trend: number | null;
  trend_label: "improving" | "flat" | "declining" | "insufficient_data";
  priority: number;
  trainability: number;
  goal_relevance: number;
  recommended_action: string;
  /** Corroborating evidence pulled from the other systems. */
  evidence: Evidence[];
  related_skills: Skill[];
};

export type Evidence = {
  source: "course" | "practice" | "swing" | "profile";
  statement: string;
  /** Raw value behind the statement, so the UI never shows an unbacked claim. */
  value: number | null;
  unit: string | null;
  sample_size: number | null;
};

export type PracticeMetricTrend = {
  skill: Skill;
  drill_id: string;
  drill_name: string;
  metric: string;
  unit: string;
  points: TrendPoint[];
  latest: number | null;
  baseline: number | null;
  target: number;
  delta: number | null;
  meeting_target: boolean;
  sessions: number;
};

export type DispersionPoint = {
  club: Club;
  shot_type: ShotType;
  lie: Lie;
  distance: number;
  band: DistanceBandId;
  lateral: "left" | "center" | "right" | null;
  strokes_gained: number;
};

export type StatsFilters = {
  from?: string;
  to?: string;
  clubs?: Club[];
  lies?: Lie[];
  shotTypes?: ShotType[];
  categories?: SGCategory[];
  minDistance?: number;
  maxDistance?: number;
};

export type RoundSummaryStats = {
  round_id: string;
  course_name: string;
  played_on: string;
  score: number | null;
  to_par: number | null;
  holes_played: number;
  sg_total: number;
  sg_by_category: Record<SGCategory, number>;
  fairways_hit: number;
  fairway_opportunities: number;
  greens_in_regulation: number;
  putts: number;
  penalties: number;
  up_and_downs: number;
  up_and_down_opportunities: number;
  sand_saves: number;
  sand_save_opportunities: number;
  best_hole: { hole_number: number; strokes_gained: number } | null;
  worst_hole: { hole_number: number; strokes_gained: number } | null;
};
