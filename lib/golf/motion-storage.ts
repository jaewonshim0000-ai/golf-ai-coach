import type { PackedLandmark, PoseModel } from "./pose";

/** Store numeric arrays as JSON text to stay inside the existing JSONB size
 * limit. New reconstructions retain inferred 3D at millimetre precision. */
export function compactMotionModel(model: PoseModel): PoseModel {
  if (model.motionVersion !== 1 || !model.imageFrames) return model;
  const { imageFrames, imageData: _previous, worldData: _world, ...rest } = model;
  return {
    ...rest,
    frames: [],
    imageData: JSON.stringify(imageFrames.map((frame) => frame.map(([x, y, , visibility]) => [x, y, visibility]))),
    ...(model.reconstructionVersion === 1 && model.frames.length === model.t.length ? {
      worldData: JSON.stringify(model.frames.map((frame) => frame.map(([x, y, z]) => [
        Math.round(x * 1000), Math.round(y * 1000), Math.round(z * 1000),
      ]))),
    } : {}),
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
    let frames: PackedLandmark[][] = model.frames;
    if (model.reconstructionVersion === 1) {
      if (!model.worldData || model.worldData.length > 110000) return null;
      const world: unknown = JSON.parse(model.worldData);
      if (!Array.isArray(world) || world.length !== model.t.length) return null;
      frames = [];
      for (const [index, frame] of world.entries()) {
        if (!Array.isArray(frame) || frame.length !== 33) return null;
        const joints: PackedLandmark[] = [];
        for (const [joint, point] of frame.entries()) {
          if (!Array.isArray(point) || point.length !== 3 || !point.every((value) =>
            typeof value === "number" && Number.isInteger(value) && Math.abs(value) <= 5000)) return null;
          joints.push([point[0] / 1000, point[1] / 1000, point[2] / 1000, imageFrames[index]![joint]![3]]);
        }
        frames.push(joints);
      }
    }
    const { imageData: _stored, worldData: _inferred, ...rest } = model;
    return { ...rest, frames, imageFrames };
  } catch {
    return null;
  }
}
