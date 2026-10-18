import { createHash } from "node:crypto";
import { z } from "zod";
import { getProvider, type AIProvider } from "./provider";
import { describeFlight, type FeedbackCard, type SwingFeedback } from "../golf/faults";
import type { BallFlight } from "../golf/pose";

export type FaultExplanation = { id: string; drill: string; text: string };
export type FaultCoaching = { explanations: FaultExplanation[]; source: "ai" | "rules" };

const numbers = (text: string) => text.match(/\d+(?:\.\d+)?/g) ?? [];

/**
 * Claude only words the explanation on cards the rules already ranked. It
 * keeps each card's id and order, leads with one of that card's own drills,
 * and may not write a number it was not given; anything else falls back to
 * the rule-based wording. Video frames and joints are never sent.
 */
export async function coachFaults(feedback: SwingFeedback, flight: BallFlight | null, club: string, provider: AIProvider = getProvider()): Promise<FaultCoaching> {
  const cards = [feedback.primary, feedback.secondary].filter((card): card is FeedbackCard => Boolean(card));
  const rules = () => ({ explanations: cards.map((card) => ({ id: card.id, drill: card.drills[0]!.id, text: card.why })) });
  if (!cards.length) return { ...rules(), source: "rules" };
  const prompt = JSON.stringify({
    club, shot: flight ? describeFlight(flight) : "not reported",
    cards: cards.map((card) => ({ id: card.id, title: card.title, seen: card.seen, why: card.why, feel: card.feel,
      drills: card.drills.map((drill) => ({ id: drill.id, name: drill.name })) })),
  });
  const given = new Set(numbers(prompt));
  const schema = z.object({
    explanations: z.array(z.object({ id: z.string(), drill: z.string(), text: z.string().trim().min(40).max(600) }).strict()).length(cards.length),
  }).strict().superRefine((value, ctx) => value.explanations.forEach((row, index) => {
    const card = cards[index]!;
    if (row.id !== card.id) ctx.addIssue({ code: "custom", message: "cards keep their ids and order" });
    if (!card.drills.some((drill) => drill.id === row.drill)) ctx.addIssue({ code: "custom", message: "drill from this card only" });
    if (numbers(row.text).some((n) => !given.has(n))) ctx.addIssue({ code: "custom", message: "no new numbers" });
  }));
  const result = await provider.generate({
    name: "swing-fault-feedback", schema, timeoutMs: 12000, maxTokens: 1500,
    system: `You word the explanation on golf swing feedback cards. The app has already measured the swing from 2D video and ranked the faults against the shot the player described; you only explain each card to the player in a coach's voice.
Rules:
- Keep every card's id, in the order given. Pick the drill to lead with from that card's own drills.
- Two or three short sentences per card, under 80 words, speaking to the player as "you".
- Use only the facts on the card. Do not add a fault, a cause, a drill or a measurement. Write no number that is not in the input, and no numbers in words.
- The camera cannot see the clubface, the club's low point or the ball. Never say it did.
Reply with JSON only: {"explanations":[{"id":"<card id>","drill":"<drill id>","text":"<explanation>"}]}`,
    prompt,
    fallback: rules,
  });
  return { ...result.data, source: result.source };
}

const cache = new Map<string, { until: number; result: Promise<FaultCoaching> }>();
export function faultFingerprint(feedback: SwingFeedback, flight: BallFlight | null, club: string, model: string | null): string {
  return createHash("sha256").update(JSON.stringify({ version: 1, feedback, flight, club, model })).digest("hex");
}
/** Identical requests share one call; a fallback is retried sooner than a model answer. */
export function cachedFaultCoaching(owner: string, key: string, compute: () => Promise<FaultCoaching>): Promise<FaultCoaching> {
  const id = `${owner}:${key}`, existing = cache.get(id);
  if (existing && existing.until > Date.now()) return existing.result;
  if (cache.size >= 64) cache.delete(cache.keys().next().value!);
  const entry = { until: Date.now() + 60000, result: compute() };
  entry.result = entry.result.then((result) => { entry.until = Date.now() + (result.source === "ai" ? 1800000 : 30000); return result; }, (error) => { cache.delete(id); throw error; });
  cache.set(id, entry);
  return entry.result;
}
