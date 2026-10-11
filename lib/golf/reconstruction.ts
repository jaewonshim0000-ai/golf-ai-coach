import { LM, type Landmark, type PoseFrame, type PoseModel } from "./pose";
import { findAutomaticTiming, motionGeometry, trustworthyFrames, visibleHands, visiblePoint, type MotionView } from "./motion-analysis";

const median = (values: number[]) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};
const length = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const midpoint = (a: Landmark, b: Landmark): Landmark => ({
  x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2,
  visibility: Math.min(a.visibility ?? 0, b.visibility ?? 0),
});
const finite = (point: Landmark | undefined): point is Landmark => Boolean(point &&
  [point.x, point.y, point.z].every((value) => Number.isFinite(value) && Math.abs(value) <= 5));
const ROOT = 33, CHEST = 34;
const BONES: [number, number][] = [
  [ROOT, LM.leftHip], [ROOT, LM.rightHip], [ROOT, CHEST],
  [CHEST, LM.leftShoulder], [CHEST, LM.rightShoulder],
  [LM.leftShoulder, 13], [13, LM.leftWrist], [LM.rightShoulder, 14], [14, LM.rightWrist],
  [LM.leftHip, LM.leftKnee], [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee], [LM.rightKnee, LM.rightAnkle],
  [LM.leftAnkle, LM.leftHeel], [LM.leftAnkle, LM.leftFootIndex],
  [LM.rightAnkle, LM.rightHeel], [LM.rightAnkle, LM.rightFootIndex], [CHEST, LM.nose],
];
const withCentres = (points: Landmark[]) => [...points,
  midpoint(points[LM.leftHip]!, points[LM.rightHip]!),
  midpoint(points[LM.leftShoulder]!, points[LM.rightShoulder]!),
];
const MIRROR_BONES = [[0, 1], [3, 4], [5, 7], [6, 8], [9, 11], [10, 12], [13, 15], [14, 16]];

/** Use reliable observations to calibrate the skeleton. Hidden samples must
 * not stretch a limb for the entire clip. A visible opposite limb supplies a
 * proportion only when this limb never has enough reliable observations. */
function calibratedLengths(local: Landmark[][]): number[] {
  const observed = BONES.map(([a, b]) => local.flatMap((points) =>
    Math.min(points[a]!.visibility ?? 0, points[b]!.visibility ?? 0) >= 0.6
      ? [length(points[a]!, points[b]!)] : []));
  return BONES.map(([a, b], index) => {
    if (observed[index]!.length >= 3) return median(observed[index]!);
    const opposite = MIRROR_BONES.find((pair) => pair.includes(index))?.find((bone) => bone !== index);
    if (opposite !== undefined && observed[opposite]!.length >= 3) return median(observed[opposite]!);
    // The model still draws hidden anatomy as an estimate, never a measurement.
    return median(local.map((points) => length(points[a]!, points[b]!)));
  });
}

/** Fit a two-bone chain to its observed endpoint. Resizing every bone only
 * outwards from the hip accumulates error at wrists/feet; this preserves the
 * endpoint when reachable and the observed bend plane, without stretching. */
function fitLimb(points: Landmark[], placed: Landmark[], root: number, joint: number, end: number, upper: number, lower: number) {
  if (![root, joint, end].every((index) => (points[index]!.visibility ?? 0) >= 0.6)) return;
  // The inferred depth is not an observed endpoint constraint. Preserve the
  // calibrated chain's depth while fitting the more reliable camera-plane axes.
  const origin = placed[root]!;
  const target = { ...points[end]!, z: placed[end]!.z };
  const pole = { ...points[joint]!, z: placed[joint]!.z };
  const reach = length(origin, target);
  if (reach < 1e-5) return;
  const axis = { x: (target.x - origin.x) / reach, y: (target.y - origin.y) / reach, z: (target.z - origin.z) / reach };
  const projection = (pole.x - origin.x) * axis.x + (pole.y - origin.y) * axis.y + (pole.z - origin.z) * axis.z;
  const bend = { x: pole.x - origin.x - projection * axis.x, y: pole.y - origin.y - projection * axis.y, z: pole.z - origin.z - projection * axis.z };
  const bendLength = Math.hypot(bend.x, bend.y, bend.z);
  if (bendLength < 1e-5) return; // No supported bend plane for a collinear chain.
  const distance = Math.max(Math.abs(upper - lower) + 1e-6, Math.min(upper + lower - 1e-6, reach));
  const along = (upper * upper + distance * distance - lower * lower) / (2 * distance);
  const across = Math.sqrt(Math.max(0, upper * upper - along * along));
  placed[joint] = { ...placed[joint]!,
    x: origin.x + axis.x * along + bend.x / bendLength * across,
    y: origin.y + axis.y * along + bend.y / bendLength * across,
    z: origin.z + axis.z * along + bend.z / bendLength * across };
  placed[end] = { ...placed[end]!, x: origin.x + axis.x * distance, y: origin.y + axis.y * distance, z: origin.z + axis.z * distance };
}

/** Stabilize the model's metric 3D skeleton, without inventing camera depth
 * from a guessed phone lens. Keep one bone length per clip and use observed
 * image translation to move the hip-centred model through the recorded view.
 * Hidden limbs remain model estimates; they are rendered with lower opacity. */
export function reconstructSwing(input: PoseFrame[], aspect: number, view: MotionView): PoseFrame[] | null {
  if (!Number.isFinite(aspect) || aspect <= 0 || input.length < 3 ||
      !input.every((frame, index) => Number.isFinite(frame.t) && (index === 0 || frame.t > input[index - 1]!.t) &&
        frame.landmarks.length === 33 && frame.landmarks.every(finite) && frame.imageLandmarks?.length === 33)) return null;
  const frames = trustworthyFrames(input, aspect, view);
  const geometry = motionGeometry(frames, aspect, view);
  const reference = frames.find((frame) => geometry.visibleBody(frame));
  if (!reference) return null;
  const referenceHip = geometry.hips(reference)!;
  const scales = frames.flatMap((frame) => [[23, 25], [25, 27], [24, 26], [26, 28]].flatMap(([a, b]) => {
    const ia = frame.imageLandmarks![a!]!, ib = frame.imageLandmarks![b!]!;
    if (!visiblePoint(ia) || !visiblePoint(ib)) return [];
    const flat = Math.hypot((ia.x - ib.x) * aspect, ia.y - ib.y);
    const wa = frame.landmarks[a!]!, wb = frame.landmarks[b!]!;
    if (Math.min(wa.visibility ?? 0, wb.visibility ?? 0) < 0.6) return [];
    // Compare projected lengths on BOTH sides of the ratio. Using 3D length
    // here inflated translation when a leg pointed toward the camera.
    const projected = Math.hypot(wa.x - wb.x, wa.y - wb.y);
    return flat > 0.03 && projected > 0.03 ? [projected / flat] : [];
  }));
  const scale = median(scales);
  if (scale < 0.2 || scale > 10) return null;
  // Work in the detector's camera coordinates (+y down). The viewer flips y.
  const local = frames.map((frame) => {
    const root = midpoint(frame.landmarks[23]!, frame.landmarks[24]!);
    return withCentres(frame.landmarks.map((point, joint) => ({ ...point,
      x: point.x - root.x, y: point.y - root.y, z: point.z - root.z,
      visibility: Math.min(point.visibility ?? 0, frame.imageLandmarks![joint]!.visibility ?? 0),
    })));
  });
  const lengths = calibratedLengths(local);
  if (lengths.some((value) => value <= 0.002 || value > 1.5)) return null;
  const reconstructed = frames.map((frame, index) => {
    const source = local[index]!;
    const points = source.map((point, joint) => {
      const before = local[index - 1]?.[joint], after = local[index + 1]?.[joint];
      if (!before || !after || frame.t - frames[index - 1]!.t > 0.08 || frames[index + 1]!.t - frame.t > 0.08) return point;
      // Remove a single-frame depth spike, preserving sustained rotation and
      // fast wrists. A gap never supplies temporal smoothing evidence.
      if (Math.min(before.visibility ?? 0, after.visibility ?? 0) < 0.6) return point;
      const fraction = (frame.t - frames[index - 1]!.t) / (frames[index + 1]!.t - frames[index - 1]!.t);
      const expected = { x: before.x + (after.x - before.x) * fraction,
        y: before.y + (after.y - before.y) * fraction, z: before.z + (after.z - before.z) * fraction,
        visibility: Math.min(point.visibility ?? 0, 0.5) };
      return length(point, expected) > 0.2 && length(before, after) < 0.08 ? expected : point;
    });
    const placed = points.map((point) => ({ ...point }));
    placed[ROOT] = { x: 0, y: 0, z: 0 };
    BONES.forEach(([a, b], bone) => {
      const from = points[a]!, to = points[b]!, parent = placed[a]!;
      const gain = lengths[bone]! / Math.max(0.00001, length(from, to));
      placed[b] = { ...to, x: parent.x + (to.x - from.x) * gain,
        y: parent.y + (to.y - from.y) * gain, z: parent.z + (to.z - from.z) * gain };
    });
    for (const [root, joint, end, upper, lower] of [
      [11, 13, 15, 5, 6], [12, 14, 16, 7, 8], [23, 25, 27, 9, 10], [24, 26, 28, 11, 12],
    ] as const) {
      const previousEnd = placed[end]!;
      fitLimb(points, placed, root, joint, end, lengths[upper]!, lengths[lower]!);
      if (end === 27 || end === 28) for (const foot of [end + 2, end + 4]) {
        placed[foot] = { ...placed[foot]!, x: placed[foot]!.x + placed[end]!.x - previousEnd.x,
          y: placed[foot]!.y + placed[end]!.y - previousEnd.y, z: placed[foot]!.z + placed[end]!.z - previousEnd.z };
      }
    }
    // Carry face/finger landmarks on their reconstructed head/wrist anchors.
    for (const [joints, anchor] of [
      [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0], [[17, 19, 21], 15], [[18, 20, 22], 16],
    ] as const) for (const joint of joints) {
      placed[joint] = { ...points[joint]!, x: placed[anchor]!.x + points[joint]!.x - points[anchor]!.x,
        y: placed[anchor]!.y + points[joint]!.y - points[anchor]!.y,
        z: placed[anchor]!.z + points[joint]!.z - points[anchor]!.z };
    }
    const hip = geometry.hips(frame);
    const translation = hip ? { x: (hip.x - referenceHip.x) * scale, y: (hip.y - referenceHip.y) * scale } : { x: 0, y: 0 };
    return { t: frame.t, imageLandmarks: frame.imageLandmarks,
      landmarks: placed.slice(0, 33).map((point) => ({
        x: point.x + translation.x, y: point.y + translation.y, z: point.z,
        visibility: point.visibility ?? 0,
      })),
    };
  });
  return reconstructed.every((frame) => frame.landmarks.every(finite)) ? reconstructed : null;
}

/** Convert camera coordinates to a floor-centred, y-up playback track. */
export function reconstructionTrack(model: PoseModel): Landmark[][] | null {
  if (model.reconstructionVersion !== 1 || model.frames.length !== model.t.length) return null;
  const frames = model.frames.map((frame) => frame.map(([x, y, z, visibility]) => ({ x, y, z, visibility })));
  if (!frames.every((frame) => frame.length === 33 && frame.every(finite))) return null;
  const reference = frames[model.phases.address] ?? frames[0];
  if (!reference) return null;
  const root = midpoint(reference[23]!, reference[24]!);
  const floor = Math.max(...[27, 28, 29, 30, 31, 32].map((joint) => reference[joint]!.y));
  return frames.map((frame) => frame.map((point) => ({ ...point, x: point.x - root.x, y: floor - point.y, z: -point.z })));
}

/** Playback follows decoded time, not a fixed rate through uneven samples. */
export function samplePosition(times: number[], time: number): number {
  if (!times.length || time <= times[0]!) return 0;
  const next = times.findIndex((sample) => sample >= time);
  if (next < 0) return times.length - 1;
  return next - 1 + (time - times[next - 1]!) / (times[next]! - times[next - 1]!);
}

export function positionTime(times: number[], position: number): number {
  if (!times.length) return 0;
  const lower = Math.max(0, Math.min(times.length - 1, Math.floor(position)));
  const upper = Math.min(times.length - 1, lower + 1);
  return times[lower]! + (times[upper]! - times[lower]!) * Math.max(0, Math.min(1, position - lower));
}

export function inferBallSide(frames: PoseFrame[], aspect: number): "left" | "right" | undefined {
  const geometry = motionGeometry(frames, aspect, "down_the_line");
  const phases = findAutomaticTiming(frames, aspect, "down_the_line")?.phases;
  const address = phases ? frames[phases.address] : frames.find(geometry.visibleBody);
  if (!address) return undefined;
  const hip = geometry.hips(address), hand = visibleHands(address, aspect), shoulder = geometry.shoulders(address), foot = geometry.feet(address);
  if (!hip || !hand || !shoulder || !foot || Math.abs(hand.x - hip.x) < Math.hypot(shoulder.x - foot.x, shoulder.y - foot.y) * 0.07) return undefined;
  return hand.x < hip.x ? "left" : "right";
}
