"use server";

import { z } from "zod";
import * as repo from "@/lib/db/repo";
import { cachedSwingFocus, coachSwingFocus, swingFocusFingerprint } from "@/lib/ai/swing-focus";
import type { SwingFocus } from "@/lib/golf/swing-focus";
import { getProvider } from "@/lib/ai/provider";
import { loadSwingComparison } from "@/lib/swing-comparison";

export async function getSwingCoachingAction(sessionId: string, referenceId?: string): Promise<{ ok: boolean; focus?: SwingFocus }> {
  const user = await repo.currentUser();
  if (!user || !z.string().min(1).max(80).safeParse(sessionId).success) return { ok: false };
  if (referenceId !== undefined && !z.string().min(1).max(80).safeParse(referenceId).success) return { ok: false };
  try {
    const [sessions, model] = await Promise.all([repo.getSwingSessions(user.id), repo.getSwingModel(user.id, sessionId)]);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || !model?.imageFrames || !model.aspect) return { ok: false };
    if (model.clip && (Math.abs(model.clip[0] - (session.clip_start ?? 0)) > 0.1 ||
        (session.clip_end !== null && Math.abs(model.clip[1] - session.clip_end) > 0.1))) return { ok: false };
    const view = session.camera_angle === "face_on" || session.camera_angle === "down_the_line" ? session.camera_angle : "other";
    const current = { ...model, cameraAngle: model.cameraAngle ?? view };
    const { comparison, selected } = await loadSwingComparison(user.id, session, current, referenceId);
    const key = swingFocusFingerprint(current, session.club, getProvider().model, selected ? { id: selected.session.id, model: selected.model } : undefined);
    const focus = await cachedSwingFocus(`${user.id}:${sessionId}`, key, () => coachSwingFocus(current, session.club, getProvider(), comparison));
    return { ok: true, focus };
  } catch { return { ok: false }; }
}
