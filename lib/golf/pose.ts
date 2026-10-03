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
export type PoseFrame = {
  t: number;
  /** Metric 3D landmarks, in metres around the hips. */
  landmarks: Landmark[];
  /** Observed image-space landmarks used for the overlay and projected analysis. */
  imageLandmarks?: Landmark[];
};

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

/**
 * A skeleton read from one camera is a real measurement of an estimated body.
 * It beats a guess by eye and it is not what a capture rig would give, so its
 * confidence stops here however sure the detector is that it saw the landmark.
 */
export const POSE_CONFIDENCE_CAP = 0.8;
const DEG = 180 / Math.PI;

/** Landmarks below this are guesses about a limb the detector could not see. */
const MIN_VISIBILITY = 0.5;

const METRES_TO_INCHES = 39.3701;

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

function imageHandHeight(frame: PoseFrame): number | null {
  const wristL = frame.imageLandmarks?.[LM.leftWrist];
  const wristR = frame.imageLandmarks?.[LM.rightWrist];
  if (!wristL || !wristR) return null;
  if (((wristL.visibility ?? 1) + (wristR.visibility ?? 1)) / 2 < MIN_VISIBILITY) return null;
  return (wristL.y + wristR.y) / 2;
}

/** Find address, top and impact from the visible hand path in the video. */
export function findImagePhases(frames: PoseFrame[]): SwingPhases | null {
  if (frames.length < 6 || frames.filter((frame) => imageHandHeight(frame) !== null).length < 6) {
    return null;
  }

  // Image y grows downward. Address is the lowest hand position early in the
  // clip; restricting it to the first 40% avoids choosing impact later on.
  const addressEnd = Math.max(2, Math.floor(frames.length * 0.4));
  let address = -1;
  let addressHeight = -Infinity;
  for (let index = 0; index <= addressEnd; index += 1) {
    const height = imageHandHeight(frames[index]!);
    if (height !== null && height > addressHeight) {
      addressHeight = height;
      address = index;
    }
  }
  if (address < 0) return null;

  // Follow one complete motion in order: hands rise to the top, then return
  // to their address height at impact. Stopping at that first return matters
  // because the finish can put the hands even higher than the backswing and
  // used to be mistaken for the top.
  let top = -1;
  let topHeight = Infinity;
  let topLocked = false;
  let impact = -1;
  let lowest = -Infinity;
  for (let index = address + 1; index < frames.length; index += 1) {
    const height = imageHandHeight(frames[index]!);
    if (height === null) continue;
    if (!topLocked && height < topHeight) {
      topHeight = height;
      top = index;
    }
    const roseEnough = addressHeight - topHeight >= 0.08;
    if (!topLocked && roseEnough && index > top && height >= topHeight + 0.05) {
      topLocked = true;
    }
    /*
      Impact is the bottom of the hand arc, not the first frame near address
      height: through impact the hands cover a tenth of the picture in a
      frame or two, so a "close enough" test fires early, and at several
      hundred degrees a second two frames early is twenty degrees of turn.
      Follow the hands down, and stop once they are clearly rising into the
      follow-through.
    */
    if (topLocked && index > top) {
      if (height > lowest) {
        lowest = height;
        impact = index;
      }
      if (lowest >= addressHeight - 0.08 && height < lowest - 0.03) break;
    }
  }
  // Hands that never came back down near address height did not reach impact on this clip.
  if (lowest < addressHeight - 0.08) impact = -1;
  if (!topLocked || top <= address || addressHeight - topHeight < 0.08) return null;

  // A clip cut just before impact still uses the closest descending frame.
  if (impact < 0) {
    let closest = Infinity;
    for (let index = top + 1; index < frames.length; index += 1) {
      const height = imageHandHeight(frames[index]!);
      if (height === null) continue;
      const gap = Math.abs(height - addressHeight);
      if (gap < closest) {
        closest = gap;
        impact = index;
      }
    }
  }
  return impact > top ? { address, top, impact } : null;
}

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

  const imagePhases = findImagePhases(frames);
  if (imagePhases) return imagePhases;

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
    const seen = visibility(frame, [LM.leftShoulder, LM.rightShoulder]);
    if (seen < MIN_VISIBILITY) return null;
    const turned = signedAngle(
      sub(baseL, baseR),
      sub(shoulderL, shoulderR),
      startFrame.up,
    );
    // The backswing and follow-through rotate in opposite directions. Keeping
    // the sign stops a large follow-through from being mistaken for the top.
    return handedness === "right" ? -turned : turned;
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

const PLAUSIBLE_POSE_RANGE: Partial<Record<string, [number, number]>> = {
  pelvis_bend_address: [0, 60],
  chest_bend_address: [0, 70],
  pelvis_turn_top: [15, 90],
  chest_turn_top: [55, 130],
  chest_side_bend_top: [0, 35],
  pelvis_turn_impact: [0, 90],
  chest_turn_impact: [0, 100],
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
/**
 * A movement is only measured when the camera can see it: the axis it runs
 * along must lie within about 35 degrees of the picture. Face on, that is
 * sway and lift; down the line, thrust and lift. The rest would be read off
 * the depth the camera cannot see, so they are left out rather than guessed.
 */
const IN_PICTURE = 0.82;

export type AnalyseOptions = {
  /**
   * The frames carry the body's real movement through the picture (they were
   * rebuilt by `liftFrames`), in camera axes with z pointing away from the
   * lens. Detector world landmarks are pinned between the hips and cannot.
   */
  translations?: boolean;
};

export function analysePose(
  frames: PoseFrame[],
  handedness: "right" | "left" = "right",
  phaseOverride?: SwingPhases,
  options: AnalyseOptions = {},
): PoseAnalysis | null {
  const phases = phaseOverride ?? findPhases(frames, handedness);
  if (!phases) return null;

  if (!frames[phases.address] || !frames[phases.top] || !frames[phases.impact]) return null;

  /*
    Each position is read over the frames around its phase, not off one
    frame: the body moves smoothly and the detector's error does not, so the
    median of a few frames either side keeps the position and loses most of
    the noise. The window is in seconds so a densely sampled downswing gets
    several frames and a sparse one still gets its own.
  */
  const around = (index: number, half: number) => {
    const centre = frames[index]!.t;
    return frames.filter((frame, k) => k === index || Math.abs(frame.t - centre) <= half);
  };
  // Address is still, so it is averaged into one steady reference body.
  const addressWindow = around(phases.address, 0.1);
  const addressFrame: PoseFrame = {
    t: frames[phases.address]!.t,
    landmarks: frames[phases.address]!.landmarks.map((_, joint) => {
      const points = addressWindow.map((frame) => frame.landmarks[joint]!);
      const mean = (pick: (point: Landmark) => number) =>
        points.reduce((sum, point) => sum + pick(point), 0) / points.length;
      return {
        x: mean((point) => point.x),
        y: mean((point) => point.y),
        z: mean((point) => point.z),
        visibility: mean((point) => point.visibility ?? 1),
      };
    }),
  };
  const topFrames = around(phases.top, 0.05);
  const impactFrames = around(phases.impact, 0.05);

  const base = golfFrame(addressFrame, handedness);
  if (!base) return null;

  const readings: PoseReading[] = [];
  const skipped: string[] = [];

  const push = (
    metric: string,
    window: PoseFrame[],
    indices: number[],
    compute: (frame: PoseFrame) => number | null,
  ) => {
    const seen = window.reduce((sum, frame) => sum + visibility(frame, indices), 0) / window.length;
    const values = window
      .filter((frame) => visibility(frame, indices) >= MIN_VISIBILITY)
      .map(compute)
      .filter((value): value is number => value !== null && Number.isFinite(value))
      .sort((a, b) => a - b);
    const value =
      seen >= MIN_VISIBILITY && values.length > 0
        ? values.length % 2
          ? values[(values.length - 1) / 2]!
          : (values[values.length / 2 - 1]! + values[values.length / 2]!) / 2
        : null;
    const range = PLAUSIBLE_POSE_RANGE[metric];
    if (
      value === null ||
      !Number.isFinite(value) ||
      (range && (value < range[0] || value > range[1]))
    ) {
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

  /** Movement of a point from address, in inches along one of the golf axes. */
  const moved = (
    metric: string,
    window: PoseFrame[],
    indices: number[],
    point: (frame: PoseFrame) => Vec | null,
    axis: "target" | "up" | "ballward",
    sign: 1 | -1,
  ) => {
    const direction = base[axis];
    if (!options.translations || Math.hypot(direction.x, direction.y) < IN_PICTURE) {
      skipped.push(metric);
      return;
    }
    push(metric, window, indices, (frame) => {
      const now = point(frame);
      const then = point(addressFrame);
      if (!now || !then) return null;
      return sign * dot(sub(now, then), direction) * METRES_TO_INCHES;
    });
  };
  const hips = [LM.leftHip, LM.rightHip];

  // -- address ------------------------------------------------------------
  push("chest_bend_address", [addressFrame], [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip], () => {
    const hips = hipCentre(addressFrame);
    const shoulders = shoulderCentre(addressFrame);
    if (!hips || !shoulders) return null;
    const spine = sub(shoulders, hips);
    // Angle between the spine and vertical: 0 is standing straight up.
    return Math.acos(Math.min(1, Math.max(-1, dot(unit(spine), base.up)))) * DEG;
  });

  push("pelvis_bend_address", [addressFrame], [LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee], () => {
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
  push("pelvis_turn_top", topFrames, [LM.leftHip, LM.rightHip], (frame) => {
    const value = turn(frame, LM.leftHip, LM.rightHip);
    return value === null ? null : Math.abs(value);
  });
  push("chest_turn_top", topFrames, [LM.leftShoulder, LM.rightShoulder], (frame) => {
    const value = turn(frame, LM.leftShoulder, LM.rightShoulder);
    return value === null ? null : Math.abs(value);
  });

  // Positive sway at the top is away from the target: the band's "sliding away".
  moved("pelvis_sway_top", topFrames, hips, hipCentre, "target", -1);
  moved("pelvis_lift_top", topFrames, hips, hipCentre, "up", 1);

  push("chest_side_bend_top", topFrames, [LM.leftShoulder, LM.rightShoulder], (frame) => {
    const left = at(frame, LM.leftShoulder);
    const right = at(frame, LM.rightShoulder);
    if (!left || !right) return null;
    // How far the shoulder line tilts out of horizontal, whichever way.
    const line = unit(sub(left, right));
    return Math.abs(90 - Math.acos(Math.min(1, Math.max(-1, dot(line, base.up)))) * DEG);
  });

  // -- impact -------------------------------------------------------------
  push("pelvis_turn_impact", impactFrames, [LM.leftHip, LM.rightHip], (frame) => {
    const value = turn(frame, LM.leftHip, LM.rightHip);
    // At impact the pelvis has unwound past address and opened to the target,
    // and the band counts that opening as positive.
    return value === null ? null : Math.abs(value);
  });

  push("chest_turn_impact", impactFrames, [LM.leftShoulder, LM.rightShoulder], (frame) => {
    const value = turn(frame, LM.leftShoulder, LM.rightShoulder);
    return value === null ? null : Math.abs(value);
  });

  // Positive sway at impact is toward the target, thrust toward the ball.
  moved("pelvis_sway_impact", impactFrames, hips, hipCentre, "target", 1);
  moved("pelvis_thrust_impact", impactFrames, hips, hipCentre, "ballward", 1);
  moved("head_sway_impact", impactFrames, [LM.nose], (frame) => at(frame, LM.nose), "target", 1);

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

/**
 * A short weighted temporal filter removes the frame-to-frame depth shimmer
 * that a monocular pose model produces without flattening the swing motion.
 */
export function smoothFrames(frames: PoseFrame[]): PoseFrame[] {
  const point = (index: number, joint: number, image: boolean): Landmark | undefined => {
    const source = image ? frames[index]?.imageLandmarks : frames[index]?.landmarks;
    return source?.[joint];
  };
  const filtered = (index: number, joint: number, image: boolean): Landmark => {
    const samples = [
      { at: index - 1, weight: 1 },
      { at: index, weight: 2 },
      { at: index + 1, weight: 1 },
    ]
      .map(({ at, weight }) => ({ value: point(at, joint, image), weight }))
      .filter((sample): sample is { value: Landmark; weight: number } => Boolean(sample.value));
    const total = samples.reduce((sum, sample) => sum + sample.weight, 0);
    return {
      x: samples.reduce((sum, sample) => sum + sample.value.x * sample.weight, 0) / total,
      y: samples.reduce((sum, sample) => sum + sample.value.y * sample.weight, 0) / total,
      z: samples.reduce((sum, sample) => sum + sample.value.z * sample.weight, 0) / total,
      visibility:
        samples.reduce(
          (sum, sample) => sum + (sample.value.visibility ?? 1) * sample.weight,
          0,
        ) / total,
    };
  };

  return frames.map((frame, index) => ({
    t: frame.t,
    landmarks: frame.landmarks.map((_, joint) => filtered(index, joint, false)),
    imageLandmarks: frame.imageLandmarks?.map((_, joint) => filtered(index, joint, true)),
  }));
}

/**
 * A sampled swing. Legacy entries have estimated world-coordinate skeletons;
 * new motion entries retain projected image coordinates with decoded frame
 * timestamps. The repository compacts image data for the existing JSONB limit.
 */
export type PackedLandmark = [number, number, number, number];

export type PoseModel = {
  v: 1;
  handedness: "right" | "left";
  phases: SwingPhases;
  /** Seconds from the start of the video, one per frame. */
  t: number[];
  frames: PackedLandmark[][];
  /** Normalized image landmarks may accompany a fresh browser analysis. */
  imageFrames?: PackedLandmark[][];
  /** Storage-only encoding of projected x/y/visibility; expanded by the repository. */
  imageData?: string;
  /** Original video shape and view for projected movement analysis. */
  aspect?: number;
  cameraAngle?: "face_on" | "down_the_line" | "other";
  motionVersion?: 1;
  phasesConfirmed?: boolean;
  timingStatus?: "unresolved" | "estimated" | "confirmed";
  clip?: [number, number];
  /**
   * The frames were rebuilt from the picture (`liftFrames`): they move with
   * the body and are in camera axes, so movement can be measured on them.
   */
  lifted?: boolean;
};

const mm = (value: number) => Math.round(value * 1000) / 1000;

export function packFrames(frames: PoseFrame[]): {
  t: number[];
  frames: PackedLandmark[][];
  imageFrames?: PackedLandmark[][];
} {
  const pack = (landmarks: Landmark[]): PackedLandmark[] =>
    landmarks.map(
      (point): PackedLandmark => [
        mm(point.x),
        mm(point.y),
        mm(point.z),
        Math.round((point.visibility ?? 1) * 100) / 100,
      ],
    );
  const imageFrames = frames.every((frame) => frame.imageLandmarks?.length === 33)
    ? frames.map((frame) => frame.imageLandmarks!.map((point): PackedLandmark => [
      Math.round(point.x * 100000) / 100000,
      Math.round(point.y * 100000) / 100000,
      mm(point.z),
      Math.round((point.visibility ?? 0) * 1000) / 1000,
    ]))
    : undefined;
  return {
    // Keep decoded frame boundaries exact. Rounding down can seek to the
    // previous frame when the saved sample is replayed.
    t: frames.map((frame) => frame.t),
    frames: frames.map((frame) => pack(frame.landmarks)),
    ...(imageFrames ? { imageFrames } : {}),
  };
}

export function unpackFrames(packed: {
  t: number[];
  frames: PackedLandmark[][];
  imageFrames?: PackedLandmark[][];
}): PoseFrame[] {
  return packed.t.map((t, index) => ({
    t,
    landmarks: (packed.frames[index] ?? []).map(([x, y, z, visibility]) => ({ x, y, z, visibility })),
    imageLandmarks: packed.imageFrames?.[index]?.map(([x, y, z, visibility]) => ({
      x, y, z, visibility,
    })),
  }));
}

/**
 * Where to draw the model: metres in the player's own frame, with the origin
 * on the ground under the address hips. x runs down the target line, y is up,
 * and z completes a right-handed set, so a left-hander is drawn as a
 * left-hander rather than a mirror image of one. `ballSide` says which way
 * along z the ball is.
 */
export function modelSpace(
  address: PoseFrame,
  handedness: "right" | "left",
): { toModel: (point: Vec) => Vec; ballSide: 1 | -1 } | null {
  const frame = golfFrame(address, handedness);
  if (!frame) return null;
  const depth = cross(frame.target, frame.up);
  const feet = [LM.leftHeel, LM.rightHeel, LM.leftFootIndex, LM.rightFootIndex]
    .map((index) => address.landmarks[index])
    .filter((point): point is Landmark => Boolean(point))
    .map((point) => dot(sub(point, frame.origin), frame.up));
  const ground = feet.length ? Math.min(...feet) : 0;
  return {
    toModel: (point) => {
      const rel = sub(point, frame.origin);
      return { x: dot(rel, frame.target), y: dot(rel, frame.up) - ground, z: dot(rel, depth) };
    },
    ballSide: dot(frame.ballward, depth) >= 0 ? 1 : -1,
  };
}
