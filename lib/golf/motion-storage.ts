import type { PackedLandmark, PoseModel } from "./pose";

/** JSONB numeric arrays are much larger than their JSON text. Store only the
 * observed coordinates used by motion analysis, without reducing precision. */
export function compactMotionModel(model: PoseModel): PoseModel {
  if (model.motionVersion !== 1 || !model.imageFrames) return model;
  const { imageFrames, imageData: _previous, ...rest } = model;
  return {
    ...rest,
    frames: [],
    imageData: JSON.stringify(imageFrames.map((frame) => frame.map(([x, y, , visibility]) => [x, y, visibility]))),
  };
}

export function expandMotionModel(model: PoseModel | null): PoseModel | null {
  if (!model || !model.imageData) return model;
  if (model.motionVersion !== 1 || model.imageData.length > 200000 || model.t.length > 128) return null;
  try {
    const data: unknown = JSON.parse(model.imageData);
    if (!Array.isArray(data) || data.length !== model.t.length || data.length < 3) return null;
    const imageFrames: PackedLandmark[][] = [];
    for (const frame of data) {
      if (!Array.isArray(frame) || frame.length !== 33) return null;
      const points: PackedLandmark[] = [];
      for (const point of frame) {
        if (!Array.isArray(point) || point.length !== 3 || !point.every((value) => typeof value === "number" && Number.isFinite(value)) ||
            Math.abs(point[0]) > 2 || Math.abs(point[1]) > 2 || point[2] < 0 || point[2] > 1) return null;
        points.push([point[0], point[1], 0, point[2]]);
      }
      imageFrames.push(points);
    }
    const { imageData: _stored, ...rest } = model;
    return { ...rest, imageFrames };
  } catch {
    return null;
  }
}
