import type { SwingPhase } from "./swing-metrics";

/**
 * Turning a pose skeleton into the twelve swing positions.
 *
 * The detector hands back 33 landmarks per frame in metres, with the origin
 * between the hips. That is a body in the camera's frame of reference, which
 * is not the frame golf is described in: "sway" means along the target line
 * and "thrust" means toward the ball, and neither is an axis the camera knows
 * about.
 *
 * So the first thing here builds a golf frame out of the player's own address
 * pose - vertical from the spine, the target line from the stance, toward the
 * ball from where the toes point. Everything else is measured in that frame.
 * The payoff is that nothing depends on which way the camera was facing, on
 * the detector's axis conventions, or on whether the player is left-handed:
 * get the address frame right and a down-the-line clip and a face-on clip of
 * the same swing produce the same numbers.
 *
 * What this cannot fix is depth. One camera estimates the axis pointing away
 * from it by inference, so the rotations that depend on it are the softest
 * numbers here. That is why nothing written from this claims to be measured:
 * it is stored as `pose` with a ceiling on its confidence, below a value a
 * person typed in and above a value a model guessed by eye.
 */

export type Landmark = { x: number; y: number; z: number; visibility?: number };

/** One sampled frame of the clip, in seconds from the start of the video. */
export type PoseFrame = { t: number; landmarks: Landmark[] };

/** The landmarks this module reads, by their index in the detector's output. */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

const METRES_TO_INCHES = 39.3701;

/**
 * A skeleton read from one camera is a real measurement of an estimated body.
 * It beats a guess by eye and it is not what a capture rig would give, so its
 * confidence stops here however sure the detector is that it saw the landmark.
 */
export const POSE_CONFIDENCE_CAP = 0.8;
const DEG = 180 / Math.PI;

/** Landmarks below this are guesses about a limb the detector could not see. */
const MIN_VISIBILITY = 0.5;

type Vec = { x: number; y: number; z: number };

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const mid = (a: Vec, b: Vec): Vec => scale(add(a, b), 0.5);
const length = (a: Vec): number => Math.sqrt(dot(a, a));

const cross = (a: Vec, b: Vec): Vec => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

function unit(a: Vec): Vec {
  const len = length(a);
  return len < 1e-9 ? { x: 0, y: 0, z: 0 } : scale(a, 1 / len);
}

/** Drop the component along `axis`, leaving the part in the plane. */
function flatten(a: Vec, axis: Vec): Vec {
  return sub(a, scale(axis, dot(a, axis)));
}

/** Signed angle from `a` to `b` around `axis`, in degrees. */
function signedAngle(a: Vec, b: Vec, axis: Vec): number {
  const flatA = unit(flatten(a, axis));
  const flatB = unit(flatten(b, axis));
  const angle = Math.atan2(dot(cross(flatA, flatB), axis), dot(flatA, flatB));
  return angle * DEG;
}

/**
 * The player's own axes, built from the address pose.
 *
 * `up` comes from the spine rather than from an assumed world axis, `target`
 * from the line the feet stand on, and `ballward` from where the toes point.
 * All three are orthogonal by construction.
 */
export type GolfFrame = { up: Vec; target: Vec; ballward: Vec; origin: Vec };

export function golfFrame(frame: PoseFrame, handedness: "right" | "left"): GolfFrame | null {
  const at = (index: number) => frame.landmarks[index];
  const hipL = at(LM.leftHip);
  const hipR = at(LM.rightHip);
  const shoulderL = at(LM.leftShoulder);
  const shoulderR = at(LM.rightShoulder);
  const ankleL = at(LM.leftAnkle);
  const ankleR = at(LM.rightAnkle);
  const heelL = at(LM.leftHeel);
  const heelR = at(LM.rightHeel);
  const toeL = at(LM.leftFootIndex);
  const toeR = at(LM.rightFootIndex);
  if (!hipL || !hipR || !shoulderL || !shoulderR || !ankleL || !ankleR) return null;
  if (!heelL || !heelR || !toeL || !toeR) return null;

  const hips = mid(hipL, hipR);
  const shoulders = mid(shoulderL, shoulderR);

  /*
    Up is the spine, which leans forward at address by the bend angle. Bend is
    measured against true vertical, so taking the spine as "up" would define
    it to zero. The stance gives a better vertical: the feet are on the
    ground, the hips are above them, so hips-minus-feet is vertical to within
    the width of a stance.
  */
  const feet = mid(ankleL, ankleR);
  const up = unit(sub(hips, feet));
  if (length(up) < 0.5) return null;

  // The stance line runs through the ankles and is parallel to the target line.
  const lead = handedness === "right" ? ankleL : ankleR;
  const trail = handedness === "right" ? ankleR : ankleL;
  const target = unit(flatten(sub(lead, trail), up));
  if (length(target) < 0.5) return null;

  // Toes point at the ball, so heel-to-toe is the ball-ward direction.
  const toes = mid(toeL, toeR);
  const heels = mid(heelL, heelR);
  const facing = flatten(sub(toes, heels), up);
  // Keep the frame orthogonal: take the sign of the toe direction only.
  const side = cross(up, target);
  const ballward = unit(scale(side, Math.sign(dot(side, facing)) || 1));
  if (length(ballward) < 0.5) return null;

  return { up, target, ballward, origin: hips };
}

/** Where a point sits in the player's frame, in metres. */
function inFrame(frame: GolfFrame, point: Vec): Vec {
  const rel = sub(point, frame.origin);
  return {
    x: dot(rel, frame.target),
    y: dot(rel, frame.up),
    z: dot(rel, frame.ballward),
  };
}

export type SwingPhases = { address: number; top: number; impact: number };

/**
 * Find the three frames the diagnostic is about.
 *
 * The top is where the chest has turned furthest from address, which is a
 * clearer signal than club position and needs no club detection. Address is
 * the lowest the hands sit before that, and impact is where they come back
 * through that height on the way down - the first crossing, so the
 * follow-through cannot be mistaken for it.
 */
export function findPhases(frames: PoseFrame[], handedness: "right" | "left"): SwingPhases | null {
  if (frames.length < 3) return null;

  const first = frames[0];
  if (!first) return null;
  const startFrame = golfFrame(first, handedness);
  if (!startFrame) return null;

  const handHeight = (frame: PoseFrame): number | null => {
    const wristL = frame.landmarks[LM.leftWrist];
    const wristR = frame.landmarks[LM.rightWrist];
    if (!wristL || !wristR) return null;
    return inFrame(startFrame, mid(wristL, wristR)).y;
  };

  const chestTurn = (frame: PoseFrame): number | null => {
    const shoulderL = frame.landmarks[LM.leftShoulder];
    const shoulderR = frame.landmarks[LM.rightShoulder];
    const baseL = first.landmarks[LM.leftShoulder];
    const baseR = first.landmarks[LM.rightShoulder];
    if (!shoulderL || !shoulderR || !baseL || !baseR) return null;
    return Math.abs(
      signedAngle(sub(baseL, baseR), sub(shoulderL, shoulderR), startFrame.up),
    );
  };

  let top = -1;
  let topTurn = -Infinity;
  for (let index = 0; index < frames.length; index += 1) {
    const turn = chestTurn(frames[index]!);
    if (turn !== null && turn > topTurn) {
      topTurn = turn;
      top = index;
    }
  }
  if (top < 1) return null;

  // Address: the lowest the hands get before the backswing.
  let address = 0;
  let lowest = Infinity;
  for (let index = 0; index <= top; index += 1) {
    const height = handHeight(frames[index]!);
    if (height !== null && height < lowest) {
      lowest = height;
      address = index;
    }
  }

  const addressHeight = handHeight(frames[address]!);
  if (addressHeight === null) return null;

  /*
    Impact: the first frame after the top where the hands have come back down
    to the height they started at. Scanning for the first crossing rather than
    the closest match keeps the follow-through, which passes through the same
    height going up, from winning.
  */
  let impact = -1;
  for (let index = top + 1; index < frames.length; index += 1) {
    const height = handHeight(frames[index]!);
    if (height !== null && height <= addressHeight) {
      impact = index;
      break;
    }
  }
  // A clip cut before impact still has a lowest point after the top.
  if (impact === -1) {
    let closest = Infinity;
    for (let index = top + 1; index < frames.length; index += 1) {
      const height = handHeight(frames[index]!);
      if (height === null) continue;
      const gap = Math.abs(height - addressHeight);
      if (gap < closest) {
        closest = gap;
        impact = index;
      }
    }
  }
  if (impact === -1) return null;

  return { address, top, impact };
}

export type PoseReading = {
  metric: string;
  value: number;
  /** Mean visibility of the landmarks the value was read from, 0-1. */
  confidence: number;
};

export type PoseAnalysis = {
  phases: SwingPhases;
  readings: PoseReading[];
  /** Metric ids that were skipped because the landmarks were not visible. */
  skipped: string[];
};

function visibility(frame: PoseFrame, indices: number[]): number {
  const values = indices.map((index) => frame.landmarks[index]?.visibility ?? 1);
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

/**
 * Read the twelve positions.
 *
 * Signs follow the reference bands rather than any one convention, and the two
 * sway metrics are deliberately opposite: at the top a positive number means
 * the pelvis has moved away from the target, at impact it means the pelvis has
 * moved toward it. That is how the bands are written, and a number that
 * disagrees with its own band is worse than no number.
 */
export function analysePose(
  frames: PoseFrame[],
  handedness: "right" | "left" = "right",
): PoseAnalysis | null {
  const phases = findPhases(frames, handedness);
  if (!phases) return null;

  const addressFrame = frames[phases.address];
  const topFrame = frames[phases.top];
  const impactFrame = frames[phases.impact];
  if (!addressFrame || !topFrame || !impactFrame) return null;

  const base = golfFrame(addressFrame, handedness);
  if (!base) return null;

  const readings: PoseReading[] = [];
  const skipped: string[] = [];

  const push = (
    metric: string,
    frame: PoseFrame,
    indices: number[],
    compute: () => number | null,
  ) => {
    const seen = visibility(frame, indices);
    const value = seen >= MIN_VISIBILITY ? compute() : null;
    if (value === null || !Number.isFinite(value)) {
      skipped.push(metric);
      return;
    }
    readings.push({ metric, value: Math.round(value * 10) / 10, confidence: seen });
  };

  const at = (frame: PoseFrame, index: number): Vec | null => frame.landmarks[index] ?? null;

  const hipCentre = (frame: PoseFrame): Vec | null => {
    const left = at(frame, LM.leftHip);
    const right = at(frame, LM.rightHip);
    return left && right ? mid(left, right) : null;
  };
  const shoulderCentre = (frame: PoseFrame): Vec | null => {
    const left = at(frame, LM.leftShoulder);
    const right = at(frame, LM.rightShoulder);
    return left && right ? mid(left, right) : null;
  };
  const kneeCentre = (frame: PoseFrame): Vec | null => {
    const left = at(frame, LM.leftKnee);
    const right = at(frame, LM.rightKnee);
    return left && right ? mid(left, right) : null;
  };

  /** Rotation about vertical of a left-right body line, against address. */
  const turn = (frame: PoseFrame, leftIndex: number, rightIndex: number): number | null => {
    const left = at(frame, leftIndex);
    const right = at(frame, rightIndex);
    const baseLeft = at(addressFrame, leftIndex);
    const baseRight = at(addressFrame, rightIndex);
    if (!left || !right || !baseLeft || !baseRight) return null;
    const turned = signedAngle(sub(baseLeft, baseRight), sub(left, right), base.up);
    // Positive is rotation away from the target for a right-hander, which is
    // the direction the shoulders travel in the backswing.
    return handedness === "right" ? -turned : turned;
  };

  /** Displacement of a point from its address position, in inches. */
  const shift = (frame: PoseFrame, point: Vec | null, basePoint: Vec | null) => {
    if (!point || !basePoint) return null;
    const now = inFrame(base, point);
    const then = inFrame(base, basePoint);
    return { along: (now.x - then.x) * METRES_TO_INCHES, up: (now.y - then.y) * METRES_TO_INCHES, ball: (now.z - then.z) * METRES_TO_INCHES };
  };

  // -- address ------------------------------------------------------------
  push("chest_bend_address", addressFrame, [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip], () => {
    const hips = hipCentre(addressFrame);
    const shoulders = shoulderCentre(addressFrame);
    if (!hips || !shoulders) return null;
    const spine = sub(shoulders, hips);
    // Angle between the spine and vertical: 0 is standing straight up.
    return Math.acos(Math.min(1, Math.max(-1, dot(unit(spine), base.up)))) * DEG;
  });

  push("pelvis_bend_address", addressFrame, [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee], () => {
    const hips = hipCentre(addressFrame);
    const knees = kneeCentre(addressFrame);
    if (!hips || !knees) return null;
    /*
      ponytail: the femur line stands in for the pelvis, because two hip
      points cannot give the tilt of a plane on their own. It moves the right
      way and by roughly the right amount; a third pelvis point, which a
      denser model would provide, would make it a measurement rather than a
      stand-in.
    */
    const thigh = sub(hips, knees);
    return Math.acos(Math.min(1, Math.max(-1, dot(unit(thigh), base.up)))) * DEG;
  });

  // -- top of the backswing ----------------------------------------------
  push("pelvis_turn_top", topFrame, [LM.leftHip, LM.rightHip], () =>
    turn(topFrame, LM.leftHip, LM.rightHip),
  );
  push("chest_turn_top", topFrame, [LM.leftShoulder, LM.rightShoulder], () =>
    turn(topFrame, LM.leftShoulder, LM.rightShoulder),
  );

  push("pelvis_sway_top", topFrame, [LM.leftHip, LM.rightHip], () => {
    const moved = shift(topFrame, hipCentre(topFrame), hipCentre(addressFrame));
    // Positive means away from the target, which is the band's "sliding away".
    return moved ? -moved.along : null;
  });

  push("pelvis_lift_top", topFrame, [LM.leftHip, LM.rightHip], () => {
    const moved = shift(topFrame, hipCentre(topFrame), hipCentre(addressFrame));
    return moved ? moved.up : null;
  });

  push("chest_side_bend_top", topFrame, [LM.leftShoulder, LM.rightShoulder], () => {
    const left = at(topFrame, LM.leftShoulder);
    const right = at(topFrame, LM.rightShoulder);
    if (!left || !right) return null;
    // How far the shoulder line tilts out of horizontal, whichever way.
    const line = unit(sub(left, right));
    return Math.abs(90 - Math.acos(Math.min(1, Math.max(-1, dot(line, base.up)))) * DEG);
  });

  // -- impact -------------------------------------------------------------
  push("pelvis_turn_impact", impactFrame, [LM.leftHip, LM.rightHip], () => {
    const value = turn(impactFrame, LM.leftHip, LM.rightHip);
    // At impact the pelvis has unwound past address and opened to the target,
    // and the band counts that opening as positive.
    return value === null ? null : -value;
  });

  push("chest_turn_impact", impactFrame, [LM.leftShoulder, LM.rightShoulder], () => {
    const value = turn(impactFrame, LM.leftShoulder, LM.rightShoulder);
    return value === null ? null : -value;
  });

  push("pelvis_sway_impact", impactFrame, [LM.leftHip, LM.rightHip], () => {
    const moved = shift(impactFrame, hipCentre(impactFrame), hipCentre(addressFrame));
    // Positive means toward the target: the band's "sliding past the ball".
    return moved ? moved.along : null;
  });

  push("pelvis_thrust_impact", impactFrame, [LM.leftHip, LM.rightHip], () => {
    const moved = shift(impactFrame, hipCentre(impactFrame), hipCentre(addressFrame));
    // Positive means toward the ball.
    return moved ? moved.ball : null;
  });

  push("head_sway_impact", impactFrame, [LM.nose], () => {
    const moved = shift(impactFrame, at(impactFrame, LM.nose), at(addressFrame, LM.nose));
    return moved ? moved.along : null;
  });

  return { phases, readings, skipped };
}

/** Phase a metric belongs to, for the row the UI draws. */
export const PHASE_OF: Record<string, SwingPhase> = {
  pelvis_bend_address: "address",
  chest_bend_address: "address",
  pelvis_turn_top: "top",
  chest_turn_top: "top",
  pelvis_sway_top: "top",
  pelvis_lift_top: "top",
  chest_side_bend_top: "top",
  pelvis_turn_impact: "impact",
  chest_turn_impact: "impact",
  pelvis_sway_impact: "impact",
  pelvis_thrust_impact: "impact",
  head_sway_impact: "impact",
};
