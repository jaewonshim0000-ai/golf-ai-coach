import { smoothFrames, type Landmark, type PoseFrame, type SwingPhases } from "./pose";

/**
 * A golfer filmed by a simulated phone, for tests.
 *
 * The body is built in golf axes (+x target, +y up, +z toward the ball) with
 * known turns and movements and fixed-length bones, then filmed: projected
 * through a perspective camera into a portrait frame with the image noise a
 * pose model has, and handed over as a detector would - picture points, plus
 * a "world" skeleton pinned between the hips whose depth is squashed and
 * noisy, which is how single-camera depth goes wrong.
 */

type P = { x: number; y: number; z: number };

function random(seed: number) {
  let state = seed >>> 0;
  const uniform = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // Box-Muller.
  return () => Math.sqrt(-2 * Math.log(uniform() + 1e-12)) * Math.cos(2 * Math.PI * uniform());
}

const spin = (p: P, degrees: number): P => {
  const a = (degrees * Math.PI) / 180;
  return { x: p.x * Math.cos(a) - p.z * Math.sin(a), y: p.y, z: p.x * Math.sin(a) + p.z * Math.cos(a) };
};
const add = (a: P, b: P): P => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const lerp = (a: P, b: P, k: number): P => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k });

type Pose = { chest: number; pelvis: number; hands: number; sway: number; lift: number; thrust: number };

const scaleBy = (a: P, k: number): P => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const sub = (a: P, b: P): P => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dotP = (a: P, b: P) => a.x * b.x + a.y * b.y + a.z * b.z;
const unitP = (a: P): P => scaleBy(a, 1 / Math.hypot(a.x, a.y, a.z));

/**
 * Two rigid bones from `root` toward `target`, bending toward `pole`. The end
 * stops short when the target is out of reach, so bone lengths never change -
 * a real body cannot stretch, and a test body that can would be testing the
 * fixture rather than the rebuild.
 */
function limb(root: P, target: P, pole: P, upper: number, lower: number): [P, P] {
  const reach = sub(target, root);
  const d = Math.min(upper + lower - 1e-3, Math.max(Math.abs(upper - lower) + 1e-3, Math.hypot(reach.x, reach.y, reach.z)));
  const u = unitP(reach);
  const v = unitP(sub(pole, scaleBy(u, dotP(pole, u))));
  const angle = Math.acos((upper * upper + d * d - lower * lower) / (2 * upper * d));
  const joint = add(root, add(scaleBy(u, upper * Math.cos(angle)), scaleBy(v, upper * Math.sin(angle))));
  return [joint, add(root, scaleBy(u, d))];
}

/** The golfer's 33 joints in golf axes, every bone a fixed length. */
function body(pose: Pose): P[] {
  const j: P[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
  const hip = { x: pose.sway, y: 0.95 + pose.lift, z: pose.thrust };
  const bend = (34 * Math.PI) / 180;
  const chest = add(hip, { x: 0, y: 0.5 * Math.cos(bend), z: 0.5 * Math.sin(bend) });

  j[23] = add(hip, spin({ x: 0.13, y: 0, z: 0 }, pose.pelvis));
  j[24] = add(hip, spin({ x: -0.13, y: 0, z: 0 }, pose.pelvis));
  j[11] = add(chest, spin({ x: 0.19, y: 0, z: 0 }, pose.chest));
  j[12] = add(chest, spin({ x: -0.19, y: 0, z: 0 }, pose.chest));

  j[0] = add(chest, { x: 0, y: 0.22, z: 0.12 });
  for (let k = 1; k <= 10; k += 1) j[k] = add(j[0]!, { x: (k % 2 ? 1 : -1) * 0.07, y: 0.02, z: -0.08 });

  // Hands swing on an arc round the body with the chest; elbows point down.
  const hands = add(hip, spin({ x: 0, y: -0.1 + pose.hands, z: 0.5 }, pose.chest * 1.15));
  [j[13], j[15]] = limb(j[11]!, add(hands, { x: 0.03, y: 0, z: 0 }), { x: 0, y: -1, z: 0.2 }, 0.29, 0.26);
  [j[14], j[16]] = limb(j[12]!, add(hands, { x: -0.03, y: 0, z: 0 }), { x: 0, y: -1, z: 0.2 }, 0.29, 0.26);
  for (const [finger, wrist] of [[17, 15], [19, 15], [21, 15], [18, 16], [20, 16], [22, 16]] as const) {
    j[finger] = add(j[wrist]!, { x: 0, y: -0.06, z: 0 });
  }

  // Legs: feet planted, knees flexed toward the ball.
  for (const side of [1, -1]) {
    const [hipJoint, knee, ankle, heel, toe] = side === 1 ? [23, 25, 27, 29, 31] : [24, 26, 28, 30, 32];
    const foot = { x: side * 0.17, y: 0.08, z: 0 };
    [j[knee], j[ankle]] = limb(j[hipJoint]!, foot, { x: 0, y: 0, z: 1 }, 0.46, 0.44);
    j[heel] = add(j[ankle]!, { x: 0, y: -0.06, z: -0.06 });
    j[toe] = add(j[ankle]!, { x: side * 0.02, y: -0.06, z: 0.15 });
  }
  return j;
}

const KEYS: Pose[] = [
  { chest: 0, pelvis: 0, hands: 0, sway: 0, lift: 0, thrust: 0 }, // address
  { chest: 45, pelvis: 20, hands: 0.45, sway: -0.02, lift: 0.01, thrust: 0 },
  { chest: 92, pelvis: 42, hands: 0.95, sway: -0.05, lift: 0.03, thrust: -0.01 }, // top
  { chest: 40, pelvis: 5, hands: 0.45, sway: 0.03, lift: 0, thrust: 0.02 },
  { chest: -28, pelvis: -38, hands: 0, sway: 0.08, lift: -0.02, thrust: 0.05 }, // impact
  { chest: -95, pelvis: -70, hands: 0.9, sway: 0.1, lift: 0.02, thrust: 0.03 },
];
/**
 * Frames between key positions at 60 frames a second: 0.8 s back, a quarter
 * second down, a 3:1 tempo. The motion runs on a smooth spline through the
 * keys, so the top is rounded as in a real swing rather than a corner.
 */
const SEGMENTS = [24, 24, 9, 6, 15];
export const PHASES: SwingPhases = { address: 0, top: 48, impact: 63 };

function swing(): P[][] {
  const out: P[][] = [];
  const key = (k: number) => KEYS[Math.max(0, Math.min(KEYS.length - 1, k))]!;
  const spline = (k: number, f: number, field: keyof Pose) => {
    // Catmull-Rom through the keys either side.
    const [p0, p1, p2, p3] = [key(k - 1)[field], key(k)[field], key(k + 1)[field], key(k + 2)[field]];
    return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  };
  SEGMENTS.forEach((frames, k) => {
    for (let s = 0; s < frames; s += 1) {
      const f = s / frames;
      out.push(body({
        chest: spline(k, f, "chest"),
        pelvis: spline(k, f, "pelvis"),
        hands: spline(k, f, "hands"),
        sway: spline(k, f, "sway"),
        lift: spline(k, f, "lift"),
        thrust: spline(k, f, "thrust"),
      }));
    }
  });
  out.push(body(KEYS.at(-1)!));
  return out;
}

type Camera = (p: P) => P; // golf axes -> camera axes (x right, y down, z away)
/** A phone at hip height, about 2.5 m away: face on from the ball side, or behind the hands. */
export const FACE_ON: Camera = (p) => ({ x: p.x, y: -(p.y - 1), z: 2.6 - p.z });
export const DOWN_THE_LINE: Camera = (p) => ({ x: p.z - 0.4, y: -(p.y - 1), z: p.x + 2.8 });
/** The same shots from twice as far with 2x zoom: flatter perspective than the rebuild assumes. */
export const zoomed = (camera: Camera): Camera => (p) => {
  const c = camera(p);
  return { ...c, z: c.z + 2.7 };
};

export const ASPECT = 9 / 16; // a phone held upright
export const MAIN_LENS = 0.8; // focal length in picture heights

/** Film the swing: what a detector would hand back, and the true body in camera axes. */
/**
 * What goes wrong with a real detector, per frame before the runner's
 * smoothing: 0.3% of the picture height of jitter on every picture point
 * (about a centimetre), 1 cm on the world skeleton across the picture, 3 cm
 * of depth jitter, depth squashed to 60% and the body drawn 5% too big.
 */
export const DETECTOR = { image: 0.003, world: 0.01, depth: 0.03, squash: 0.6, oversize: 1.05 };

export function film(camera: Camera, seed: number, focal = MAIN_LENS, errors = DETECTOR) {
  const gauss = random(seed);
  const truth: PoseFrame[] = [];
  const detected: PoseFrame[] = [];
  swing().forEach((joints, index) => {
    const t = index / 60;
    const cam = joints.map(camera);
    truth.push({ t, landmarks: cam.map((p) => ({ ...p, visibility: 1 })) });
    const imageLandmarks: Landmark[] = cam.map((p) => ({
      x: 0.5 + (focal * p.x) / p.z / ASPECT + gauss() * errors.image / ASPECT,
      y: 0.5 + (focal * p.y) / p.z + gauss() * errors.image,
      z: 0,
      visibility: 0.95,
    }));
    const hips = { x: (cam[23]!.x + cam[24]!.x) / 2, y: (cam[23]!.y + cam[24]!.y) / 2, z: (cam[23]!.z + cam[24]!.z) / 2 };
    // Pinned between the hips, 5% oversized, depth squashed to 60% and noisy.
    const landmarks: Landmark[] = cam.map((p) => ({
      x: (p.x - hips.x) * errors.oversize + gauss() * errors.world,
      y: (p.y - hips.y) * errors.oversize + gauss() * errors.world,
      z: (p.z - hips.z) * errors.squash + gauss() * errors.depth,
      visibility: 0.95,
    }));
    detected.push({ t, landmarks, imageLandmarks });
  });
  // The runner smooths what the detector returns before anything else sees it.
  return { truth, detected: smoothFrames(detected) };
}

