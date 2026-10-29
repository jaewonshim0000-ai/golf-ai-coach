import { LM, SLOW_MOTION_SPEEDS, type Landmark, type PoseFrame, type SwingPhases } from "./pose";

export type MotionView = "face_on" | "down_the_line" | "other";
const SEEN = 0.6;
const CORE = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length ? sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2 : null;
};
const rounded = (value: number) => Math.round(value * 10) / 10;

/** Visibility is a gate, not a claim that the coordinate has that accuracy. */
export function visiblePoint(point: Landmark | undefined): point is Landmark {
  return Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 && (point.visibility ?? 0) >= SEEN);
}

function at(frame: PoseFrame, index: number, aspect: number): Point | null {
  const point = frame.imageLandmarks?.[index];
  return visiblePoint(point) ? { x: point.x * aspect, y: point.y } : null;
}
function centre(frame: PoseFrame, a: number, b: number, aspect: number): Point | null {
  const left = at(frame, a, aspect), right = at(frame, b, aspect);
  return left && right ? { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 } : null;
}
const hips = (frame: PoseFrame, aspect: number) => centre(frame, LM.leftHip, LM.rightHip, aspect);
const shoulders = (frame: PoseFrame, aspect: number) => centre(frame, LM.leftShoulder, LM.rightShoulder, aspect);
const feet = (frame: PoseFrame, aspect: number) => centre(frame, LM.leftAnkle, LM.rightAnkle, aspect);
export function visibleHands(frame: PoseFrame, aspect = 1): Point | null {
  // Hands share the grip. Track the visible wrist if the other is hidden,
  // rather than use its guessed coordinate or lose the entire hand arc.
  const left = at(frame, LM.leftWrist, aspect), right = at(frame, LM.rightWrist, aspect);
  if (!left || !right) return left ?? right;
  // Two wrists on a shared grip must agree. Averaging a mistracked wrist with
  // the real grip creates a hand path which neither hand actually followed.
  const torso = median([[LM.leftShoulder, LM.leftHip], [LM.rightShoulder, LM.rightHip]].flatMap(([s, h]) => {
    const shoulder = at(frame, s!, aspect), hip = at(frame, h!, aspect);
    return shoulder && hip ? [distance(shoulder, hip)] : [];
  })) ?? 0;
  if (torso > 0 && distance(left, right) > torso * 0.45) return null;
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}
const hands = visibleHands;

/** Use one consistent visible side for a profile clip; never substitute hidden joints. */
export function motionGeometry(frames: PoseFrame[], aspect: number, view: MotionView) {
  const sides = [[LM.leftShoulder, LM.leftHip, LM.leftAnkle], [LM.rightShoulder, LM.rightHip, LM.rightAnkle]];
  const counts = sides.map((side) => frames.filter((frame) => side.every((joint) => visiblePoint(frame.imageLandmarks?.[joint]))).length);
  const side = sides[counts[1]! > counts[0]! ? 1 : 0]!;
  const profile = view === "down_the_line";
  // Pick one head landmark for the whole clip, so an ear never becomes a nose mid-swing.
  const headJoint = profile ? [LM.nose, 7, 8].sort((a, b) =>
    frames.filter((frame) => visiblePoint(frame.imageLandmarks?.[b])).length -
    frames.filter((frame) => visiblePoint(frame.imageLandmarks?.[a])).length)[0]! : LM.nose;
  return {
    side,
    visibleBody: (frame: PoseFrame) => (profile ? side : CORE).every((joint) => visiblePoint(frame.imageLandmarks?.[joint])),
    hips: (frame: PoseFrame, scale = aspect) => profile ? at(frame, side[1]!, scale) : hips(frame, scale),
    shoulders: (frame: PoseFrame, scale = aspect) => profile ? at(frame, side[0]!, scale) : shoulders(frame, scale),
    feet: (frame: PoseFrame, scale = aspect) => profile ? at(frame, side[2]!, scale) : feet(frame, scale),
    head: (frame: PoseFrame) => at(frame, headJoint, aspect),
  };
}

/** Reject isolated body jumps rather than smooth them into plausible movement. */
export function trustworthyFrames(frames: PoseFrame[], aspect: number, view: MotionView = "other"): PoseFrame[] {
  const { hips, shoulders } = motionGeometry(frames, aspect, view);
  return frames.map((frame, index) => {
    const before = frames[index - 1], after = frames[index + 1];
    const current = hips(frame, aspect);
    const previous = before && hips(before, aspect), next = after && hips(after, aspect);
    const shoulder = shoulders(frame, aspect);
    const scale = current && shoulder ? distance(current, shoulder) : 0;
    const bad = before && after && current && previous && next && scale > 0 &&
      after.t - before.t < 0.25 && distance(previous, next) < scale * 0.3 &&
      Math.min(distance(current, previous), distance(current, next)) > scale * 0.5;
    if (bad) return { ...frame, imageLandmarks: frame.imageLandmarks?.map((point) => ({ ...point, visibility: 0 })) };
    // Reject isolated joint spikes independently. Preserve a correct wrist
    // when its partner jumps, and preserve genuine fast, continuous movement.
    if (!before || !after || scale <= 0 || frame.t - before.t > 0.101 || after.t - frame.t > 0.101) return frame;
    const imageLandmarks = frame.imageLandmarks?.map((point, joint) => {
      const p = at(before, joint, aspect), n = at(after, joint, aspect), c = at(frame, joint, aspect);
      if (!p || !n || !c) return point;
      const fraction = (frame.t - before.t) / (after.t - before.t);
      const expected = { x: p.x + (n.x - p.x) * fraction, y: p.y + (n.y - p.y) * fraction };
      const limb = joint >= 13 && joint <= 22;
      const threshold = scale * (limb ? 0.65 : 0.3);
      return distance(c, expected) > threshold && distance(p, n) < threshold &&
        Math.min(distance(c, p), distance(c, n)) > threshold ? { ...point, visibility: 0 } : point;
    });
    return { ...frame, imageLandmarks };
  });
}

/** A planted ankle is a reference for image displacement. Knee flexion and
 * rotation change projected shin length even with a fixed camera, so shin
 * length must not decide whether the recording can be reviewed. */
export function hasStableFoot(frames: PoseFrame[], reference: PoseFrame, aspect: number, body: number, required: PoseFrame[] = []): boolean {
  if (!(body > 0) || frames.length < 3) return false;
  return [LM.leftAnkle, LM.rightAnkle].some((joint) => {
    const base = at(reference, joint, aspect);
    if (!base) return false;
    // The global percentile tolerates isolated detector errors. It must not
    // excuse a moved or hidden anchor at the position actually being measured.
    if (required.some((frame) => {
      const foot = at(frame, joint, aspect);
      return !foot || distance(foot, base) / body >= 0.045;
    })) return false;
    const moves = frames.flatMap((frame) => {
      const foot = at(frame, joint, aspect);
      return foot ? [distance(foot, base) / body] : [];
    }).sort((a, b) => a - b);
    // An isolated tracking error is not evidence that the camera moved.
    // Sustained movement of both ankles still withholds displacement.
    return moves.length >= frames.length * 0.85 && moves[Math.ceil(moves.length * 0.9) - 1]! < 0.045;
  });
}

/** One complete visible hand arc. Never fill in impact for a truncated clip. */
export function findMotionPhases(frames: PoseFrame[], aspect = 1, view: MotionView = "other"): SwingPhases | null {
  return findHandArc(frames, aspect, view, 0.101);
}

function findHandArc(frames: PoseFrame[], aspect: number, view: MotionView, maximumGap: number): SwingPhases | null {
  const { hips, shoulders, feet, visibleBody } = motionGeometry(frames, aspect, view);
  if (frames.length < 8) return null;
  const body = median(frames.flatMap((frame) => {
    const s = shoulders(frame, aspect), f = feet(frame, aspect);
    return s && f ? [distance(s, f)] : [];
  }));
  if (!body || body < 0.08) return null;
  // Hands relative to the hips resist a small camera pan and body translation.
  const path = frames.map((frame) => {
    const h = hands(frame, aspect), p = hips(frame, aspect);
    return h && p ? (h.y - p.y) / body : null;
  });
  const addressBefore = (topIndex: number) => {
    // Takeaway can move sideways or slightly downward before the hands rise.
    // Use departure from a still grip, not its lowest vertical position.
    let reference: Point | null = null, lastStill = -1;
    for (let index = 0; index < topIndex; index++) {
      const h = hands(frames[index]!, aspect), p = hips(frames[index]!, aspect);
      if (!h || !p) continue;
      const relative = { x: (h.x - p.x) / body, y: (h.y - p.y) / body };
      reference ??= relative;
      // Returning to the grip after a waggle establishes a later address.
      if (distance(relative, reference) <= 0.07) lastStill = index;
    }
    return lastStill;
  };
  let baseline = -Infinity, address = -1, top = -1, highest = Infinity;
  let locked = false, impact = -1, lowest = -Infinity;
  let previousHand = -1;
  for (let index = 0; index < frames.length; index++) {
    const value = path[index];
    if (value === null || value === undefined) continue;
    // A missing hand through the reversal hides the true peak. A local high
    // point before that gap must not be presented as the top of backswing.
    if (top >= 0 && previousHand >= 0 && frames[index]!.t - frames[previousHand]!.t > maximumGap) {
      const previous = path[previousHand]!;
      const hidden = frames.slice(previousHand + 1, index);
      const nextHand = path.findIndex((point, n) => n > index && point !== null);
      const next = nextHand >= 0 ? path[nextHand]! : null;
      // Brief wrist loss away from either reversal does not hide the top or
      // bottom when the hands resume in the same direction and the body stays
      // tracked. Never bridge a hidden peak, contact or a sparse source clip.
      const continues = next !== null && frames[nextHand]!.t - frames[index]!.t <= 0.101 &&
        ((!locked && value < previous && value < highest && next < value) ||
        (locked && value > previous && value > lowest && next > value));
      if (frames[index]!.t - frames[previousHand]!.t > 0.201 || !continues || !hidden.length ||
          !hidden.every((frame, n) => visibleBody(frame) && frame.t - frames[previousHand + n]!.t <= 0.101) ||
          frames[index]!.t - frames[index - 1]!.t > 0.101) return null;
    }
    previousHand = index;
    if (address < 0 || (!locked && top < 0 && value >= baseline - 0.015)) {
      // Keep the setup level anchored. Replacing it after every tiny rise
      // makes a slow or densely sampled backswing look permanently still.
      baseline = Math.max(baseline, value);
      address = index;
    }
    if (index <= address) continue;
    if (locked && value < highest) {
      highest = value; top = index; locked = false; impact = -1; lowest = -Infinity;
    }
    if (!locked) {
      if (value < highest) { highest = value; top = index; }
      if (baseline - highest < 0.2) {
        // A waggle is not a backswing; let its return establish a fresh address.
        if (value >= baseline - 0.015) { baseline = Math.max(baseline, value); address = index; top = -1; highest = Infinity; }
        continue;
      }
      if (index > top && value > highest + 0.08) locked = true;
    }
    if (locked && index > top) {
      if (value > lowest) { lowest = value; impact = index; }
      if (lowest >= highest + (baseline - highest) * 0.6 && value < lowest - 0.08) {
        const still = addressBefore(top);
        if (still >= 0) address = still;
        return address < top && top < impact ? { address, top, impact } : null;
      }
    }
  }
  // A low hand position alone cannot prove contact without the return upward.
  return null;
}

/** A sampling hint only. Sparse observations may guide a closer read, but
 * cannot establish timing until that read supplies the missing evidence. */
export function swingSamplingWindow(frames: PoseFrame[], aspect: number, view: MotionView): [number, number, number] | null {
  const arc = findHandArc(frames, aspect, view, Infinity);
  if (!arc) return null;
  return [frames[arc.address]!.t, frames[arc.top]!.t, frames[arc.impact]!.t];
}

/**
 * Most downswings take 0.2–0.5 s, so the downswing's length in the video
 * shows how much a clip was slowed. Picks the nearest export speed, which
 * tolerates a downswing at least ~40% off 0.32 s. Arc detection ignores sample
 * gaps, so it works before the real time base is known. Returns 1 without an arc.
 */
export function estimateSlowMotion(frames: PoseFrame[], aspect: number, view: MotionView): number {
  const arc = swingSamplingWindow(frames, aspect, view);
  const downswing = arc ? arc[2] - arc[1] : 0;
  if (!(downswing > 0)) return 1;
  const off = (speed: number) => Math.abs(Math.log(downswing / 0.32 / speed));
  return SLOW_MOTION_SPEEDS.reduce<number>((best, speed) => off(speed) < off(best) ? speed : best, 1);
}

export type MotionTiming = {
  source: "hands" | "occluded_transition" | "marked";
  uncertainty: number;
  /** A bounded interval, never a fabricated hand coordinate. */
  topWindow?: [number, number];
  /** Observed samples bracketing the hand-path bottom, not detected ball impact. */
  impactWindow?: [number, number];
};

function impactBracket(frames: PoseFrame[], impact: number, aspect: number): [number, number] | undefined {
  let before = impact - 1;
  while (before >= 0 && !hands(frames[before]!, aspect)) before--;
  const after = frames.findIndex((frame, index) => index > impact && hands(frame, aspect));
  return before >= 0 && after >= 0 && frames[impact]!.t - frames[before]!.t <= 0.101 &&
    frames[after]!.t - frames[impact]!.t <= 0.101 ? [before, after] : undefined;
}

/**
 * A short occlusion can still bracket the backswing transition: an observed
 * rising hand before it, an observed descending hand after it, and a complete
 * return through the bottom into follow-through. Measure the visible body
 * across that interval; do not claim to have seen the hidden hand at the top.
 */
export function findAutomaticTiming(frames: PoseFrame[], aspect = 1, view: MotionView = "other"): { phases: SwingPhases; timing: MotionTiming } | null {
  const { hips, shoulders, feet, visibleBody } = motionGeometry(frames, aspect, view);
  if (frames.length < 8 || !(aspect > 0)) return null;
  const direct = findMotionPhases(frames, aspect, view);
  if (direct) {
    const times = frames.slice(direct.address, direct.impact + 1).filter((frame) => hands(frame, aspect) && hips(frame, aspect)).map((frame) => frame.t);
    const gaps = times.slice(1).map((time, index) => time - times[index]!);
    // Carry accepted hand gaps into timing uncertainty; nearby body samples
    // alone cannot make an occluded hand path precise enough for rhythm.
    return { phases: direct, timing: { source: "hands", uncertainty: Math.max(0, ...gaps.filter((gap) => gap > 0.101)),
      impactWindow: impactBracket(frames, direct.impact, aspect) } };
  }
  const body = median(frames.flatMap((frame) => {
    const s = shoulders(frame, aspect), f = feet(frame, aspect);
    return s && f ? [distance(s, f)] : [];
  }));
  if (!body || body < 0.08) return null;
  const observed = frames.flatMap((frame, index) => {
    const h = hands(frame, aspect), p = hips(frame, aspect);
    return h && p ? [{ index, t: frame.t, x: (h.x - p.x) / body, y: (h.y - p.y) / body }] : [];
  });
  for (let index = 2; index < observed.length - 2; index++) {
    const before = observed[index - 1]!, after = observed[index]!;
    const gap = after.t - before.t;
    if (gap <= 0.1 || gap > 0.401) continue;
    const rise = observed.slice(0, index - 1).find((point) => before.t - point.t <= 0.151)!, fall = observed[index + 1]!;
    // The samples on both sides must support a reversal, not a lost wrist
    // during takeaway, the downswing, or a cut at the end of the recording.
    if (!rise || fall.t - after.t > 0.101 ||
        before.y >= rise.y - 0.015 || fall.y <= after.y + 0.025) continue;
    const hidden = frames.slice(before.index + 1, after.index);
    if (!hidden.length || !hidden.every((frame, n) => visibleBody(frame) &&
        frame.t - frames[before.index + n]!.t <= 0.101)) continue;
    const setup = observed.slice(0, index);
    const baseline = median(setup.slice(0, Math.max(2, Math.floor(setup.length / 3))).map((point) => point.y));
    if (baseline === null || baseline - Math.max(before.y, after.y) < 0.2) continue;
    const first = setup[0]!;
    let address: number | undefined;
    for (let n = 1; n < setup.length - 2; n++) {
      const departure = setup.slice(n, n + 3).filter((point) => distance(point, first) > 0.025).length;
      if (departure >= 2 && address === undefined) {
        const firstMoving = setup.findIndex((point, j) => j >= n && distance(point, first) > 0.025);
        address = setup[Math.max(0, firstMoving - 1)]!.index;
      }
      if (departure === 0) address = undefined; // a waggle returned to setup
    }
    if (address === undefined) continue;
    // Find the first complete bottom after the occlusion. A finish cannot
    // become a second backswing, and a low hand alone does not prove contact.
    let bottom = after, complete = false;
    for (const point of observed.slice(index + 1)) {
      if (point.t - frames[bottom.index]!.t > 0.15 && point.y >= bottom.y) break;
      if (point.y > bottom.y) bottom = point;
      if (bottom.y >= baseline - 0.12 && point.y < bottom.y - 0.08) { complete = true; break; }
    }
    if (!complete) continue;
    const middle = (before.t + after.t) / 2;
    const top = hidden.reduce((best, frame, n) => Math.abs(frame.t - middle) < Math.abs(frames[best]!.t - middle) ? before.index + 1 + n : best, before.index + 1);
    if (address < top && top < bottom.index) return {
      phases: { address, top, impact: bottom.index },
      timing: { source: "occluded_transition", uncertainty: gap / 2, topWindow: [before.index, after.index],
        impactWindow: impactBracket(frames, bottom.index, aspect) },
    };
  }
  return null;
}

export type MotionReading = {
  id: string; label: string; phase: keyof SwingPhases; value: number; unit: "° in picture" | "% stance" | "% body height";
  note: string; time: number;
  range?: [number, number];
};
export type MotionReport = {
  view: MotionView;
  usable: boolean;
  phases: SwingPhases | null;
  timing: MotionTiming | null;
  quality: { visible: number; total: number; coverage: number; cameraStable: boolean; largestGap: number };
  readings: MotionReading[];
  observations: { title: string; detail: string }[];
  warnings: string[];
  tempo: { backswing: number; downswing: number; ratio: number; uncertainty: number; ratioRange?: [number, number] } | null;
  summary: string;
};

export function motionCriteria(view: MotionView) {
  return (["address", "top", "impact"] as const).flatMap((phase) => [
    { id: `torso_${phase}`, label: "Torso inclination", phase },
    ...(view === "down_the_line" ? [] : [{ id: `shoulders_${phase}`, label: "Shoulder line tilt", phase }]),
    ...(phase === "address" ? [] : [
      { id: `lift_${phase}`, label: "Hip height change", phase },
      { id: `hips_${phase}`, label: view === "face_on" ? "Hip shift along target" : "Hip movement across picture", phase },
      { id: `head_${phase}`, label: view === "face_on" ? "Head shift along target" : "Head movement across picture", phase },
    ]),
  ]);
}

/** Interpret observed geometry against the player's setup, without ideal bands. */
export function describeMotionReading(reading: MotionReading, report: MotionReport): string {
  const kind = reading.id.split("_")[0];
  const hipLabel = report.view === "down_the_line" ? "tracked hip" : "hip centre";
  const amount = Math.abs(reading.value);
  const baseline = report.readings.find((row) => row.id === `${kind}_address`);
  if (reading.range) {
    const [low, high] = reading.range;
    const interval = reading.phase === "impact" ? "estimated contact interval" : "estimated transition";
    const span = `${Math.min(Math.abs(low), Math.abs(high))} to ${Math.max(Math.abs(low), Math.abs(high))}`;
    if (kind === "torso") return `Torso inclination ranges from ${low}° to ${high}° across the ${interval}${baseline ? `, compared with ${baseline.value}° at address` : ""}. Body rotation also affects this camera view.`;
    if (kind === "shoulders") return `Shoulder-line tilt ranges from ${low}° to ${high}° across the ${interval}${baseline ? `; setup was ${baseline.value}°` : ""}. Positive means the lead shoulder is higher, negative means lower.`;
    if (kind === "lift" && low * high >= 0) return `The ${hipLabel} sits ${span}% of visible body height ${high <= 0 ? "lower" : "higher"} than at address across the ${interval}.`;
    if (kind === "lift") return `Hip height crosses its address level during the ${interval}. Negative is lower than setup; positive is higher.`;
    if (kind === "hips" || kind === "head") {
      const part = kind === "hips" ? hipLabel : "head";
      if (low < 0 && high > 0) return `The ${part} crosses its address position during the ${interval}. ${reading.unit === "% stance" ? "Negative is toward the trail foot; positive is toward the lead foot." : "Negative is screen left; positive is screen right."}`;
      return reading.unit === "% stance" ? `The ${part} moves ${span}% of stance width toward the ${high <= 0 ? "trail" : "lead"} foot from address across the ${interval}.` : `The ${part} moves ${span}% of visible body height to screen ${high <= 0 ? "left" : "right"} from address across the ${interval}.`;
    }
  }
  if (kind === "torso") {
    if (!baseline || reading.phase === "address") return `The torso leans ${amount}° from vertical in this view. This is the starting posture used for comparison.`;
    const change = rounded(reading.value - baseline.value);
    return `The visible torso is ${Math.abs(change)}° ${change >= 0 ? "more inclined" : "closer to vertical"} than at address (${baseline.value}°). Body rotation also affects this camera view.`;
  }
  if (kind === "shoulders") return `The lead shoulder is ${reading.value >= 0 ? "higher" : "lower"} than the trail shoulder in the picture. The shoulder line slopes by ${amount}°${baseline && reading.phase !== "address" ? `, compared with ${baseline.value}° at address` : " at setup"}.`;
  if (kind === "lift") return `The ${hipLabel} sits ${amount}% of visible body height ${reading.value >= 0 ? "higher" : "lower"} than at address.`;
  if ((kind === "hips" || kind === "head") && reading.unit === "% stance") {
    return `The ${kind === "hips" ? "hip centre" : "head"} moved ${amount}% of stance width toward the ${reading.value >= 0 ? "lead" : "trail"} foot from address${kind === "hips" ? ". This shows position, not foot pressure" : ""}.`;
  }
  if (kind === "hips" || kind === "head") return `The ${kind === "hips" ? hipLabel : "head"} moved ${amount}% of visible body height to screen ${reading.value >= 0 ? "right" : "left"} from address. Use the overlay to relate this direction to the ball.`;
  return reading.note;
}

/** All geometry below is projected x/y. No inferred depth, inches or 3D turn. */
export function analyseMotion(
  input: PoseFrame[], aspect: number, view: MotionView, handedness: "right" | "left" = "right", override?: SwingPhases | null,
): MotionReport {
  const frames = trustworthyFrames(input, aspect, view);
  const { hips, shoulders, feet, head, visibleBody } = motionGeometry(frames, aspect, view);
  const automatic = override === undefined ? findAutomaticTiming(frames, aspect, view) : null;
  const phases = override === undefined ? automatic?.phases ?? null : override;
  const validPhases = phases && Number.isInteger(phases.address) && Number.isInteger(phases.top) &&
    Number.isInteger(phases.impact) && phases.address >= 0 && phases.address < phases.top &&
    phases.top < phases.impact && phases.impact < frames.length;
  // Idle footage and the finish do not supply evidence for the scored swing.
  // Judge coverage over the same address-to-impact window as the readings.
  const window = validPhases ? frames.slice(phases.address, phases.impact + 1) : frames;
  const visible = window.filter(visibleBody).length;
  const coverage = window.length ? visible / window.length : 0;
  const report: MotionReport = {
    view, usable: false, phases, timing: override ? { source: "marked", uncertainty: 0 } : automatic?.timing ?? null,
    quality: { visible, total: window.length, coverage, cameraStable: false, largestGap: 0 },
    readings: [], observations: [], warnings: [], tempo: null,
    summary: "A complete swing with clearly visible shoulders, hips and hands is needed. Trim to one swing and keep the whole body in view.",
  };
  const hiddenHands = frames.filter((frame) => !hands(frame, aspect)).length;
  if (hiddenHands > frames.length * 0.05) report.warnings.push(`The hands are hidden or unclear in ${hiddenHands} of ${frames.length} samples. Hidden joints and unsupported arm angles are omitted; the overlay does not fill them in.`);
  if (coverage >= 0.65 && !validPhases) report.summary = `Tracked the body in ${visible} of ${window.length} samples, but could not identify a complete swing. Record one full swing in slow motion, from setup through the finish, with your hands visible.`;
  if (!(aspect > 0) || coverage < 0.65 || !phases || !validPhases) return report;
  const address = frames[phases.address]!;
  const body = median(window.flatMap((frame) => {
    const h = head(frame), foot = feet(frame, aspect);
    return h && foot ? [Math.abs(foot.y - h.y)] : [];
  }));
  if (!body || body < 0.1) return report;
  const gaps = window.slice(1).map((frame, index) => frame.t - window[index]!.t);
  report.quality.largestGap = Math.max(0, ...gaps);
  report.quality.cameraStable = hasStableFoot(window, address, aspect, body);
  if (!report.quality.cameraStable) report.warnings.push("The feet or camera moved, or the image scale changed. Body displacement is withheld; keep the camera fixed and the feet visible.");
  if (report.quality.largestGap > 0.12) report.warnings.push("There are gaps in the sampled swing. A recording with more frames will give better timing.");
  if (report.timing?.topWindow) report.warnings.push("The hands briefly disappear around the top. The backswing transition is estimated between the visible rising and descending hands; its body readings show the range across that interval.");
  const lead = handedness === "right" ? "left" : "right";
  const leadShoulder = lead === "left" ? LM.leftShoulder : LM.rightShoulder;
  const leadElbow = lead === "left" ? 13 : 14;
  const leadWrist = lead === "left" ? LM.leftWrist : LM.rightWrist;
  const leftFoot = at(address, LM.leftAnkle, aspect), rightFoot = at(address, LM.rightAnkle, aspect);
  const stance = leftFoot && rightFoot ? Math.abs(leftFoot.x - rightFoot.x) : 0;
  const direction = leftFoot && rightFoot ? Math.sign((handedness === "right" ? leftFoot.x - rightFoot.x : rightFoot.x - leftFoot.x)) : 0;
  const referenceHip = hips(address, aspect), referenceHead = head(address);
  let unstablePosition = false;
  function record(id: string, label: string, phase: keyof SwingPhases, value: number | null, unit: MotionReading["unit"], note: string) {
    if (value !== null && Number.isFinite(value)) report.readings.push({ id, label, phase, value: rounded(value), unit, note, time: frames[phases![phase]]!.t });
  }
  function observed(id: string, label: string, phase: keyof SwingPhases, measure: (frame: PoseFrame) => number | null, unit: MotionReading["unit"], note: string) {
    const value = measure(frames[phases![phase]]!);
    const bounds = phase === "top" ? report.timing?.topWindow : phase === "impact" ? report.timing?.impactWindow : undefined;
    const samples = bounds ? frames.slice(bounds[0], bounds[1] + 1) : [frames[phases![phase]]!];
    if (unit !== "° in picture" && !hasStableFoot(window, address, aspect, body!, samples)) {
      unstablePosition = true;
      return;
    }
    // Every sampled position in an automatic contact/transition bracket must
    // support the reading. Dropping hidden endpoints would narrow its range.
    const measured = bounds ? samples.map(measure) : null;
    const values = measured?.filter((v): v is number => v !== null && Number.isFinite(v));
    if (measured && values?.length !== measured.length) return;
    record(id, label, phase, value, unit, note);
    if (value === null || !values) return;
    const reading = report.readings.at(-1);
    if (reading && values.length) reading.range = [rounded(Math.min(...values)), rounded(Math.max(...values))];
  }
  for (const phase of ["address", "top", "impact"] as const) {
    const frame = frames[phases[phase]]!;
    observed(`torso_${phase}`, "Torso inclination", phase, (sample) => {
      const h = hips(sample, aspect), s = shoulders(sample, aspect);
      return h && s && distance(h, s) > body * 0.1 ? Math.atan2(Math.abs(s.x - h.x), h.y - s.y) * 180 / Math.PI : null;
    },
    "° in picture", "Angle to vertical in this camera view. This is not a 3D spine bend or rotation.");
    if (view !== "down_the_line") observed(`shoulders_${phase}`, "Shoulder line tilt", phase, (sample) => {
      const l = at(sample, leadShoulder, aspect), r = at(sample, lead === "left" ? LM.rightShoulder : LM.leftShoulder, aspect);
      return l && r && Math.abs(l.x - r.x) > body * 0.04 ? Math.atan2(r.y - l.y, Math.abs(r.x - l.x)) * 180 / Math.PI : null;
    }, "° in picture", "Positive means the lead shoulder is higher in the picture; negative means lower. This describes tilt, not chest rotation.");
    const a = at(frame, leadShoulder, aspect), b = at(frame, leadElbow, aspect), c = at(frame, leadWrist, aspect);
    const ab = a && b ? distance(a, b) : 0, bc = b && c ? distance(b, c) : 0;
    record(`arm_${phase}`, "Lead elbow angle", phase, a && b && c && ab > body * 0.05 && bc > body * 0.05 ?
      Math.acos(Math.max(-1, Math.min(1, ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (ab * bc)))) * 180 / Math.PI : null,
    "° in picture", "Projected shoulder–elbow–wrist angle; a limb pointing at the camera can appear shorter or more bent.");
    if (phase === "address" || !report.quality.cameraStable) continue;
    observed(`lift_${phase}`, "Hip height change", phase, (sample) => { const h = hips(sample, aspect); return h && referenceHip ? (referenceHip.y - h.y) / body * 100 : null; },
      "% body height", "Positive means higher than address. Scaled to visible head-to-ankle height in the picture, not inches.");
    if (view === "face_on" && stance > body * 0.12 && direction) {
      observed(`hips_${phase}`, "Hip shift along target", phase, (sample) => { const h = hips(sample, aspect); return h && referenceHip ? (h.x - referenceHip.x) * direction / stance * 100 : null; },
        "% stance", "Positive is toward the lead foot; negative is toward the trail foot. Position cannot measure weight or pressure.");
      observed(`head_${phase}`, "Head shift along target", phase, (sample) => { const h = at(sample, LM.nose, aspect); return h && referenceHead ? (h.x - referenceHead.x) * direction / stance * 100 : null; },
        "% stance", "Nose position relative to address, scaled to the width of the stance in this picture.");
    } else {
      observed(`hips_${phase}`, "Hip movement across picture", phase, (sample) => { const h = hips(sample, aspect); return h && referenceHip ? (h.x - referenceHip.x) / body * 100 : null; },
        "% body height", "Positive is screen right, negative is screen left. Check the overlay to see which direction faces the ball.");
      observed(`head_${phase}`, "Head movement across picture", phase, (sample) => { const h = head(sample); return h && referenceHead ? (h.x - referenceHead.x) / body * 100 : null; },
        "% body height", "Head position relative to address. Positive is screen right, negative is screen left.");
    }
  }
  if (unstablePosition) report.warnings.push("A planted foot could not be confirmed at a measured position. Displacement at that position is withheld even when the rest of the recording is stable.");
  const t = (phase: keyof SwingPhases) => frames[phases[phase]]!.t;
  const nearby = (index: number) => Math.max(frames[index]!.t - (frames[index - 1]?.t ?? frames[index]!.t),
    (frames[index + 1]?.t ?? frames[index]!.t) - frames[index]!.t);
  const uncertainty = Math.max(report.timing?.uncertainty ?? 0, nearby(phases.address), nearby(phases.top), nearby(phases.impact));
  if (report.timing) report.timing.uncertainty = uncertainty;
  const backswing = t("top") - t("address"), downswing = t("impact") - t("top");
  // Times are real swing seconds. A real downswing takes about 0.2–0.5 s, so a
  // reading far outside that means the detected playback speed is wrong or the clip ramps its slow motion.
  if (downswing > 0 && (downswing < 0.15 || downswing > 0.6) && uncertainty <= downswing / 2) {
    report.warnings.push(`The downswing measured ${downswing.toFixed(2)}s, outside the usual 0.2–0.5s of a real swing. The detected playback speed may be wrong, or the slow motion speeds up and slows down within the clip. Rhythm may be off; body positions are unaffected.`);
  }
  if (downswing >= uncertainty * 2 && uncertainty <= 0.12 && report.quality.largestGap <= 0.12 &&
      (Boolean(override) || [phases.address, phases.top, phases.impact].every((index) => hands(frames[index]!, aspect)))) {
    // Propagate each event's sample interval jointly: moving the top changes
    // both durations in opposite directions. These are sampling bounds, not
    // calibrated accuracy bounds or proof of ball contact.
    const bounds = (phase: keyof SwingPhases): [number, number] => {
      const index = phases[phase], time = frames[index]!.t;
      const bracket = phase === "top" ? report.timing?.topWindow : phase === "impact" ? report.timing?.impactWindow : undefined;
      return bracket ? [frames[bracket[0]]!.t, frames[bracket[1]]!.t] :
        [(time + (frames[index - 1]?.t ?? time)) / 2, (time + (frames[index + 1]?.t ?? time)) / 2];
    };
    const [a0, a1] = bounds("address"), [t0, t1] = bounds("top"), [i0, i1] = bounds("impact");
    if (t0 > a1 && i0 > t1) report.tempo = { backswing, downswing, ratio: rounded(backswing / downswing), uncertainty,
      ratioRange: [(t0 - a1) / (i1 - t0), (t1 - a0) / (i0 - t1)] };
  }
  if (report.tempo) {
    report.observations.push({ title: "Swing rhythm", detail: `Backswing-to-downswing timing is approximately ${report.tempo.ratio}:1. In real swing time that is ${backswing.toFixed(2)}s back and ${downswing.toFixed(2)}s down, using the playback speed detected for this clip. Contact timing is estimated from the hand path.` });
  }
  const hip = report.readings.find((reading) => reading.id === "hips_impact");
  if (hip) report.observations.push({ title: "Hip movement", detail: view === "face_on" ?
    `At the impact marker, the hip centre is ${Math.abs(hip.value)}% of stance width ${hip.value < 0 ? "toward the trail foot" : "toward the lead foot"} from address. Compare the green hip line with the dashed address guide; this does not establish pressure transfer or a swing fault.` :
    `At the impact marker, the ${view === "down_the_line" ? "tracked hip" : "hip centre"} moved ${Math.abs(hip.value)}% of visible body height to screen ${hip.value < 0 ? "left" : "right"}. Compare the green hip guide against address to review whether the body moved toward the ball.` });
  const torsoAddress = report.readings.find((reading) => reading.id === "torso_address"), torsoImpact = report.readings.find((reading) => reading.id === "torso_impact");
  if (torsoAddress && torsoImpact) report.observations.push({ title: "Posture through the swing", detail: `Torso inclination in the picture changes from ${torsoAddress.value}° at address to ${torsoImpact.value}° at the impact marker. Review the orange shoulder line and green hips together. Turning changes this projected angle, so it is not a diagnosis of early extension.` });
  report.usable = report.readings.length > 0;
  report.summary = report.usable ? `Analyzed ${view === "down_the_line" ? "visible side posture and body movement" : "visible posture, shoulder tilt and body movement"} across ${frames.length} samples. ${override ? "Using the previously saved swing positions." : "Swing positions are detected automatically."} Movement is compared with your own address position.` : report.summary;
  return report;
}

/** Match a decoded video time without bridging a tracking gap. */
export function frameAtTime(frames: PoseFrame[], time: number): PoseFrame | null {
  if (!frames.length || time < frames[0]!.t - 0.05 || time > frames.at(-1)!.t + 0.05) return null;
  const frame = frames.reduce((best, candidate) => Math.abs(candidate.t - time) < Math.abs(best.t - time) ? candidate : best);
  return Math.abs(frame.t - time) <= 0.06 ? frame : null;
}

/** Render between nearby observed frames only. This does not change the
 * samples used for measurements, and never reveals a hidden endpoint joint. */
export function overlayFrameAtTime(frames: PoseFrame[], time: number): PoseFrame | null {
  if (!Number.isFinite(time) || !frames.length) return null;
  const afterIndex = frames.findIndex((frame) => frame.t >= time);
  const after = frames[afterIndex], before = frames[afterIndex - 1];
  if (after && Math.abs(after.t - time) < 0.0001) return after;
  if (before?.imageLandmarks && after?.imageLandmarks && after.t - before.t <= 0.05) {
    const fraction = (time - before.t) / (after.t - before.t);
    return { ...before, t: time, imageLandmarks: before.imageLandmarks.map((point, joint) => {
      const next = after.imageLandmarks![joint];
      if (!visiblePoint(point) || !visiblePoint(next)) return { ...point, visibility: 0 };
      return { ...point, x: point.x + (next.x - point.x) * fraction,
        y: point.y + (next.y - point.y) * fraction,
        visibility: Math.min(point.visibility!, next.visibility!) };
    }) };
  }
  const nearest = frameAtTime(frames, time);
  // Do not leave a fast-moving wrist attached to a picture up to 60 ms away.
  return nearest && Math.abs(nearest.t - time) <= 0.02 ? nearest : null;
}
