import { motionGeometry, trustworthyFrames, visibleHands, visiblePoint, type MotionReading, type MotionReport } from "./motion-analysis";
import { LM, unpackFrames, type PoseFrame, type PoseModel } from "./pose";

/** GolfPosePro's six phases, timed from the analysis' address, top and contact. */
export const SWING_PHASES = ["address", "backswing", "top", "downswing", "impact", "follow_through"] as const;
export type SwingPhaseName = (typeof SWING_PHASES)[number];
export const PHASE_LABELS: Record<SwingPhaseName, string> = {
  address: "Address", backswing: "Backswing", top: "Top", downswing: "Downswing", impact: "Impact", follow_through: "Follow-through",
};

export type BreakdownReading = Omit<MotionReading, "phase"> & { phase: SwingPhaseName };
export type SwingBreakdown = {
  /** Real swing seconds; each phase starts where the previous one ends. */
  phases: { name: SwingPhaseName; start: number; end: number }[];
  /** [real seconds, hand height above the ankles as % of head-to-ankle height]: GolfPosePro's wrist trace, scaled to the golfer. */
  handPath: [number, number][];
  /** Positions the scored analysis does not read: knees, hand height and the finish. */
  readings: BreakdownReading[];
};

const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null;
};

export function swingBreakdown(model: PoseModel, report: MotionReport): SwingBreakdown | null {
  const aspect = model.aspect ?? 0, view = report.view;
  if (!report.phases || !(aspect > 0)) return null;
  const frames = trustworthyFrames(unpackFrames(model), aspect, view);
  const { address, top, impact } = report.phases;
  if (!frames[impact] || !(address < top && top < impact)) return null;
  const geometry = motionGeometry(frames, aspect, view);
  const body = median(frames.flatMap((frame) => {
    const head = geometry.head(frame), feet = geometry.feet(frame);
    return head && feet && feet.y > head.y ? [feet.y - head.y] : [];
  }));
  if (!body || body < 0.1) return null;
  const t = (index: number) => frames[Math.max(0, Math.min(frames.length - 1, index))]!.t;
  const handHeight = (frame: PoseFrame) => {
    const hands = visibleHands(frame, aspect), feet = geometry.feet(frame);
    return hands && feet ? (feet.y - hands.y) / body * 100 : null;
  };
  const handPath = frames.flatMap((frame): [number, number][] => {
    const height = handHeight(frame);
    return height === null ? [] : [[round(frame.t, 3), round(height)]];
  });
  // The finish is where the hands peak after contact, within the tracked clip.
  let finish = frames.length - 1, highest = -Infinity;
  for (let index = impact + 1; index < frames.length; index++) {
    const height = handHeight(frames[index]!);
    if (height !== null && height > highest) { highest = height; finish = index; }
  }
  const bracket = (index: number, window?: [number, number]): [number, number] => window
    ? [t(window[0]), t(window[1])] : [(t(index - 1) + t(index)) / 2, (t(index) + t(index + 1)) / 2];
  const [topStart, topEnd] = bracket(top, report.timing?.topWindow), [impactStart, impactEnd] = bracket(impact, report.timing?.impactWindow);
  const edges = [t(0), t(address), topStart, topEnd, impactStart, impactEnd, Math.max(impactEnd, t(finish))];
  for (let n = 1; n < edges.length; n++) edges[n] = Math.max(edges[n]!, edges[n - 1]!);
  const phases = SWING_PHASES.map((name, n) => ({ name, start: round(edges[n]!, 3), end: round(edges[n + 1]!, 3) }));

  const readings: BreakdownReading[] = [];
  const add = (id: string, label: string, phase: SwingPhaseName, index: number, value: number | null, unit: BreakdownReading["unit"], note: string) => {
    if (value !== null && Number.isFinite(value)) readings.push({ id, label, phase, value: round(value), unit, note, time: t(index) });
  };
  // Profile clips read the leg nearest the camera; face on reads the lead leg.
  const leadLeft = model.handedness !== "left";
  const [hip, knee, ankle] = view === "down_the_line" ? [geometry.side[1]!, geometry.side[1]! + 2, geometry.side[2]!]
    : leadLeft ? [LM.leftHip, LM.leftKnee, LM.leftAnkle] : [LM.rightHip, LM.rightKnee, LM.rightAnkle];
  const kneeAngle = (frame: PoseFrame) => {
    const [a, b, c] = [hip, knee, ankle].map((joint) => frame.imageLandmarks?.[joint]);
    if (!visiblePoint(a) || !visiblePoint(b) || !visiblePoint(c)) return null;
    const u = { x: (a.x - b.x) * aspect, y: a.y - b.y }, v = { x: (c.x - b.x) * aspect, y: c.y - b.y };
    const length = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
    return length > 0 ? Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / length))) * 180 / Math.PI : null;
  };
  const kneeLabel = view === "down_the_line" ? "Knee angle (leg nearest the camera)" : "Lead knee angle";
  const kneeNote = "Projected hip–knee–ankle angle; 180° is a straight leg. A knee pointing toward the camera can look straighter or more bent.";
  add("knee_address", kneeLabel, "address", address, kneeAngle(frames[address]!), "° in picture", kneeNote);
  add("knee_impact", kneeLabel, "impact", impact, kneeAngle(frames[impact]!), "° in picture", kneeNote);
  const handNote = "Hand height above the ankles as a share of your head-to-ankle height; about 100% is head height.";
  add("hands_top", "Hand height at the top", "top", top, handHeight(frames[top]!), "% body height", handNote);
  add("hands_finish", "Hand height at the finish", "follow_through", finish, finish > impact ? highest : null, "% body height", handNote);
  // Face on, where the hips finish between the feet set at address.
  const setup = frames[address]!, end = frames[finish]!;
  const leadAnkle = setup.imageLandmarks?.[leadLeft ? LM.leftAnkle : LM.rightAnkle], trailAnkle = setup.imageLandmarks?.[leadLeft ? LM.rightAnkle : LM.leftAnkle];
  const hips = geometry.hips(end);
  if (view === "face_on" && finish > impact && hips && visiblePoint(leadAnkle) && visiblePoint(trailAnkle) && Math.abs(leadAnkle.x - trailAnkle.x) * aspect > body * 0.1) {
    add("hips_finish", "Hips over the lead foot at the finish", "follow_through", finish,
      (hips.x / aspect - trailAnkle.x) / (leadAnkle.x - trailAnkle.x) * 100, "% stance",
      "Hip centre between the address ankle positions: 0% is over the trail ankle, 100% over the lead ankle. Position, not measured pressure.");
  }
  return { phases, handPath, readings };
}
