import { LM, type Landmark } from "./pose";
import { visiblePoint } from "./motion-analysis";

export type Framing = { ok: boolean; message: string };

/**
 * Is the golfer fully in the picture, with room above the head for the club?
 * Image coordinates run 0–1 from the top left. With two people in view, the
 * larger body is the golfer. The thresholds are a recording aid, not a measurement.
 */
export function checkFraming(poses: Landmark[][]): Framing {
  const height = (points: Landmark[]) => {
    const head = points[LM.nose], feet = [points[LM.leftAnkle], points[LM.rightAnkle]].filter(visiblePoint);
    return visiblePoint(head) && feet.length ? Math.max(...feet.map((foot) => foot.y)) - head.y : 0;
  };
  const body = [...poses].sort((a, b) => height(b) - height(a))[0];
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
