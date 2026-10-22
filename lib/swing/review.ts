import { analyseVideoModel } from "../golf/video-review";
import { getSwingFocus, type SwingFocus } from "../golf/swing-focus";
import { swingScoreChecks } from "../golf/swing-score";
import { trustworthyFrames } from "../golf/motion-analysis";
import { unpackFrames, type PoseModel } from "../golf/pose";
import { SWING_ENGINE } from "./policy";
import { swingCandidates } from "./segments";
import { isCaptureManifest } from "./manifest";

export type EvidenceState = "supported" | "uncertain" | "unavailable";
export type SwingEvidence = { id: string; state: EvidenceState; reason: string; sampleTimes: number[] };

function validTracks(model: PoseModel) {
  return Number.isFinite(model.aspect) && model.aspect! >= 0.3 && model.aspect! <= 3.5 && model.t.length >= 8 && model.t.length <= 128 &&
    model.t.every((time, i) => Number.isFinite(time) && time >= 0 && time <= 3600 && (!i || time > model.t[i - 1]!)) &&
    model.imageFrames?.length === model.t.length && model.imageFrames.every((row) => row.length === 33 && row.every((p) =>
      p.length === 4 && p.every(Number.isFinite) && p[0] >= -2 && p[0] <= 2 && p[1] >= -2 && p[1] <= 2 && p[3] >= 0 && p[3] <= 1));
}

/** The only player-facing review entrypoint. Server and browser recompute it
 * from the same image tracks; client diagnostics cannot certify an issue. */
export function reviewSwing(model: PoseModel) {
  let valid = false;
  try { valid = Boolean(validTracks(model)); } catch { /* A corrupt saved payload fails closed. */ }
  const report = valid ? analyseVideoModel(model) : analyseVideoModel({ ...model, t: [], frames: [], imageFrames: [], phasesConfirmed: false });
  const blocks: string[] = [];
  if (!valid) blocks.push("The saved tracks are incomplete or invalid. Select Review again to read this video.");
  if (model.capture && (!isCaptureManifest(model.capture) || model.capture.inferences < model.t.length ||
      Math.abs(model.capture.width / model.capture.height - (model.aspect ?? 0)) > 0.01))
    blocks.push("This recording needs a review with the current tracking engine. Select Review again.");
  const frames = valid ? trustworthyFrames(unpackFrames(model), model.aspect!, model.cameraAngle ?? "other") : [];
  const candidates = valid ? swingCandidates(frames, model.aspect!, model.cameraAngle) : [];
  if (candidates.length > 1) blocks.push("More than one possible swing appears in this recording. Shorten it to the swing you want to review.");
  if (model.capture?.timestampSource !== "decoded") {
    report.tempo = null;
    report.warnings.push("Decoded-frame timestamps are unavailable for these tracks. Rhythm is withheld; visible body positions can still be reviewed.");
  }
  const checks = swingScoreChecks(report, model.ballSide);
  const evidence: SwingEvidence[] = checks.components.map((check) => ({
    id: check.id, state: check.scoreRange && check.scoreRange[0] < 85 && check.scoreRange[1] >= 85 ? "uncertain" : "supported",
    reason: check.evidence,
    sampleTimes: [...new Set([check.time, ...(check.id === "tempo" && report.phases ? Object.values(report.phases).map((index) => model.t[index]!) : []),
      ...((check.id === "head" || check.id === "posture" || check.id === "hip_depth") && report.timing?.impactWindow
        ? model.t.slice(report.timing.impactWindow[0], report.timing.impactWindow[1] + 1) : []),
      ...(check.id === "height" && report.timing?.topWindow ? model.t.slice(report.timing.topWindow[0], report.timing.topWindow[1] + 1) : []),
    ])].sort((a, b) => a - b),
  }));
  const expected = model.cameraAngle === "down_the_line" ? ["posture", "hip_depth", "tempo"] : ["head", "height", "tempo"];
  expected.filter((id) => !evidence.some((item) => item.id === id)).forEach((id, index) => evidence.push({
    id, state: "unavailable", reason: checks.missing[index] ?? "The required visible positions are unavailable.", sampleTimes: [],
  }));
  const focus: SwingFocus = blocks.length ? { status: "needs_input", id: null, issue: blocks[0]!, steps: [
    "Open the recording and check that it contains one complete swing with the golfer clearly visible.",
    "Shorten the recording if needed, then select Review again.",
  ] } : getSwingFocus(report, model.ballSide);
  return { engine: SWING_ENGINE, report, evidence, focus, blocks, candidates };
}
