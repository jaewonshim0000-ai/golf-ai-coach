import { z } from "zod";
import type { SwingSession } from "../../types/practice";
import type { PoseModel } from "./pose";

export const swingReferenceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["professional", "coach", "personal"]),
  handedness: z.enum(["right", "left"]),
  source: z.string().trim().max(300).default(""),
  permission: z.literal(true),
}).strict();
export type SwingReferenceMetadata = z.infer<typeof swingReferenceSchema>;
export type SwingReference = { session: SwingSession; model: PoseModel; metadata: SwingReferenceMetadata };

export function currentSwingModel(model: PoseModel | null, session: Pick<SwingSession, "clip_start" | "clip_end">): model is PoseModel {
  return Boolean(model?.imageFrames?.length && model.aspect && (!model.clip ||
    (Math.abs(model.clip[0] - (session.clip_start ?? 0)) <= 0.1 &&
      (session.clip_end === null || Math.abs(model.clip[1] - session.clip_end) <= 0.1))));
}

export function readSwingReference(session: SwingSession, model: PoseModel | null): SwingReference | null {
  if (!currentSwingModel(model, session)) return null;
  const metadata = swingReferenceSchema.safeParse(model.reference);
  return metadata.success ? { session, model: { ...model, handedness: metadata.data.handedness,
    cameraAngle: model.cameraAngle ?? (session.camera_angle === "face_on" ? "face_on" : session.camera_angle === "down_the_line" ? "down_the_line" : "other") }, metadata: metadata.data } : null;
}
