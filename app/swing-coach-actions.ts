"use server";

import { z } from "zod";
import * as repo from "@/lib/db/repo";
import { swingFeedback } from "@/lib/golf/faults";
import { analyseVideoModel } from "@/lib/golf/video-review";
import { cachedFaultCoaching, coachFaults, faultFingerprint, type FaultCoaching } from "@/lib/ai/fault-coach";
import { getProvider } from "@/lib/ai/provider";

/** Re-ranks from the stored swing, so the client cannot supply the evidence Claude explains. */
export async function getFaultCoachingAction(sessionId: string): Promise<{ ok: boolean; coaching?: FaultCoaching }> {
  const user = await repo.currentUser();
  if (!user || !z.string().min(1).max(80).safeParse(sessionId).success) return { ok: false };
  try {
    const [sessions, model] = await Promise.all([repo.getSwingSessions(user.id), repo.getSwingModel(user.id, sessionId)]);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session || !model?.imageFrames || !model.aspect) return { ok: false };
    if (model.clip && (Math.abs(model.clip[0] - (session.clip_start ?? 0)) > 0.1 ||
        (session.clip_end !== null && Math.abs(model.clip[1] - session.clip_end) > 0.1))) return { ok: false };
    const { feedback } = swingFeedback(model, analyseVideoModel(model), session.club);
    if (!feedback.primary) return { ok: false };
    const flight = model.ballFlight ?? null;
    const key = faultFingerprint(feedback, flight, session.club, getProvider().model);
    const coaching = await cachedFaultCoaching(`${user.id}:${sessionId}`, key, () => coachFaults(feedback, flight, session.club));
    return { ok: true, coaching };
  } catch { return { ok: false }; }
}
