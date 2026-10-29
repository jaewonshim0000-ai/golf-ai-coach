"use server";

import { z } from "zod";
import * as repo from "@/lib/db/repo";
import { generateSwingFeedback, savedSwingFeedback, swingFacts, swingFeedbackKey, type SwingFeedback } from "@/lib/ai/swing-feedback";
import { getProvider } from "@/lib/ai/provider";
import { loadSwingComparison } from "@/lib/swing-comparison";

/** One generation per recording at a time, even when a page mounts twice. */
const writing = new Map<string, Promise<SwingFeedback>>();

export async function getSwingFeedbackAction(sessionId: string, referenceId?: string): Promise<{ ok: boolean; feedback?: SwingFeedback }> {
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
    const provider = getProvider();
    const key = swingFeedbackKey(current, session.club, provider.model, selected ? { id: selected.session.id, model: selected.model } : undefined);
    const saved = savedSwingFeedback(current, key);
    if (saved) return { ok: true, feedback: saved };
    const job = `${user.id}:${key}`;
    let pending = writing.get(job);
    if (!pending) {
      pending = generateSwingFeedback(swingFacts(current, session.club, comparison), provider).finally(() => writing.delete(job));
      writing.set(job, pending);
    }
    const feedback = await pending;
    // Rules output is rebuilt for free on every visit; only written feedback is worth keeping.
    if (feedback.source === "ai") {
      await repo.saveSwingModel(user.id, sessionId, { ...model, feedback: { key, data: feedback } }, {
        revision: model.revision ?? null, videoUrl: session.video_url, clipStart: session.clip_start, clipEnd: session.clip_end,
      }, true).catch(() => undefined); // A newer review won the race; this feedback belongs to stale tracks.
    }
    return { ok: true, feedback };
  } catch { return { ok: false }; }
}
