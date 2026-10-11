import { LM, type Landmark, type PoseFrame } from "./pose";
import { findAutomaticTiming, hasStableFoot, trustworthyFrames, visibleHands, visiblePoint, type MotionView } from "./motion-analysis";

type Point = { x: number; y: number };
export type FaceOnMetric = {
  id: "head" | "hips" | "height";
  label: string;
  value: number;
  unit: "% stance width" | "% shoulder-to-ankle height";
  time: number;
  evidence: string;
};
export type FaceOnReview = {
  status: "ready" | "partial" | "record_again";
  message: string;
  notes: string[];
  guide: PoseFrame | null;
  window: [number, number] | null;
  scope: "backswing" | "visible_segment";
  metrics: FaceOnMetric[];
  practice: { title: string; steps: string[]; check: string };
  setup: { aspect: number; stanceToBody: number; shouldersToBody: number; torsoTilt: number } | null;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : 0;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const point = (frame: PoseFrame, joint: number, aspect: number): Point | null => {
  const p = frame.imageLandmarks?.[joint];
  return visiblePoint(p) ? { x: p.x * aspect, y: p.y } : null;
};
const centre = (frame: PoseFrame, a: number, b: number, aspect: number): Point | null => {
  const left = point(frame, a, aspect), right = point(frame, b, aspect);
  return left && right ? { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 } : null;
};
const hips = (frame: PoseFrame, aspect: number) => centre(frame, LM.leftHip, LM.rightHip, aspect);
const bodyHeight = (frame: PoseFrame, aspect: number) => {
  const s = centre(frame, 11, 12, aspect), f = centre(frame, 27, 28, aspect);
  return s && f ? f.y - s.y : 0;
};

/** Repeatability exercise, not a diagnosis inferred from an excursion threshold. */
const practice = {
  title: "Repeat your rhythm",
  steps: [
    "Make three comfortable practice swings at an easy pace. Let your head and hips move naturally.",
    "Hit three balls with that same pace and notice the quality of contact.",
    "Record another swing with the phone in the same position to compare the visible movement.",
  ],
  check: "Use contact and repeatability to judge the exercise. A smaller movement is not automatically a better swing.",
};

/** Camera-plane observations only. World coordinates, contact and marked phases
 * are deliberately excluded. Quality gates are conservative heuristics that
 * need evaluation on coach-labelled recordings, not calibrated error bounds. */
export function reviewFaceOn(input: PoseFrame[], aspect: number, recordedView: MotionView = "other"): FaceOnReview {
  const review: FaceOnReview = {
    status: "record_again", message: "Record one swing facing the camera, with your head and both feet visible.",
    notes: [], guide: null, window: null, scope: "visible_segment", metrics: [], practice, setup: null,
  };
  if (recordedView === "down_the_line") {
    review.message = "For this review, record with the camera facing your chest instead of behind you.";
    return review;
  }
  if (!(aspect >= 0.3 && aspect <= 3.5) || input.length < 8 || input.some((f, i) =>
    !Number.isFinite(f.t) || (i > 0 && f.t <= input[i - 1]!.t))) return review;
  const frames = trustworthyFrames(input, aspect, "face_on");
  // Find a still grip near the hips, followed by a visible hand rise. Starting
  // mid-swing or standing at the finish cannot establish an address baseline.
  let setup: PoseFrame[] = [], start = -1;
  for (let n = 0; n < frames.length - 3; n++) {
    const first = frames[n]!, h = visibleHands(first, aspect), hip = hips(first, aspect);
    const body = bodyHeight(first, aspect);
    if (!h || !hip || body < 0.15 || Math.abs(h.y - hip.y) > body * 0.45) continue;
    const still = frames.slice(n).filter((f) => f.t <= first.t + 0.18);
    if (still.length < 3 || still.at(-1)!.t - first.t < 0.07 || still.some((f, i) => {
      const hand = visibleHands(f, aspect), p = hips(f, aspect);
      return !hand || !p || distance(hand, h) > body * 0.045 || distance(p, hip) > body * 0.03 ||
        (i > 0 && f.t - still[i - 1]!.t > 0.12);
    })) continue;
    const later = frames.slice(n + still.length).find((f) => {
      const hand = visibleHands(f, aspect), p = hips(f, aspect);
      return hand && p && (hand.y - p.y) < (h.y - hip.y) - body * 0.2;
    });
    if (!later || later.t - first.t > 4) continue;
    setup = still; start = n; break;
  }
  if (start < 0) {
    review.message = "Include a brief still setup before the swing, with your hands and both feet visible.";
    return review;
  }
  // A median reference avoids prescribing movement from a single noisy frame.
  const guide: PoseFrame = { t: setup[0]!.t, landmarks: [], imageLandmarks: Array.from({ length: 33 }, (_, joint): Landmark => {
    const points = setup.map((f) => f.imageLandmarks?.[joint]).filter(visiblePoint);
    if (points.length !== setup.length) return { x: 0, y: 0, z: 0, visibility: 0 };
    return { x: median(points.map((p) => p.x)), y: median(points.map((p) => p.y)), z: 0,
      visibility: Math.min(...points.map((p) => p.visibility ?? 0)) };
  }) };
  const body = bodyHeight(guide, aspect);
  const left = point(guide, 27, aspect), right = point(guide, 28, aspect);
  const shoulderL = point(guide, 11, aspect), shoulderR = point(guide, 12, aspect);
  const hipL = point(guide, 23, aspect), hipR = point(guide, 24, aspect);
  if (!left || !right || !shoulderL || !shoulderR || !hipL || !hipR) return review;
  const stance = Math.abs(left.x - right.x), shoulderWidth = Math.abs(shoulderL.x - shoulderR.x);
  if (stance < body * 0.18 || shoulderWidth < body * 0.16 || Math.abs(hipL.x - hipR.x) < body * 0.07 ||
    Math.sign(shoulderL.x - shoulderR.x) !== Math.sign(left.x - right.x)) {
    review.message = "Move the phone directly opposite your setup hands so both sides of your body are visible.";
    return review;
  }
  const automatic = findAutomaticTiming(frames, aspect, "face_on");
  // Without complete hand timing, describe only the observed segment. Never
  // fabricate impact or ask the player to place three markers.
  const finish = automatic ? frames[automatic.timing.topWindow?.[1] ?? automatic.phases.top]!.t :
    Math.min(frames.at(-1)!.t, guide.t + 3);
  const window = frames.slice(start).filter((f) => f.t <= finish);
  if (window.length < 6 || finish - guide.t < 0.2) return review;
  review.scope = automatic?.timing.source === "hands" ? "backswing" : "visible_segment";
  review.window = [guide.t, finish];
  const maxGap = Math.max(0, ...window.slice(1).map((f, i) => f.t - window[i]!.t));
  if (maxGap > 0.2) {
    review.message = "Use a shorter recording of one swing so the movement stays clearly tracked.";
    review.window = null;
    return review;
  }
  const stable = hasStableFoot(window, guide, aspect, body);
  if (!stable) {
    review.message = "Keep the phone fixed and both feet visible; the camera or feet moved too much for a reliable comparison.";
    return review;
  }
  review.guide = guide;
  const hip = hips(guide, aspect)!, shoulder = centre(guide, 11, 12, aspect)!;
  review.setup = { aspect, stanceToBody: stance / body, shouldersToBody: shoulderWidth / body,
    torsoTilt: Math.atan2(shoulder.x - hip.x, hip.y - shoulder.y) * 180 / Math.PI };
  const scope = review.scope === "backswing" ? "the observed backswing" : "the tracked video segment";
  function excursion(id: FaceOnMetric["id"], label: string, get: (f: PoseFrame) => Point | null, axis: "x" | "y", scale: number, unit: FaceOnMetric["unit"]) {
    const base = get(guide);
    if (!base) return;
    const observed = window.flatMap((f) => { const p = get(f); return p ? [{ frame: f, value: Math.abs(p[axis] - base![axis]) / scale * 100 }] : []; });
    if (observed.length < window.length * 0.85 || observed.length < 6 || observed.some((s, i) => i > 0 && s.frame.t - observed[i - 1]!.frame.t > 0.2)) return;
    // A single plausible but noisy point must not become the reported maximum.
    // Use nearby observed values only, without bridging a tracking gap.
    const supported = observed.flatMap((sample) => {
      const nearby = observed.filter((other) => Math.abs(other.frame.t - sample.frame.t) <= 0.1);
      return nearby.length >= 3 ? [{ ...sample, value: median(nearby.map((other) => other.value)) }] : [];
    });
    if (supported.length < 6) return;
    const peak = supported.reduce((a, b) => a.value >= b.value ? a : b);
    const value = Math.round(peak.value);
    review.metrics.push({ id, label, value, unit, time: peak.frame.t,
      evidence: `${label} ${value === 0 ? "was under 1%" : `reached about ${value}%`} of ${unit === "% stance width" ? "your visible stance width" : "your setup shoulder-to-ankle height"} from setup during ${scope}.` });
  }
  excursion("hips", "Sideways hip movement", (f) => hips(f, aspect), "x", stance, "% stance width");
  excursion("head", "Sideways nose movement", (f) => point(f, LM.nose, aspect), "x", stance, "% stance width");
  excursion("height", "Vertical hip movement", (f) => hips(f, aspect), "y", body, "% shoulder-to-ankle height");
  if (!review.metrics.length) {
    review.message = "Use brighter light and keep your head and hips visible throughout the swing.";
    return review;
  }
  review.status = review.scope === "backswing" && review.metrics.length === 3 ? "ready" : "partial";
  review.message = "Review the movement against your setup guides, then try one repeatability exercise.";
  if (!automatic) review.notes.push("Exact swing timing is unclear. These observations cover the tracked segment, without an impact estimate.");
  else if (automatic.timing.source !== "hands") review.notes.push("The hands were hidden around the transition. These observations cover the visible body segment, without claiming an exact top position.");
  if (review.metrics.length < 3) review.notes.push("Some points were unclear; their movement readings are omitted.");
  review.notes.push("These are projected positions, not body rotation, foot pressure, clubface or ball-flight measurements. Visible movement alone does not establish a swing fault.");
  return review;
}

export function compareFaceOn(current: FaceOnReview, previous: FaceOnReview): string | null {
  const a = current.setup, b = previous.setup;
  if (!a || !b || current.status === "record_again" || previous.status === "record_again" ||
    current.scope !== "backswing" || previous.scope !== "backswing" ||
    Math.abs(a.aspect / b.aspect - 1) > 0.05 || Math.abs(a.stanceToBody / b.stanceToBody - 1) > 0.15 ||
    Math.abs(a.shouldersToBody / b.shouldersToBody - 1) > 0.15 || Math.abs(a.torsoTilt - b.torsoTilt) > 8) return null;
  const now = current.metrics.find((m) => m.id === "hips"), before = previous.metrics.find((m) => m.id === "hips");
  if (!now || !before) return null;
  return `Your observed backswing hip movement was about ${before.value}% of stance width in the earlier recording and ${now.value}% here. This is a movement comparison, not an improvement grade; compare contact too.`;
}
