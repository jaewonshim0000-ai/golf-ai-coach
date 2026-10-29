import { LM, type Landmark } from "./pose";
import { visiblePoint, type MotionView } from "./motion-analysis";

export type Framing = { ok: boolean; message: string };

const height = (points: Landmark[]) => {
  const head = points[LM.nose], feet = [points[LM.leftAnkle], points[LM.rightAnkle]].filter(visiblePoint);
  return visiblePoint(head) && feet.length ? Math.max(...feet.map((foot) => foot.y)) - head.y : 0;
};
/** With two people in view, the larger body is the golfer. */
const golfer = (poses: Landmark[][]) => [...poses].sort((a, b) => height(b) - height(a))[0];

/**
 * Face on, the shoulders sit side by side, about as wide as the torso is long.
 * Down the line, one stands in front of the other. The far side can be hidden
 * behind the body, so only one shoulder and one hip need to be visible; the
 * detector still places the hidden ones close behind them.
 */
export function detectView(poses: Landmark[][], aspect: number): Exclude<MotionView, "other"> | null {
  const body = golfer(poses);
  if (!body || !(aspect > 0)) return null;
  const [ls, rs, lh, rh] = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip].map((joint) => body[joint]);
  if (!ls || !rs || !lh || !rh || !(visiblePoint(ls) || visiblePoint(rs)) || !(visiblePoint(lh) || visiblePoint(rh))) return null;
  const torso = Math.hypot((ls.x + rs.x - lh.x - rh.x) / 2 * aspect, (ls.y + rs.y - lh.y - rh.y) / 2);
  if (torso < 0.05) return null;
  // ponytail: one threshold from body proportions (~0.8 face on, ~0.2 behind); tune on real clips.
  return Math.abs(ls.x - rs.x) * aspect / torso >= 0.45 ? "face_on" : "down_the_line";
}

/**
 * Is the golfer fully in the picture, with room above the head for the club?
 * Image coordinates run 0–1 from the top left. The thresholds are a
 * recording aid, not a measurement.
 */
export function checkFraming(poses: Landmark[][]): Framing {
  const body = golfer(poses);
  if (!body) return { ok: false, message: "Step into the picture." };
  const head = body[LM.nose];
  const feet = [body[LM.leftAnkle], body[LM.rightAnkle]].filter(visiblePoint);
  if (!visiblePoint(head) || !feet.length) return { ok: false, message: "Step back so your head and feet are both in the picture." };
  const bottom = Math.max(...feet.map((foot) => foot.y));
  if (bottom > 0.97) return { ok: false, message: "Step back so your feet are fully in the picture." };
  if (head.y < 0.12) return { ok: false, message: "Step back a little to leave room above your head for the club." };
  if (bottom - head.y < 0.35) return { ok: false, message: "Move the phone closer. You are small in the picture." };
  const hips = [body[LM.leftHip], body[LM.rightHip]].filter(visiblePoint);
  const centre = hips.length ? hips.reduce((sum, hip) => sum + hip.x, 0) / hips.length : head.x;
  if (centre < 0.25 || centre > 0.75) return { ok: false, message: "Stand nearer the middle of the picture." };
  return { ok: true, message: "Whole body in view. Ready to record." };
}
