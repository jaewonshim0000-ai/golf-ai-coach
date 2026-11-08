import type { PoseModel } from "../golf/pose";
import { rankPriorities, scoreSwing, swingScoreChecks } from "../golf/swing-score";
import { focusIssue, type SwingFocusId } from "../golf/swing-focus";
import { DRILLS_BY_ID } from "../seed/drills";
import type { Drill } from "../../types/practice";
import { reviewSwing } from "./review";

/** Library drills that train each check, best first. */
const DRILLS_FOR: Record<SwingFocusId, string[]> = {
  head: ["drill_half_swing_contact", "drill_eyes_closed_tempo", "drill_9_ball_contact"],
  height: ["drill_pause_at_top", "drill_half_swing_contact", "drill_towel_gate_contact"],
  posture: ["drill_pump_transition", "drill_half_swing_contact", "drill_towel_gate_contact"],
  hip_depth: ["drill_pump_transition", "drill_step_change_direction", "drill_half_swing_contact"],
  tempo: ["drill_three_to_one_tempo", "drill_pause_at_top", "drill_eyes_closed_tempo"],
};

export type SwingResult = {
  /** Out of 100: the weighted swing checks. Null with a reason when too little was measured. */
  score: number | null;
  reason: string | null;
  /** The checks the score is made of. */
  checks: string[];
  /** Up to three, the largest weighted deduction first. Empty when no check is below 85 across its whole range. */
  weaknesses: { id: string; issue: string; evidence: string }[];
  drills: Drill[];
};

/** What a player sees after an analysis: one score, the weakness, and library drills for it. */
export function swingResult(model: PoseModel): SwingResult {
  const { report, blocks } = reviewSwing(model);
  const score = scoreSwing(report, model.ballSide);
  // Checks outside the score's quality gate still point to a supported weakness.
  const checks = blocks.length ? [] : swingScoreChecks(report, model.ballSide).components;
  const weak = rankPriorities(checks);
  // A clean swing still gets drills: those for its lowest check.
  const targets = weak.length ? weak : [...checks].sort((a, b) => a.score - b.score).slice(0, 1);
  const ids = [0, 1, 2].flatMap((rank) => targets.map((check) => DRILLS_FOR[check.id as SwingFocusId]?.[rank]));
  return {
    score: blocks.length ? null : score.total,
    reason: blocks[0] ?? score.reason,
    checks: checks.map((check) => check.label),
    weaknesses: weak.map((check) => ({ id: check.id, issue: focusIssue(check, report), evidence: check.evidence })),
    drills: [...new Set(ids)].flatMap((id) => (id && DRILLS_BY_ID.get(id)) || []).slice(0, 3),
  };
}
