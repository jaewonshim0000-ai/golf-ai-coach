import type { SwingPattern } from "../../types/golf";
import type {
  Certainty,
  SwingFinding,
  SwingMeasurement,
  SwingSession,
} from "../../types/practice";
import { DRILLS, DRILLS_BY_ID } from "../seed/drills";
import { referenceFor } from "../seed/reference-swings";
import { COACH_SYSTEM_PROMPT, getProvider, type AIResult } from "./provider";
import { swingAnalysisSchema, type SwingAnalysisOutput } from "./schemas";

/**
 * Swing analysis.
 *
 * V1 reasons over findings a human recorded. The interface below is the seam
 * for a future vision pipeline: anything that can produce SwingMeasurement
 * rows can be plugged in without touching the coaching layer.
 */

export interface SwingFeatureExtractor {
  readonly id: string;
  /** Returns structured measurements for a swing video. */
  extract(session: SwingSession): Promise<SwingMeasurement[]>;
}

/**
 * The only extractor in V1: there isn't one. It is explicit rather than a
 * silently-empty implementation, so the UI can say so honestly.
 *
 * The future pipeline is: frame extraction -> pose detection -> club detection
 * -> phase segmentation -> measurements -> this same analyze() call.
 */
export class NoVisionExtractor implements SwingFeatureExtractor {
  readonly id = "none";
  async extract(): Promise<SwingMeasurement[]> {
    return [];
  }
}

let extractor: SwingFeatureExtractor = new NoVisionExtractor();

export function setFeatureExtractor(next: SwingFeatureExtractor): void {
  extractor = next;
}

export function visionAvailable(): boolean {
  return extractor.id !== "none";
}

export async function extractMeasurements(session: SwingSession): Promise<SwingMeasurement[]> {
  return extractor.extract(session);
}

const CATEGORY_DRILL: Record<string, string> = {
  transition: "drill_pause_at_top",
  sequencing: "drill_step_change_direction",
  clubface: "drill_gate_face_control",
  club_path: "drill_headcover_path",
  contact: "drill_9_ball_contact",
  impact: "drill_towel_gate_contact",
  tempo: "drill_three_to_one_tempo",
  balance: "drill_eyes_closed_tempo",
  takeaway: "drill_toe_up_path",
  setup: "drill_toe_up_path",
  backswing: "drill_pump_transition",
  downswing: "drill_pump_transition",
  follow_through: "drill_eyes_closed_tempo",
};

export function drillForFinding(finding: SwingFinding): string | null {
  if (finding.recommended_drill_id && DRILLS_BY_ID.has(finding.recommended_drill_id)) {
    return finding.recommended_drill_id;
  }
  const bySkill = finding.related_skill
    ? DRILLS.find((d) => d.skill_trained === finding.related_skill)
    : undefined;
  return CATEGORY_DRILL[finding.category] ?? bySkill?.id ?? null;
}

const SEVERITY_WEIGHT = { high: 1, medium: 0.65, low: 0.35 } as const;

export async function analyzeSwingSession(
  session: SwingSession,
  findings: SwingFinding[],
  measurements: SwingMeasurement[] = [],
): Promise<AIResult<SwingAnalysisOutput>> {
  const provider = getProvider();
  const reference = referenceFor(session.swing_pattern);

  return provider.generate({
    name: "swing_analysis",
    system: COACH_SYSTEM_PROMPT,
    maxTokens: 1500,
    prompt: `Interpret this swing session. You must not produce a list of every flaw - name at most three priorities, ranked.

SESSION: ${JSON.stringify({ club: session.club, angle: session.camera_angle, pattern: session.swing_pattern, notes: session.notes })}

RECORDED FINDINGS (manual observations, not machine measurements):
${JSON.stringify(findings.map((f) => ({ category: f.category, issue: f.issue, severity: f.severity, confidence: f.confidence, certainty: f.certainty, description: f.description })), null, 1)}

MEASUREMENTS (empty means no vision pipeline has run - say so rather than implying you measured anything):
${JSON.stringify(measurements, null, 1)}

REFERENCE PATTERN for a ${session.swing_pattern} player: ${JSON.stringify(reference)}
The reference is an example of the pattern, not a template to copy. Do not produce a similarity percentage.

Available drill ids: ${DRILLS.map((d) => d.id).join(", ")}

Return JSON matching:
{ "pattern_summary": string, "priorities": [{ "rank": number, "category": string, "issue": string, "certainty": "observed"|"likely"|"possible"|"uncertain", "confidence": number, "what_we_see": string, "why_it_matters": string, "drill_id": string|null, "priority": "low"|"medium"|"high" }], "reference_note": string }`,
    schema: swingAnalysisSchema,
    fallback: () => ruleBasedSwingAnalysis(session, findings, measurements),
  });
}

export function ruleBasedSwingAnalysis(
  session: SwingSession,
  findings: SwingFinding[],
  measurements: SwingMeasurement[],
): SwingAnalysisOutput {
  const reference = referenceFor(session.swing_pattern);

  if (findings.length === 0) {
    return {
      pattern_summary: `No findings recorded for this ${session.swing_pattern} swing yet. ${measurements.length === 0 ? "No automated measurements exist either - nothing has been measured, only uploaded." : ""}`,
      priorities: [],
      reference_note: referenceNote(session.swing_pattern, reference.name),
    };
  }

  const ranked = [...findings]
    .sort(
      (a, b) =>
        SEVERITY_WEIGHT[b.severity] * b.confidence - SEVERITY_WEIGHT[a.severity] * a.confidence,
    )
    .slice(0, 3);

  return {
    pattern_summary: `A ${session.swing_pattern} pattern with ${session.club.replace(/_/g, " ")}, recorded ${session.camera_angle.replace(/_/g, " ")}. ${findings.length} finding${findings.length === 1 ? "" : "s"} on file, ${ranked.length} prioritised below. ${measurements.length === 0 ? "These are human observations, not measurements - treat the confidence numbers accordingly." : `${measurements.length} automated measurements available.`}`,
    priorities: ranked.map((finding, index) => ({
      rank: index + 1,
      category: finding.category,
      issue: finding.issue,
      certainty: finding.certainty as Certainty,
      confidence: finding.confidence,
      what_we_see: finding.description || finding.issue,
      why_it_matters:
        finding.why_it_matters ||
        "May contribute to inconsistent face and path relationships, and therefore to inconsistent contact.",
      drill_id: drillForFinding(finding),
      priority: finding.severity,
    })),
    reference_note: referenceNote(session.swing_pattern, reference.name),
  };
}

function referenceNote(pattern: SwingPattern, referenceName: string): string {
  if (pattern === "unknown") {
    return "No established ball-flight pattern on file yet, so no reference model has been matched. Record a few more swings and a pattern usually becomes clear.";
  }
  return `${referenceName} is used here as an example of a ${pattern} pattern - useful for understanding how that shape is produced, not as a swing to copy. Your build, mobility and speed all change what the same pattern should look like for you.`;
}
