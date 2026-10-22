import type { Club } from "../../types/golf";
import type { MotionReport } from "./motion-analysis";
import { motionGeometry } from "./motion-analysis";
import { unpackFrames, type PoseModel } from "./pose";
import { analyseVideoModel } from "./video-review";
import { reviewSwing } from "../swing/review";
import { swingScoreChecks } from "./swing-score";
import { getSwingFocus, swingFocusProcedure, type SwingFocus, type SwingFocusId, type SwingProcedure } from "./swing-focus";
import type { SwingReference } from "./swing-reference";

export type SwingAnchors = [number, number, number, number];
export type SwingDifference = { id: SwingFocusId; user: number; reference: number; excess: number; tolerance: number };
export type SwingComparison = {
  status: "ready" | "limited" | "incompatible";
  message: string;
  referenceId: string;
  referenceName: string;
  userAnchors: SwingAnchors | null;
  referenceAnchors: SwingAnchors | null;
  mirrorReference: boolean;
  differences: SwingDifference[];
  focus: SwingFocus | null;
};

export function comparisonAnchors(model: PoseModel, report = analyseVideoModel(model)): SwingAnchors | null {
  if (!report.phases) return null;
  const { address, top, impact } = report.phases;
  const times = [model.t[address], model.t[top], model.t[impact]];
  if (times.some((time) => time === undefined || !Number.isFinite(time)) || !(times[0]! < times[1]! && times[1]! < times[2]!)) return null;
  // This last anchor is observed follow-through, not a claimed detected finish.
  const end = Math.min(model.t.at(-1)!, times[2]! + Math.max(0.25, times[2]! - times[1]!) * 2);
  return end > times[2]! ? [times[0]!, times[1]!, times[2]!, end] : null;
}

/** Piecewise alignment preserves setup, top and contact when swing tempos differ. */
export function comparisonTime(anchors: SwingAnchors, progress: number): number {
  const p = Math.max(0, Math.min(3, Number.isFinite(progress) ? progress : 0));
  const section = Math.min(2, Math.floor(p));
  return anchors[section]! + (anchors[section + 1]! - anchors[section]!) * (p - section);
}
export function comparisonProgress(anchors: SwingAnchors, time: number): number {
  if (!Number.isFinite(time) || time <= anchors[0]) return 0;
  if (time >= anchors[3]) return 3;
  const section = time < anchors[1] ? 0 : time < anchors[2] ? 1 : 2;
  return section + (time - anchors[section]!) / (anchors[section + 1]! - anchors[section]!);
}

function setupShape(model: PoseModel): number | null {
  const report = analyseVideoModel(model);
  if (!report.phases || !model.aspect) return null;
  const frames = unpackFrames(model), geometry = motionGeometry(frames, model.aspect, report.view);
  const frame = frames[report.phases.address]!;
  const s = geometry.shoulders(frame), h = geometry.hips(frame), f = geometry.feet(frame);
  if (!s || !h || !f) return null;
  const leg = Math.hypot(h.x - f.x, h.y - f.y), torso = Math.hypot(s.x - h.x, s.y - h.y);
  return leg > 0.05 && torso > 0.05 ? torso / leg : null;
}

export function matchSwingReferences(model: PoseModel, club: Club, references: SwingReference[]): SwingReference[] {
  const shape = setupShape(model);
  return references.filter((ref) => ref.session.club === club && ref.model.cameraAngle === model.cameraAngle && comparisonAnchors(ref.model))
    .map((ref) => {
      const other = setupShape(ref.model);
      return { ref, distance: shape && other ? Math.abs(Math.log(shape / other)) : 1 };
    })
    .sort((a, b) => {
      const kind = { professional: 0, coach: 1, personal: 2 };
      return kind[a.ref.metadata.kind] - kind[b.ref.metadata.kind] || a.distance - b.distance || a.ref.session.id.localeCompare(b.ref.session.id);
    }).map(({ ref }) => ref);
}

/** Both plans work on the same supported movement, using the actual reference rhythm. */
export function comparisonProcedure(id: SwingFocusId, procedure: SwingProcedure, name: string): string[] {
  if (id === "tempo") return [
    `Watch ${name}'s change of direction at the top using the synchronized replay.`,
    procedure === "rehearsal" ? "Make five easy practice swings, rehearsing that gradual change of direction." : "Hit five waist-high shots, keeping the change of direction gradual.",
    "Record another swing at a constant video speed and compare the rhythm and centered contact before adding speed.",
  ];
  return swingFocusProcedure(id, procedure);
}

export function compareSwingToReference(model: PoseModel, club: Club, reference: SwingReference): SwingComparison {
  const userReview = reviewSwing(model), referenceReview = reviewSwing(reference.model);
  const userReport = userReview.report, referenceReport = referenceReview.report;
  const result: SwingComparison = { status: "limited", message: "Mark setup, top and contact in both videos to synchronize them.",
    referenceId: reference.session.id, referenceName: reference.metadata.name, userAnchors: comparisonAnchors(model, userReport),
    referenceAnchors: comparisonAnchors(reference.model, referenceReport), mirrorReference: false, differences: [], focus: null };
  if (club !== reference.session.club || userReport.view === "other" || userReport.view !== referenceReport.view) {
    return { ...result, status: "incompatible", message: "Choose a reference filmed from the same camera view with the same club." };
  }
  if (userReview.blocks.length || referenceReview.blocks.length)
    return { ...result, message: userReview.blocks[0] ?? referenceReview.blocks[0]! };
  if (!result.userAnchors || !result.referenceAnchors || !userReport.usable || !referenceReport.usable) return result;
  const userShape = setupShape(model), refShape = setupShape(reference.model);
  if (userShape && refShape && Math.abs(Math.log(userShape / refShape)) > 0.4) {
    return { ...result, message: "The setup proportions differ too much for a reliable movement comparison. Use a reference with a more similar camera position and body proportions." };
  }
  // Mirror only the visual replay. Calculations use anatomical lead/trail coordinates.
  const direction = (m: PoseModel, anchors: SwingAnchors) => {
    const frame = m.imageFrames?.[m.t.indexOf(anchors[0])];
    const left = frame?.[27], right = frame?.[28];
    if (!left || !right || left[3] < 0.6 || right[3] < 0.6) return null;
    return Math.sign((m.handedness === "right" ? left[0] - right[0] : right[0] - left[0]));
  };
  const userDirection = direction(model, result.userAnchors), refDirection = direction(reference.model, result.referenceAnchors);
  result.mirrorReference = userReport.view === "face_on"
    ? Boolean(userDirection && refDirection && userDirection !== refDirection)
    : Boolean(model.ballSide && reference.model.ballSide && model.ballSide !== reference.model.ballSide);
  const userChecks = swingScoreChecks(userReport, model.ballSide).components;
  const refChecks = swingScoreChecks(referenceReport, reference.model.ballSide).components;
  // Broad engineering tolerances, not validated biomechanical targets.
  const tolerances: Record<SwingFocusId, number> = { head: 8, height: 4, posture: 8, hip_depth: 4, tempo: 0.6 };
  for (const check of userChecks) {
    const id = check.id as SwingFocusId;
    const other = refChecks.find((row) => row.id === id);
    if (!other || !Object.hasOwn(tolerances, id)) continue;
    // Compare the user's smallest supported excursion with the reference's largest.
    const amount = (report: MotionReport, value: number, bound: "min" | "max") => {
      if (id !== "height") return value;
      const range = report.readings.find((row) => row.id === "lift_top")?.range;
      if (!range) return value;
      return bound === "min" && range[0] <= 0 && range[1] >= 0 ? 0 : Math[bound](Math.abs(range[0]), Math.abs(range[1]));
    };
    const user = amount(userReport, check.value, "min"), ref = amount(referenceReport, other.value, "max");
    result.differences.push({ id, user, reference: ref, excess: id === "tempo" ? Math.abs(user - ref) : user - ref, tolerance: tolerances[id] });
  }
  if (!result.differences.length) return { ...result, message: "The videos can be synchronized, but the same body positions could not be read in both. Check the tracking or adjust the timing." };
  result.status = "ready";
  result.message = `Matched to ${reference.metadata.name} by camera view, club and setup proportions. Positions are synchronized, with movement scaled to each golfer's own stance or body height.`;
  const candidates = result.differences.filter((difference) => difference.excess > difference.tolerance &&
    userChecks.some((check) => check.id === difference.id && (check.scoreRange?.[1] ?? check.score) < 85));
  candidates.sort((a, b) => b.excess / b.tolerance - a.excess / a.tolerance);
  const main = candidates[0];
  if (main) {
    const base = getSwingFocus(userReport, model.ballSide);
    const labels: Record<SwingFocusId, string> = {
      head: "your head moves farther sideways through contact",
      height: "your hip height changes more during the backswing",
      posture: "your upper body appears to straighten more before contact",
      hip_depth: "your hips appear to move farther toward the ball through contact",
      tempo: "your backswing-to-downswing rhythm differs noticeably",
    };
    result.focus = { ...base, status: "issue", id: main.id, issue: `Compared with ${reference.metadata.name}, ${labels[main.id]}.`,
      steps: comparisonProcedure(main.id, "rehearsal", reference.metadata.name) };
  } else {
    const fallback = getSwingFocus(userReport, model.ballSide);
    // A reference cannot erase a supported issue that was not comparable.
    result.focus = fallback.status !== "clear" ? null : { ...fallback,
      issue: `No clear correction stands out against ${reference.metadata.name} in the positions that could be compared.` };
  }
  return result;
}
