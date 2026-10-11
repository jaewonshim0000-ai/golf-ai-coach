"use server";

import { z } from "zod";
import * as repo from "@/lib/db/repo";
import { reviewFaceOn } from "@/lib/golf/face-on-review";
import { unpackFrames } from "@/lib/golf/pose";
import { cachedFaceOnPractice, coachFaceOn, faceOnFingerprint, type FaceOnPractice } from "@/lib/ai/face-on-coach";
import { getProvider } from "@/lib/ai/provider";

export async function getSwingCoachingAction(sessionId: string): Promise<{ ok: boolean; practice?: FaceOnPractice }> {
  const user = await repo.currentUser();
  if (!user || !z.string().min(1).max(80).safeParse(sessionId).success) return { ok: false };
  try {
    const [sessions, model] = await Promise.all([repo.getSwingSessions(user.id), repo.getSwingModel(user.id, sessionId)]);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || !model?.imageFrames || !model.aspect) return { ok: false };
    if (model.clip && (Math.abs(model.clip[0] - (session.clip_start ?? 0)) > 0.1 ||
        (session.clip_end !== null && Math.abs(model.clip[1] - session.clip_end) > 0.1))) return { ok: false };
    const review = reviewFaceOn(unpackFrames(model), model.aspect, model.cameraAngle ?? (session.camera_angle === "down_the_line" ? "down_the_line" : session.camera_angle === "face_on" ? "face_on" : "other"));
    if (review.status === "record_again") return { ok: false };
    const key = faceOnFingerprint(review, session.club, getProvider().model);
    const practice = await cachedFaceOnPractice(`${user.id}:${sessionId}`, key, () => coachFaceOn(review, session.club));
    return { ok: true, practice };
  } catch { return { ok: false }; }
}
