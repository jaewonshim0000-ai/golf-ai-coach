import { z } from "zod";

import { CLUB_LABELS, labelize } from "../../types/golf";
import type { Skill, SwingFinding, SwingMeasurement, SwingSession } from "../../types/practice";
import { CERTAINTY_LEVELS, SKILLS, SWING_CATEGORIES } from "../../types/practice";
import { DRILLS_BY_ID } from "../seed/drills";
import { METRICS_BY_ID, SWING_METRICS } from "../golf/swing-metrics";
import { getProvider, type AIResult } from "./provider";

/**
 * Reading a swing from video frames.
 *
 * This is estimation, not measurement. A model looking at six JPEGs from a
 * phone camera can see that the pelvis has slid toward the target; it cannot
 * know by how many inches the way a 3D capture rig does. Everything here
 * exists to keep that distinction intact rather than to hide it:
 *
 * - every value is stored with `source: "vision"` and a confidence capped at
 *   0.6, which the database also enforces;
 * - a metric the model was not asked about, or invents, is dropped rather than
 *   renamed into something close;
 * - a value far outside its reference band is dropped as a misread rather than
 *   clamped to the edge, because a clamped number reads as a real one;
 * - the model is told to omit anything it cannot see, and omission is the
 *   expected answer for half the metrics on any given camera angle.
 *
 * The player can overwrite any of it by hand, which promotes the value to
 * `manual` and is the only way a number in this app becomes a measurement.
 */

/** Frames sampled across the clip. Enough to catch the top and impact. */
export const FRAME_COUNT = 6;

/** A model estimating from 2D frames is never more certain than this. */
export const VISION_CONFIDENCE_CAP = 0.6;

/**
 * How far outside its own band a value may sit before it reads as a misread
 * rather than a fault. Three band widths is a bad swing; ten is a parse error.
 */
const PLAUSIBLE_BAND_MULTIPLE = 3;

export const swingVisionSchema = z.object({
  usable: z.boolean(),
  /** Why the frames could not be read, when they could not. */
  reason: z.string().max(300).default(""),
  view: z.enum(["face_on", "down_the_line", "other", "unclear"]),
  summary: z.string().max(600).default(""),
  measurements: z
    .array(
      z.object({
        metric: z.string().min(1).max(60),
        value: z.number(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(SWING_METRICS.length)
    .default([]),
  findings: z
    .array(
      z.object({
        category: z.enum(SWING_CATEGORIES),
        issue: z.string().min(5).max(200),
        description: z.string().min(10).max(500),
        why_it_matters: z.string().min(10).max(500),
        severity: z.enum(["low", "medium", "high"]),
        certainty: z.enum(CERTAINTY_LEVELS),
        confidence: z.number().min(0).max(1),
        related_skill: z.string().nullable().default(null),
        drill_id: z.string().nullable().default(null),
      }),
    )
    .max(3)
    .default([]),
});

export type SwingVisionOutput = z.infer<typeof swingVisionSchema>;

const SYSTEM = `You are a golf coach looking at still frames taken from one swing video.

What you are doing is estimating body positions by eye. You are not measuring them. Act accordingly:
- If a position is not visible in these frames, omit it. Omitting most of the list is the normal, correct answer for a single camera angle.
- Never infer a number from what a golfer with this ball flight "usually" does. You are reading these frames only.
- Confidence is your own: 0.5 means you can see it clearly for a frame estimate, 0.2 means you are guessing at the edge of what is visible.
- If the frames are too dark, too far away, cut off, or not a golf swing, set usable to false and say why in one sentence.
- Sign conventions matter. Read them in the metric list and follow them exactly; a sign error is worse than an omission.
- Reply with JSON only. No markdown fences, no commentary.`;

function metricBrief(): string {
  return SWING_METRICS.map(
    (metric) =>
      `${metric.id} | ${metric.label} at ${metric.phase} | ${metric.unit} | typical ${metric.min} to ${metric.max} | negative = ${metric.low}, positive = ${metric.high}`,
  ).join("\n");
}

export async function analyzeSwingFrames(
  session: Pick<SwingSession, "club" | "camera_angle" | "notes">,
  frames: string[],
): Promise<AIResult<SwingVisionOutput>> {
  return getProvider().generate({
    name: "swing_vision",
    system: SYSTEM,
    maxTokens: 2000,
    images: frames,
    prompt: `These ${frames.length} frames are evenly spaced across one swing, in order from the start of the clip to the end.

The player says this is a ${CLUB_LABELS[session.club]} filmed ${labelize(session.camera_angle).toLowerCase()}. Check that against the frames: if the view is actually something else, report what you see in "view" and only report positions that view can support.

POSITIONS YOU MAY REPORT. Use these ids exactly. Omit any you cannot see.
${metricBrief()}

Drill ids you may reference, or null: ${[...DRILLS_BY_ID.keys()].join(", ")}
Skills you may reference, or null: ${SKILLS.join(", ")}

Return JSON matching:
{ "usable": boolean, "reason": string, "view": "face_on"|"down_the_line"|"other"|"unclear", "summary": string, "measurements": [{ "metric": string, "value": number, "confidence": number }], "findings": [{ "category": string, "issue": string, "description": string, "why_it_matters": string, "severity": "low"|"medium"|"high", "certainty": "observed"|"likely"|"possible"|"uncertain", "confidence": number, "related_skill": string|null, "drill_id": string|null }] }`,
    schema: swingVisionSchema,
    // Without a model there is no reading of the frames, and saying so is the
    // only honest fallback: there is nothing to compute one from.
    fallback: (): SwingVisionOutput => ({
      usable: false,
      reason: "No analysis model is configured, so the frames were not read.",
      view: "unclear",
      summary: "",
      measurements: [],
      findings: [],
    }),
  });
}

/**
 * Keep the values that survive contact with the metric definitions. Anything
 * unknown, duplicated or implausible is dropped rather than repaired.
 */
export function acceptMeasurements(
  output: SwingVisionOutput,
  swingSessionId: string,
): Omit<SwingMeasurement, "id">[] {
  if (!output.usable) return [];
  const seen = new Set<string>();
  const kept: Omit<SwingMeasurement, "id">[] = [];

  for (const item of output.measurements) {
    const metric = METRICS_BY_ID.get(item.metric);
    if (!metric || seen.has(metric.id)) continue;
    if (!Number.isFinite(item.value)) continue;

    const width = metric.max - metric.min;
    const slack = width * PLAUSIBLE_BAND_MULTIPLE;
    if (item.value < metric.min - slack || item.value > metric.max + slack) continue;

    seen.add(metric.id);
    kept.push({
      swing_session_id: swingSessionId,
      phase: metric.phase,
      metric: metric.id,
      value: Math.round(item.value * 10) / 10,
      unit: metric.unit,
      confidence: Math.min(item.confidence, VISION_CONFIDENCE_CAP),
      source: "vision",
    });
  }

  return kept;
}

/** Findings the model wrote, with any invented drill or skill reference cut. */
export function acceptFindings(
  output: SwingVisionOutput,
  swingSessionId: string,
  userId: string,
): Omit<SwingFinding, "id" | "created_at">[] {
  if (!output.usable) return [];
  const skills = new Set<string>(SKILLS);

  return output.findings.map((finding) => ({
    swing_session_id: swingSessionId,
    user_id: userId,
    category: finding.category,
    issue: finding.issue,
    severity: finding.severity,
    confidence: Math.min(finding.confidence, VISION_CONFIDENCE_CAP),
    certainty: finding.certainty,
    description: finding.description,
    why_it_matters: finding.why_it_matters,
    recommended_drill_id:
      finding.drill_id && DRILLS_BY_ID.has(finding.drill_id) ? finding.drill_id : null,
    related_skill:
      finding.related_skill && skills.has(finding.related_skill)
        ? (finding.related_skill as Skill)
        : null,
    source: "vision",
  }));
}

/** One line for the screen: what was read, and how much of it. */
export function visionNote(output: SwingVisionOutput, kept: number): string {
  if (!output.usable) return output.reason || "The frames could not be read.";
  if (kept === 0) {
    return "Nothing in these frames could be estimated with any confidence. A closer, brighter clip from face on or down the line usually fixes it.";
  }
  return `Estimated ${kept} position${kept === 1 ? "" : "s"} from ${FRAME_COUNT} frames. Check anything that looks wrong and type the real number over it.`;
}
