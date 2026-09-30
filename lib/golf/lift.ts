import { LM, type Landmark, type PoseFrame } from "./pose";

/**
 * Rebuilding the 3D body from what the camera actually saw.
 *
 * The detector returns two skeletons per frame. The image one is where each
 * joint sits in the picture - its most accurate output, because that is what
 * it is trained to find. The "world" one is a metric 3D guess, re-centred
 * between the hips every frame, with depth it has to infer. Using the world
 * skeleton alone gives a body that never moves off its hips and whose depth
 * is both noisy and, typically, squashed.
 *
 * So the model is rebuilt bone by bone from the pelvis outwards:
 *
 * - The in-picture part of every bone comes from the image, back-projected
 *   through a phone lens, so the body moves through the frame as it really
 *   did and the near shoulder no longer looks lower than the far one.
 * - The detector's depth is re-scaled by one gain per clip, fitted so that
 *   rigid bones keep one length while they rotate. Squashed depth makes a
 *   forearm "shrink" as it turns toward the lens; the gain that stops that is
 *   the gain that makes the depth right.
 * - Each bone keeps one length for the whole clip, so limbs cannot stretch.
 * - A bone of known length whose picture is short must point toward or away
 *   from the lens by exactly sqrt(L^2 - l^2) (Taylor, 2000). That is precise
 *   when the bone points well out of the picture and badly conditioned when it
 *   lies nearly flat in it, so it is blended with the re-scaled detector depth,
 *   each weighted by the error it is likely to carry on this clip - measured
 *   from the clip's own jitter. The detector always decides which way.
 *
 * ponytail: the lens is assumed to be a phone's main camera (vertical field
 * of view about 64 degrees upright, 42 on its side). A clip shot zoomed in is
 * corrected more than it needs; the error that leaves is smaller than the
 * uncorrected perspective error, and a lens reading from the video's metadata
 * would remove it.
 */

type V3 = { x: number; y: number; z: number };

const ROOT = 33; // between the hips
const CHEST = 34; // between the shoulders

/** Parent before child, so every parent is placed before it is needed. */
const BONES: [number, number][] = [
  [ROOT, LM.leftHip],
  [ROOT, LM.rightHip],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.leftAnkle, LM.leftHeel],
  [LM.leftAnkle, LM.leftFootIndex],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
  [LM.rightAnkle, LM.rightHeel],
  [LM.rightAnkle, LM.rightFootIndex],
  [ROOT, CHEST],
  [CHEST, LM.leftShoulder],
  [CHEST, LM.rightShoulder],
  [LM.leftShoulder, 13],
  [13, LM.leftWrist],
  [LM.rightShoulder, 14],
  [14, LM.rightWrist],
  [CHEST, LM.nose],
];

/** Small parts carried rigidly on a placed joint: the face, the fingers. */
const CARRIED: [number, number][] = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((index): [number, number] => [index, LM.nose]),
  [17, LM.leftWrist],
  [19, LM.leftWrist],
  [21, LM.leftWrist],
  [18, LM.rightWrist],
  [20, LM.rightWrist],
  [22, LM.rightWrist],
];

/** Thighs and shins set the scale: they stay close to the picture plane in any golf view. */
const SCALE_BONES = [2, 3, 6, 7];

/** Below this the image position of a joint is a guess about a hidden limb. */
const SEEN = 0.5;

/** Focal length in picture heights: a phone main camera, upright or on its side. */
const focalFor = (aspect: number) => (aspect < 1 ? 0.8 : 1.3);

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const norm = (a: V3) => Math.hypot(a.x, a.y, a.z);
const mirror = (index: number) =>
  index >= 11 && index <= 32 ? (index % 2 === 1 ? index + 1 : index - 1) : index;

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
}

/** The 33 detector points plus the two midpoints the skeleton hangs from. */
function withMidpoints(points: Landmark[]): Landmark[] {
  const between = (a: number, b: number): Landmark => ({
    x: (points[a]!.x + points[b]!.x) / 2,
    y: (points[a]!.y + points[b]!.y) / 2,
    z: (points[a]!.z + points[b]!.z) / 2,
    visibility: Math.min(points[a]!.visibility ?? 1, points[b]!.visibility ?? 1),
  });
  const all = [...points];
  all[ROOT] = between(LM.leftHip, LM.rightHip);
  all[CHEST] = between(LM.leftShoulder, LM.rightShoulder);
  return all;
}

const seen = (point: Landmark | undefined) => (point?.visibility ?? 1) >= SEEN;

/** Symmetric: a left bone and its right twin share one length. */
function symmetric(lengths: number[]): number[] {
  return lengths.map((value, index) => {
    const [from, to] = BONES[index]!;
    const twin = BONES.findIndex(([a, b]) => a === mirror(from) && b === mirror(to));
    return twin === -1 ? value : (value + lengths[twin]!) / 2;
  });
}

/**
 * Lift a clip. Needs the image landmarks on every frame and the video's
 * width / height, because image x and y are fractions of different lengths.
 * Returns null when the legs never show clearly enough to set a scale.
 */
export function liftFrames(frames: PoseFrame[], aspect: number): PoseFrame[] | null {
  if (frames.length === 0 || !(aspect > 0)) return null;
  if (!frames.every((frame) => frame.imageLandmarks && frame.imageLandmarks.length >= 33)) {
    return null;
  }

  const world = frames.map((frame) => withMidpoints(frame.landmarks));
  // Picture coordinates in picture heights, centred on the lens axis.
  const image = frames.map((frame) =>
    withMidpoints(
      frame.imageLandmarks!.map((point) => ({ ...point, x: (point.x - 0.5) * aspect, y: point.y - 0.5 })),
    ),
  );
  const bothSeen = (points: Landmark[], [from, to]: [number, number]) => seen(points[from]) && seen(points[to]);
  const onScreen = (points: Landmark[], [from, to]: [number, number]) =>
    Math.hypot(points[to]!.x - points[from]!.x, points[to]!.y - points[from]!.y);

  // Metres per picture-height at the hips, from the thighs and shins: they
  // stay near the picture plane in any golf view, so their picture length
  // is close to their real length most of the time.
  const legLength = SCALE_BONES.map(
    (bone) => quantile(world.map((points) => norm(sub(points[BONES[bone]![1]]!, points[BONES[bone]![0]]!))), 0.5)!,
  );
  const ratios: number[] = [];
  image.forEach((points) => {
    SCALE_BONES.forEach((bone, k) => {
      if (!bothSeen(points, BONES[bone]!)) return;
      const flat = onScreen(points, BONES[bone]!);
      if (flat > 1e-4) ratios.push(legLength[k]! / flat);
    });
  });
  if (ratios.length < 3) return null;
  const scale = quantile(ratios, 0.5)!;

  /*
    One depth gain for the clip: the one that keeps rigid bones rigid. Each
    joint is back-projected through the lens at the depth the gain gives it,
    because at phone distances a hand turning toward the lens grows in the
    picture by as much as it shortens. The detector's depth is steadied over
    three frames for the fit: its frame-to-frame noise would otherwise make
    every gain but a small one look non-rigid, and a wider window would
    shorten the depth of anything rotating through it.
  */
  const steadyDepth = world.map((_, index) =>
    world[index]!.map((__, joint) => {
      const near = world.slice(Math.max(0, index - 1), index + 2);
      return near.reduce((sum, points) => sum + points[joint]!.z, 0) / near.length;
    }),
  );
  /*
    How noisy each source is on this clip, read off the clip itself: how far
    each point strays from the average of the seven frames around it. Smooth
    motion barely strays; noise does, including the frame-to-frame correlated
    noise left after the runner's smoothing, which a difference-based measure
    would miss. The median keeps the fast part of the swing, which is real
    motion, from counting as noise.
  */
  const noiseOf = (tracks: number[][]) => {
    const residuals: number[] = [];
    for (const track of tracks) {
      for (let k = 3; k < track.length - 3; k += 1) {
        const local = track.slice(k - 3, k + 4).reduce((sum, value) => sum + value, 0) / 7;
        residuals.push(Math.abs(track[k]! - local));
      }
    }
    return (quantile(residuals, 0.5) ?? 0) / 0.6745;
  };
  const joints = BONES.map(([, to]) => to);
  const imageNoise =
    noiseOf(joints.flatMap((joint) => [image.map((points) => points[joint]!.x), image.map((points) => points[joint]!.y)])) *
    scale;
  // Detector depth noise per joint, before any gain; three-frame averaging
  // of already-smoothed noise keeps about two thirds of its variance.
  const rawDepthNoise = noiseOf(joints.map((joint) => world.map((points) => points[joint]!.z)));
  const steadyVariance = (2 / 3) * rawDepthNoise * rawDepthNoise;
  const floor = 0.004; // metres: no source is better than this, however still
  const imageVariance = Math.max(floor, imageNoise) ** 2;

  const backProjectWith = (lens: number) => (index: number, joint: number, depth: number): V3 => {
    const reach = (scale * lens + depth) / lens;
    return { x: image[index]![joint]!.x * reach, y: image[index]![joint]!.y * reach, z: depth };
  };
  const lengthsAt = (gain: number, lens: number) => {
    const backProject = backProjectWith(lens);
    return BONES.map(([from, to]) =>
      frames.flatMap((_, index) => {
        if (!bothSeen(image[index]!, [from, to])) return [];
        const a = backProject(index, from, gain * steadyDepth[index]![from]!);
        const b = backProject(index, to, gain * steadyDepth[index]![to]!);
        return [norm(sub(b, a))];
      }),
    );
  };
  /*
    How far a gain leaves the bones from rigid. Noise in the detector's depth
    makes lengths vary more the bigger the gain, which on its own would
    always favour a small one; that part is known from the measured noise
    and taken out (an errors-in-variables correction), so what is left is the
    variation the gain itself causes.
  */
  const rigidity = (gain: number, lens: number) => {
    let cost = 0;
    const perBone = lengthsAt(gain, lens);
    perBone.forEach((lengths, b) => {
      if (lengths.length < 3) return;
      const [from, to] = BONES[b]!;
      const squares = lengths.map((value) => value * value);
      const mean = squares.reduce((sum, value) => sum + value, 0) / squares.length;
      const variance = squares.reduce((sum, value) => sum + (value - mean) ** 2, 0) / squares.length;
      const noise = 2 * steadyVariance;
      const depths = frames.flatMap((_, index) =>
        bothSeen(image[index]!, [from, to]) ? [steadyDepth[index]![to]! - steadyDepth[index]![from]!] : [],
      );
      const expected =
        gain ** 4 *
        (depths.reduce((sum, d) => sum + 4 * d * d * noise - 2 * noise * noise, 0) / (depths.length || 1));
      cost += Math.max(0, variance - expected) / (mean * mean);
    });
    return cost;
  };
  let gain = 1;
  let best = Infinity;
  const focal = focalFor(aspect);
  for (let candidate = 0.4; candidate <= 3.0001; candidate += 0.02) {
    const cost = rigidity(candidate, focal);
    if (cost < best) [best, gain] = [cost, candidate];
  }
  const distance = scale * focal; // lens to hips, metres
  const detectorVariance = Math.max(floor * floor, steadyVariance * gain * gain);
  /*
    A bone's length: what the rigidity fit says, unless the picture shows it
    longer. Depth noise pulls the fit short, and most bones lie flat in the
    picture at some point in a swing - the hips face on at address, the
    shoulders down the line at the top - when their picture length is their
    real length. The 80th percentile keeps image noise from inflating that.
  */
  const backProject = backProjectWith(focal);
  const trueLength = symmetric(
    lengthsAt(gain, focal).map((lengths, b) => {
      const [from, to] = BONES[b]!;
      const flatLengths = frames.flatMap((_, index) => {
        if (!bothSeen(image[index]!, [from, to])) return [];
        const a = backProject(index, from, gain * steadyDepth[index]![from]!);
        const c = backProject(index, to, gain * steadyDepth[index]![to]!);
        return [Math.hypot(c.x - a.x, c.y - a.y)];
      });
      const fitted =
        quantile(lengths, 0.5) ?? quantile(world.map((points) => norm(sub(points[to]!, points[from]!))), 0.5)!;
      return Math.max(fitted, quantile(flatLengths, 0.8) ?? 0);
    }),
  );

  const nearDepth = world.map((_, index) =>
    world[index]!.map((__, joint) => {
      const near = world.slice(Math.max(0, index - 1), index + 2);
      return near.reduce((sum, points) => sum + points[joint]!.z, 0) / near.length;
    }),
  );

  const signs: (number | undefined)[] = BONES.map(() => undefined);

  /** Place every joint of one frame, given each joint's depth from the last pass. */
  function place(index: number, depths: number[], firstPass: boolean): V3[] {
    const w = world[index]!;
    const i = image[index]!;
    // Back-project through the lens at the depth each joint is thought to be.
    const across = (joint: number) => {
      const reach = (distance + (depths[joint] ?? 0)) / focal;
      return { x: i[joint]!.x * reach, y: i[joint]!.y * reach };
    };
    const placed: V3[] = [];
    const root = across(ROOT);
    placed[ROOT] = { x: root.x, y: root.y, z: 0 };

    BONES.forEach(([from, to], bone) => {
      const parent = placed[from]!;
      const bodyLength = trueLength[bone]!;
      const guess = sub(w[to]!, w[from]!);
      const guessDepth = (nearDepth[index]![to]! - nearDepth[index]![from]!) * gain;
      const guessLength = Math.hypot(guess.x, guess.y, guessDepth) || 1;

      if (!seen(i[to]) || !seen(i[from])) {
        // Hidden in the picture: trust the detector's direction, at the right length.
        const k = bodyLength / guessLength;
        placed[to] = { x: parent.x + guess.x * k, y: parent.y + guess.y * k, z: parent.z + guessDepth * k };
        return;
      }

      const a = across(from);
      const b = across(to);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const flat = Math.hypot(dx, dy);

      // Which way it points in depth. When the detector barely has an
      // opinion, keep last frame's answer rather than flicker between them.
      let sign = Math.sign(guessDepth) || 1;
      if (Math.abs(guessDepth) < 0.25 * guessLength && signs[bone] !== undefined) sign = signs[bone]!;
      if (firstPass) signs[bone] = sign;

      /*
        Two answers for how far it points out of the picture, each weighted by
        how wrong it is likely to be. Geometry's error is the picture's error
        magnified by flat / depth, so it is excellent for a steep bone and
        useless for a flat one; the detector's is the same everywhere.
      */
      const fromGeometry = Math.sqrt(Math.max(0, bodyLength * bodyLength - flat * flat));
      const fromDetector = Math.abs(guessDepth) * (bodyLength / guessLength);
      const geometryVariance = (2 * imageVariance * flat * flat) / Math.max(fromGeometry * fromGeometry, 1e-6);
      const weight = (1 / geometryVariance) / (1 / geometryVariance + 1 / (2 * detectorVariance));
      const depth = sign * (weight * fromGeometry + (1 - weight) * fromDetector);

      placed[to] = { x: parent.x + dx, y: parent.y + dy, z: parent.z + depth };
    });

    for (const [point, anchor] of CARRIED) {
      const offset = sub(w[point]!, w[anchor]!);
      const base = placed[anchor]!;
      placed[point] = { x: base.x + offset.x, y: base.y + offset.y, z: base.z + offset.z * gain };
    }
    return placed;
  }

  return frames.map((frame, index) => {
    // Two passes: the second back-projects each joint at the depth the first found.
    const first = place(index, world[index]!.map((point) => point.z * gain), true);
    const placed = place(index, first.map((point) => point.z), false);
    return {
      t: frame.t,
      landmarks: frame.landmarks.map((point, joint) => ({
        ...placed[joint]!,
        visibility: frame.imageLandmarks![joint]?.visibility ?? point.visibility,
      })),
      imageLandmarks: frame.imageLandmarks,
    };
  });
}
