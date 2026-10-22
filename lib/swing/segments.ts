import { motionGeometry, swingSamplingWindow, visibleHands } from "../golf/motion-analysis";
import type { PoseModel, PoseFrame } from "../golf/pose";

/** Find separate plausible hand arcs. A hint is enough to request a trim,
 * never enough to certify timing or a movement fault. */
export function swingCandidates(frames: PoseFrame[], aspect: number, view: PoseModel["cameraAngle"]) {
  const result: [number, number, number][] = [];
  let offset = 0;
  for (let n = 0; n < 6 && result.length < 3 && frames.length - offset >= 8; n++) {
    const remaining = frames.slice(offset);
    const arc = swingSamplingWindow(remaining, aspect, view ?? "other");
    if (!arc) break;
    const address = remaining.find((frame) => frame.t === arc[0]);
    const geometry = motionGeometry(remaining, aspect, view ?? "other");
    const hand = address && visibleHands(address, aspect), hip = address && geometry.hips(address);
    const shoulder = address && geometry.shoulders(address), foot = address && geometry.feet(address);
    const body = shoulder && foot ? Math.abs(foot.y - shoulder.y) : 0;
    if (hand && hip && body > 0 && hand.y >= hip.y - body * 0.08 && Math.abs(hand.y - hip.y) < body * 0.45) result.push(arc);
    const after = frames.findIndex((frame) => frame.t > arc[2] + 0.1);
    if (after <= offset) break;
    offset = after;
  }
  return result;
}
