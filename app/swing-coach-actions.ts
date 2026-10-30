"use server";

import { z } from "zod";
import * as repo from "@/lib/db/repo";
import { generateSwingFeedback, savedSwingFeedback, swingFacts, swingFeedbackKey, type SwingFeedback } from "@/lib/ai/swing-feedback";
import { getProvider } from "@/lib/ai/provider";
import { GPP_VERSION } from "@/lib/golfposepro/result";

/** Up to six key-frame JPEGs, base64 without a data: prefix. */
const imagesSchema = z.array(z.string().max(400_000).regex(/^\/9j\/[A-Za-z0-9+/]+=*$/)).max(6);

/** One generation per recording at a time, even when a page mounts twice. */
const writing = new Map<string, Promise<SwingFeedback>>();

/**
 * Comprehensive coaching from GolfPosePro's saved values, with the key frames
 * the browser drew from the video. Written once per result and saved.
 */
export async function getSwingFeedbackAction(sessionId: string, images: string[] = []): Promise<{ ok: boolean; feedback?: SwingFeedback }> {
  const user = await repo.currentUser();
  const frames = imagesSchema.safeParse(images);
  if (!user || !z.string().min(1).max(80).safeParse(sessionId).success || !frames.success) return { ok: false };
  try {
    const [sessions, model] = await Promise.all([repo.getSwingSessions(user.id), repo.getSwingModel(user.id, sessionId)]);
    const session = sessions.find((s) => s.id === sessionId);
    const result = model?.golfPosePro;
    if (!session || !model || result?.version !== GPP_VERSION) return { ok: false };
    const provider = getProvider();
    const key = swingFeedbackKey(result, session.club, model.handedness, provider.model);
    const saved = savedSwingFeedback(model.feedback, key);
    if (saved) return { ok: true, feedback: saved };
    const job = `${user.id}:${key}`;
    let pending = writing.get(job);
    if (!pending) {
      pending = generateSwingFeedback(swingFacts(result, session.club, model.handedness), provider, frames.data).finally(() => writing.delete(job));
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
