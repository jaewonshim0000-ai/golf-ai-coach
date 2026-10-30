import { readFileSync } from "node:fs";
import type { GppLandmark } from "../phases";

export const reference = JSON.parse(readFileSync(new URL("./notebook-reference.json", import.meta.url), "utf8"));
/** Poses whose wrists sit at the notebook's measured heights on a 720 x 1280 frame. */
export function ironPoses(): (GppLandmark[] | null)[] {
  return (reference.IMG_1022.wristY as (number | null)[]).map((wrist) => {
    if (wrist === null) return null;
    const pose: GppLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
    pose[15] = { x: 0.48, y: wrist / 1280, visibility: 0.9 };
    pose[16] = { x: 0.52, y: wrist / 1280, visibility: 0.9 };
    return pose;
  });
}
