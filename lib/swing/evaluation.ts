import { z } from "zod";
import { poseModelSchema } from "../validation/schemas";
import { reviewSwing } from "./review";
import { SWING_ENGINE } from "./policy";
import { buildVideoModel } from "../golf/video-review";
import { unpackFrames } from "../golf/pose";

const phaseTimes = z.object({ address: z.number().finite().min(0), top: z.number().finite().min(0), impact: z.number().finite().min(0) })
  .refine((times) => times.address < times.top && times.top < times.impact, "Labelled phases must be ordered.");
export const evaluationCaptureSchema = z.object({
  id: z.string().min(1), origin: z.enum(["recorded", "synthetic"]),
  split: z.enum(["development", "holdout"]),
  recordingId: z.string().min(1).max(120).optional(), golferId: z.string().min(1).max(120).optional(),
  annotatorId: z.string().min(1).max(120).optional(), consented: z.boolean().optional(),
  view: z.enum(["face_on", "down_the_line"]), handedness: z.enum(["left", "right"]),
  sourceFps: z.number().positive().max(1000), occluded: z.boolean(),
  // These are independently coach-labelled outcomes, never model-generated labels.
  shouldAbstain: z.boolean(),
  acceptableIssues: z.array(z.enum(["head", "height", "posture", "hip_depth", "tempo"])),
  phases: phaseTimes.optional(),
  tracks: poseModelSchema,
}).strict().refine((capture) => capture.origin !== "recorded" ||
  Boolean(capture.recordingId && capture.golferId && capture.annotatorId && capture.consented),
"Recorded evaluation needs recording, golfer and independent annotator identifiers plus consent.");
export type EvaluationCapture = z.infer<typeof evaluationCaptureSchema>;

const quantile = (values: number[], fraction: number) => {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered.length ? ordered[Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)]! : null;
};

/** Offline release policy. These thresholds are engineering acceptance targets,
 * not observed product accuracy or published golf biomechanics standards. */
export const RELEASE_TARGETS = Object.freeze({
  holdout: 200, golfers: 20, perView: 50, leftHanded: 30, occluded: 30, lowFps: 30,
  maxFalseCorrectionRate: 0.05, maxMissedIssueRate: 0.2, maxUnexpectedAbstentionRate: 0.35,
  maxPhaseP95Seconds: 0.08, labelledPhases: 100, minPhaseResolutionRate: 0.9,
});

export function evaluateSwingCaptures(input: unknown) {
  const captures = z.array(evaluationCaptureSchema).min(1).max(10000).parse(input);
  if (new Set(captures.map((capture) => capture.id)).size !== captures.length) throw new Error("Every evaluation capture must have a unique id.");
  for (const key of ["recordingId", "golferId"] as const) {
    const development = new Set(captures.filter((c) => c.origin === "recorded" && c.split === "development").map((c) => c[key]));
    if (captures.some((c) => c.origin === "recorded" && c.split === "holdout" && development.has(c[key])))
      throw new Error(`${key} appears in development and holdout; split by golfer and original recording.`);
  }
  const rows = captures.map((capture) => {
    const model = buildVideoModel(unpackFrames(capture.tracks), {
      aspect: capture.tracks.aspect ?? 0, view: capture.view, handedness: capture.handedness,
      capture: capture.tracks.capture,
    });
    model.ballSide = capture.tracks.ballSide;
    // Evaluate automatic timing only: manual labels cannot leak into predictions.
    const review = reviewSwing(model), focus = review.focus;
    const error = capture.phases && review.report.phases ? Object.fromEntries(
      (["address", "top", "impact"] as const).map((phase) => [phase,
        Math.abs(model.t[review.report.phases![phase]]! - capture.phases![phase])]),
    ) as Record<"address" | "top" | "impact", number> : null;
    const correction = focus.status === "issue" && focus.id !== null;
    return { id: capture.id, origin: capture.origin, split: capture.split, view: capture.view,
      handedness: capture.handedness, occluded: capture.occluded, sourceFps: capture.sourceFps,
      golferId: capture.golferId, correction,
      predicted: focus.id, status: focus.status, phaseErrorSeconds: error,
      falseCorrection: correction && (capture.shouldAbstain || !capture.acceptableIssues.includes(focus.id!)),
      missedIssue: !capture.shouldAbstain && capture.acceptableIssues.length > 0 && !capture.acceptableIssues.includes(focus.id!),
      unexpectedAbstention: !capture.shouldAbstain && focus.status === "needs_input",
      labelledPhases: Boolean(capture.phases), shouldAbstain: capture.shouldAbstain, hasIssue: capture.acceptableIssues.length > 0,
    };
  });
  const holdout = rows.filter((row) => row.origin === "recorded" && row.split === "holdout");
  const summarize = (group: typeof rows) => {
    const usable = group.filter((row) => !row.shouldAbstain), issues = usable.filter((row) => row.hasIssue);
    const rate = (n: number, d: number) => d ? n / d : null;
    return { count: group.length,
      corrections: group.filter((r) => r.correction).length,
      falseCorrectionRate: rate(group.filter((r) => r.falseCorrection).length, group.filter((r) => r.correction).length),
      missedIssueRate: rate(issues.filter((r) => r.missedIssue).length, issues.length),
      unexpectedAbstentionRate: rate(usable.filter((r) => r.unexpectedAbstention).length, usable.length),
      labelledPhases: group.filter((r) => r.labelledPhases).length,
      resolvedPhases: group.filter((r) => r.phaseErrorSeconds).length,
      phaseP95Seconds: Object.fromEntries((["address", "top", "impact"] as const).map((phase) => [phase,
        quantile(group.flatMap((row) => row.phaseErrorSeconds ? [row.phaseErrorSeconds[phase]] : []), 0.95)])),
    };
  };
  const strata = { face_on: holdout.filter((r) => r.view === "face_on"), down_the_line: holdout.filter((r) => r.view === "down_the_line"),
    left_handed: holdout.filter((r) => r.handedness === "left"), occluded: holdout.filter((r) => r.occluded), low_fps: holdout.filter((r) => r.sourceFps <= 30) };
  const reasons: string[] = [];
  if (holdout.length < RELEASE_TARGETS.holdout) reasons.push(`Need ${RELEASE_TARGETS.holdout} independent recorded holdout swings; have ${holdout.length}.`);
  if (new Set(holdout.map((r) => r.golferId)).size < RELEASE_TARGETS.golfers) reasons.push("Need holdout recordings from at least 20 golfers.");
  for (const [name, minimum] of Object.entries({ face_on: RELEASE_TARGETS.perView, down_the_line: RELEASE_TARGETS.perView,
    left_handed: RELEASE_TARGETS.leftHanded, occluded: RELEASE_TARGETS.occluded, low_fps: RELEASE_TARGETS.lowFps })) {
    if (strata[name as keyof typeof strata].length < minimum) reasons.push(`Insufficient ${name} holdout coverage (need ${minimum}).`);
  }
  const metrics = summarize(holdout);
  if (metrics.labelledPhases < RELEASE_TARGETS.labelledPhases) reasons.push("Need at least 100 independently labelled phase sequences.");
  if (!metrics.labelledPhases || metrics.resolvedPhases / metrics.labelledPhases < RELEASE_TARGETS.minPhaseResolutionRate)
    reasons.push("Automatic timing must resolve at least 90% of independently labelled sequences.");
  for (const [name, group] of Object.entries({ overall: holdout, ...strata })) {
    const summary = summarize(group);
    if (summary.falseCorrectionRate === null || summary.falseCorrectionRate > RELEASE_TARGETS.maxFalseCorrectionRate) reasons.push(`${name}: false-correction target is unmet or unmeasured.`);
    if (summary.missedIssueRate === null || summary.missedIssueRate > RELEASE_TARGETS.maxMissedIssueRate) reasons.push(`${name}: missed-issue target is unmet or unmeasured.`);
    if (summary.unexpectedAbstentionRate === null || summary.unexpectedAbstentionRate > RELEASE_TARGETS.maxUnexpectedAbstentionRate) reasons.push(`${name}: usable-video coverage target is unmet or unmeasured.`);
  }
  if (Object.values(metrics.phaseP95Seconds).some((value) => value === null || value > RELEASE_TARGETS.maxPhaseP95Seconds)) reasons.push("Phase timing p95 target is unmet or unmeasured.");
  return { engine: SWING_ENGINE, gate: reasons.length ? "blocked" : "eligible_for_review", targets: RELEASE_TARGETS,
    metrics, strata: Object.fromEntries(Object.entries(strata).map(([name, group]) => [name, summarize(group)])),
    reasons, rows };
}
