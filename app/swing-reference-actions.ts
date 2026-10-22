"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import * as repo from "@/lib/db/repo";
import { swingReferenceSchema, currentSwingModel } from "@/lib/golf/swing-reference";
import { comparisonAnchors } from "@/lib/golf/swing-comparison";

export async function saveSwingReferenceAction(sessionId: string, input: unknown): Promise<{ ok: boolean; message: string }> {
  const user = await repo.currentUser();
  if (!user || !z.string().min(1).max(80).safeParse(sessionId).success) return { ok: false, message: "Sign in to manage your reference library." };
  const parsed = swingReferenceSchema.nullable().safeParse(input);
  if (!parsed.success) return { ok: false, message: "Enter a reference name and confirm you can use this video." };
  try {
    const sessions = await repo.getSwingSessions(user.id), session = sessions.find((row) => row.id === sessionId);
    const model = session ? await repo.getSwingModel(user.id, sessionId) : null;
    if (!session || !model) return { ok: false, message: "Review this video before saving it as a reference." };
    if (parsed.data && (!currentSwingModel(model, session) || !comparisonAnchors(model) || model.cameraAngle === "other"))
      return { ok: false, message: "Choose the camera view and mark setup, top and contact before saving this reference." };
    await repo.saveSwingReference(user.id, sessionId, parsed.data);
    revalidatePath("/swing"); revalidatePath("/swing/references"); revalidatePath(`/swing/${sessionId}`);
    return { ok: true, message: parsed.data ? "Reference saved. Matching swings can now use it." : "Removed from the reference library. Your video is still saved." };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "The reference could not be saved." }; }
}
