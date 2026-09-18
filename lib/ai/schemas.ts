import { z } from "zod";

import { PRACTICE_BLOCKS } from "../../types/practice";
import { CERTAINTY_LEVELS, SWING_CATEGORIES } from "../../types/practice";

/**
 * Structured AI output contracts. Nothing reaches the UI without passing
 * through one of these, so a malformed model reply degrades to the rule-based
 * coach rather than rendering broken text.
 */

export const evidenceSchema = z.object({
  source: z.enum(["course", "practice", "swing", "profile"]),
  statement: z.string().min(5).max(400),
});

export const priorityRefSchema = z.object({
  /** Must match a Weakness.id we supplied. Validated again by the caller. */
  weakness_id: z.string().min(1),
  title: z.string().min(3).max(120),
  confidence: z.number().min(0).max(1),
  certainty: z.enum(CERTAINTY_LEVELS),
  strokes_lost_per_round: z.number(),
  reasoning: z.array(z.string().min(5).max(400)).min(1).max(5),
  evidence: z.array(evidenceSchema).max(6).default([]),
});

export const coachingInsightSchema = z.object({
  headline: z.string().min(10).max(160),
  primary_priority: priorityRefSchema,
  secondary_priorities: z.array(priorityRefSchema).max(2).default([]),
  cross_system_connection: z.string().min(10).max(900),
  training_recommendation: z.string().min(10).max(600),
  player_message: z.string().min(10).max(900),
  data_caveats: z.array(z.string().min(5).max(300)).max(4).default([]),
});
export type CoachingInsight = z.infer<typeof coachingInsightSchema>;




export const roundSummarySchema = z.object({
  headline: z.string().min(5).max(160),
  what_went_well: z.array(z.string().min(5).max(300)).max(3).default([]),
  what_cost_you: z.array(z.string().min(5).max(300)).max(3).default([]),
  takeaway: z.string().min(10).max(600),
});
export type RoundSummaryOutput = z.infer<typeof roundSummarySchema>;

export const practiceSummarySchema = z.object({
  headline: z.string().min(5).max(160),
  results: z.array(z.string().min(5).max(300)).max(5).default([]),
  verdict: z.enum(["improving", "holding", "not_transferring", "insufficient_data"]),
  next_step: z.string().min(10).max(500),
});
export type PracticeSummaryOutput = z.infer<typeof practiceSummarySchema>;

export const trendAnalysisSchema = z.object({
  headline: z.string().min(5).max(160),
  direction: z.enum(["improving", "flat", "declining", "insufficient_data"]),
  observations: z.array(z.string().min(5).max(300)).max(5).default([]),
  what_to_do: z.string().min(10).max(500),
});
export type TrendAnalysisOutput = z.infer<typeof trendAnalysisSchema>;

export const swingAnalysisSchema = z.object({
  pattern_summary: z.string().min(10).max(600),
  priorities: z
    .array(
      z.object({
        rank: z.number().int().min(1).max(3),
        category: z.enum(SWING_CATEGORIES),
        issue: z.string().min(5).max(200),
        certainty: z.enum(CERTAINTY_LEVELS),
        confidence: z.number().min(0).max(1),
        what_we_see: z.string().min(10).max(500),
        why_it_matters: z.string().min(10).max(500),
        drill_id: z.string().nullable(),
        priority: z.enum(["low", "medium", "high"]),
      }),
    )
    .max(3),
  reference_note: z.string().max(600).default(""),
});
export type SwingAnalysisOutput = z.infer<typeof swingAnalysisSchema>;

/**
 * The find-it agent. `result_ids` must name entries the retriever already
 * found; the caller drops any that do not, so an invented id costs a link,
 * never a wrong number.
 */
export const askAnswerSchema = z.object({
  answer: z.string().min(5).max(600),
  result_ids: z.array(z.string().min(1)).min(1).max(6),
  follow_up: z.array(z.string().min(3).max(90)).max(3).default([]),
});
export type AskAnswer = z.infer<typeof askAnswerSchema>;
