import type { PoseFrame } from "../pose";

export function faceOnSwing(): PoseFrame[] {
  return Array.from({ length: 61 }, (_, index) => {
    const t = index * 0.04;
    const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
    const at = (joint: number, x: number, y: number) => { points[joint] = { x, y, z: 0, visibility: 0.95 }; };
    at(0, 0.5, 0.19); at(11, 0.63, 0.34); at(12, 0.37, 0.34);
    const shift = t < 0.24 ? 0 : Math.sin(Math.min(Math.PI, (t - 0.24) / 1.6 * Math.PI)) * 0.048;
    at(23, 0.56 + shift, 0.62); at(24, 0.44 + shift, 0.62);
    at(25, 0.65, 0.76); at(26, 0.35, 0.76); at(27, 0.74, 0.94); at(28, 0.26, 0.94);
    const handY = t <= 0.24 ? 0.66 : t <= 1.44 ? 0.66 - (t - 0.24) / 1.2 * 0.41 :
      t <= 1.76 ? 0.25 + (t - 1.44) / 0.32 * 0.41 : Math.max(0.12, 0.66 - (t - 1.76) * 0.8);
    at(15, 0.49, handY); at(16, 0.51, handY);
    return { t, imageLandmarks: points, landmarks: points.map((p) => ({ ...p, x: 100, y: -100, z: 1000 })) };
  });
}
