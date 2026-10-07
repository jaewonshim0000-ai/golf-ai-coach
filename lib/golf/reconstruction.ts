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

/** Stabilize the model's metric 3D skeleton, without inventing camera depth
 * from a guessed phone lens. Keep one bone length per clip and use observed
 * image translation to move the hip-centred model through the recorded view.
 * Hidden limbs remain model estimates; they are rendered with lower opacity. */
export function reconstructSwing(input: PoseFrame[], aspect: number, view: MotionView): PoseFrame[] | null {
  if (!Number.isFinite(aspect) || aspect <= 0 || input.length < 3 ||
      !input.every((frame) => frame.landmarks.length === 33 && frame.landmarks.every(finite) && frame.imageLandmarks?.length === 33)) return null;
  const frames = trustworthyFrames(input, aspect, view);
  const geometry = motionGeometry(frames, aspect, view);
  const reference = frames.find((frame) => geometry.visibleBody(frame));
  if (!reference) return null;
  const referenceHip = geometry.hips(reference)!;
  const scales = frames.flatMap((frame) => [[23, 25], [25, 27], [24, 26], [26, 28]].flatMap(([a, b]) => {
    const ia = frame.imageLandmarks![a!]!, ib = frame.imageLandmarks![b!]!;
    if (!visiblePoint(ia) || !visiblePoint(ib)) return [];
    const flat = Math.hypot((ia.x - ib.x) * aspect, ia.y - ib.y);
    return flat > 0.03 ? [length(frame.landmarks[a!]!, frame.landmarks[b!]!) / flat] : [];
  }));
  const scale = median(scales);
  if (scale < 0.2 || scale > 10) return null;
  // Work in the detector's camera coordinates (+y down). The viewer flips y.
  const local = frames.map((frame) => {
    const root = midpoint(frame.landmarks[23]!, frame.landmarks[24]!);
    return withCentres(frame.landmarks.map((point) => ({ ...point,
      x: point.x - root.x, y: point.y - root.y, z: point.z - root.z,
    })));
  });
  const lengths = BONES.map(([a, b]) => median(local.map((points) => length(points[a]!, points[b]!))));
  if (lengths.some((value) => value <= 0.002 || value > 1.5)) return null;
  const reconstructed = frames.map((frame, index) => {
    const source = local[index]!;
    const points = source.map((point, joint) => {
      const before = local[index - 1]?.[joint], after = local[index + 1]?.[joint];
      if (!before || !after || frame.t - frames[index - 1]!.t > 0.08 || frames[index + 1]!.t - frame.t > 0.08) return point;
      // Remove a single-frame depth spike, preserving sustained rotation and
      // fast wrists. A gap never supplies temporal smoothing evidence.
      const expected = midpoint(before, after);
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
      landmarks: placed.slice(0, 33).map((point, joint) => ({
        x: point.x + translation.x, y: point.y + translation.y, z: point.z,
        visibility: frame.imageLandmarks![joint]!.visibility ?? 0,
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
