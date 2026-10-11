import { createHash } from "node:crypto";
import { z } from "zod";
import { getProvider, type AIProvider } from "./provider";
import type { FaceOnReview } from "../golf/face-on-review";

const selection = z.object({ drill: z.enum(["repeat_rhythm", "easy_practice_swings"]) }).strict();
export type FaceOnPractice = FaceOnReview["practice"] & { source: "ai" | "rules" };

/** Claude may select a repeatability exercise, never invent evidence or diagnose
 * faults. All displayed instructions are maintained by the application. */
export async function coachFaceOn(review: FaceOnReview, club: string, provider: AIProvider = getProvider()): Promise<FaceOnPractice> {
  if (review.status === "record_again" || !review.metrics.length) return { ...review.practice, source: "rules" };
  const result = await provider.generate({
    name: "face-on-practice", schema: selection, timeoutMs: 12000, maxTokens: 100,
    system: "Select one gentle golf repeatability exercise. Observed body movement is not a diagnosed fault. Do not invent a technique problem, use motion thresholds, or prescribe freezing the head or hips. Reply with JSON only: {\"drill\":\"repeat_rhythm\"} or {\"drill\":\"easy_practice_swings\"}.",
    prompt: JSON.stringify({ club, scope: review.scope, observations: review.metrics.map((m) => m.evidence), choices: {
      repeat_rhythm: "Three comfortable practice swings then three balls at the same pace, comparing contact and a new recording.",
      easy_practice_swings: "Three slow practice swings without a ball, followed by a new recording. Observe natural head and hip movement without holding either still.",
    } }),
    fallback: () => ({ drill: "repeat_rhythm" as const }),
  });
  return result.data.drill === "easy_practice_swings" ? {
    title: "Repeat an easy practice swing", source: result.source,
    steps: ["Make three slow practice swings without a ball. Let your head and hips move naturally.",
      "Record another swing from the same phone position and compare the setup guides.",
      "Return to hitting balls at a comfortable pace and judge the result by contact."],
    check: review.practice.check,
  } : { ...review.practice, source: result.source };
}

const cache = new Map<string, { until: number; result: Promise<FaceOnPractice> }>();
export function faceOnFingerprint(review: FaceOnReview, club: string, model: string | null): string {
  return createHash("sha256").update(JSON.stringify({ version: 1, review, club, model })).digest("hex");
}
export function cachedFaceOnPractice(owner: string, key: string, compute: () => Promise<FaceOnPractice>): Promise<FaceOnPractice> {
  const id = `${owner}:${key}`, existing = cache.get(id);
  if (existing && existing.until > Date.now()) return existing.result;
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  const entry = { until: Date.now() + 60000, result: compute() };
  entry.result = entry.result.then((result) => { entry.until = Date.now() + (result.source === "ai" ? 1800000 : 30000); return result; }, (error) => { cache.delete(id); throw error; });
  cache.set(id, entry);
  return entry.result;
}
