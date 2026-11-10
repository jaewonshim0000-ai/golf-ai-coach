"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as repo from "@/lib/db/repo";
import { unpackFrames } from "@/lib/golf/pose";
import { buildVideoModel } from "@/lib/golf/video-review";
import { calibrationLabelSchema, deleteCalibrationSwing, saveCalibrationSwing } from "@/lib/swing/calibration";
import { swingResult } from "@/lib/swing/result";
import { parseGolfPosePro, poseModelSchema } from "@/lib/validation/schemas";

/** Calibration files are written into this project, so only a local dev server may write them. */
async function allowed() {
  return process.env.NODE_ENV === "development" && Boolean(await repo.currentUser());
}

/** One clip read in the browser, with the score a coach gives it. The model is
 * built here exactly as a swing upload's is, then saved to calibration/swings. */
export async function saveCalibrationSwingAction(input: {
  name: string; score: number; note?: string; handedness: "right" | "left";
  t: number[]; imageFrames: unknown; aspect: number; cameraAngle: "face_on" | "down_the_line"; clip: [number, number]; golfPosePro: unknown;
}): Promise<{ ok: boolean; message: string }> {
  if (!(await allowed())) return { ok: false, message: "Calibration runs only on a local development server (npm run dev)." };
  const label = calibrationLabelSchema.safeParse(input);
  if (!label.success) return { ok: false, message: "Enter a whole-number score from 0 to 100." };
  const handedness = z.enum(["right", "left"]).safeParse(input.handedness);
  const tracks = poseModelSchema.safeParse({ swing_session_id: "calibration", t: input.t, frames: input.imageFrames,
    imageFrames: input.imageFrames, aspect: input.aspect, cameraAngle: input.cameraAngle, clip: input.clip });
  if (!handedness.success || !tracks.success) return { ok: false, message: "Those video tracks could not be read." };
  const golfPosePro = parseGolfPosePro(input.golfPosePro);
  if (typeof golfPosePro === "string") return { ok: false, message: golfPosePro };

  const model = buildVideoModel(unpackFrames(tracks.data), { aspect: tracks.data.aspect ?? 0,
    view: tracks.data.cameraAngle ?? "face_on", handedness: handedness.data, clip: tracks.data.clip });
  model.golfPosePro = golfPosePro;
  try { saveCalibrationSwing({ ...label.data, savedAt: new Date().toISOString(), model }); }
  catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not save this clip." }; }
  revalidatePath("/swing/calibrate");
  const { score, reason } = swingResult(model);
  return { ok: true, message: score === null ? `Saved. The app gives no score: ${reason}` : `Saved. You ${label.data.score}, app ${score}.` };
}

export async function deleteCalibrationSwingAction(file: string): Promise<void> {
  if (!(await allowed())) return;
  deleteCalibrationSwing(file);
  revalidatePath("/swing/calibrate");
}
