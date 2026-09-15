import type { Certainty } from "../../types/practice";
import type { Weakness } from "../../types/analytics";
import { SG_CATEGORY_LABELS } from "../../types/golf";
import { identifyWeaknesses, type WeaknessInputs } from "../analytics/weaknesses";
import { type CoachingContext, renderContext, sampleSizeNotes } from "./context";
import { getProvider, COACH_SYSTEM_PROMPT, type AIResult } from "./provider";
import { coachingInsightSchema, type CoachingInsight } from "./schemas";

/**
 * The reasoning layer. Weakness ranking stays deterministic; the model turns
 * ranked signals into an explanation a player can act on.
 */

export function analyzePlayerWeaknesses(input: WeaknessInputs): Weakness[] {
  return identifyWeaknesses(input);
}

export function certaintyFor(weakness: Weakness): Certainty {
  if (!weakness.sufficient_sample) return "possible";
  if (weakness.confidence >= 0.8) return "observed";
  if (weakness.confidence >= 0.6) return "likely";
  if (weakness.confidence >= 0.4) return "possible";
  return "uncertain";
}

export async function generateCoachingInsight(
  context: CoachingContext,
  weaknesses: Weakness[],
): Promise<AIResult<CoachingInsight>> {
  const provider = getProvider();
  const caveats = sampleSizeNotes(weaknesses);

  return provider.generate({
    name: "coaching_insight",
    system: COACH_SYSTEM_PROMPT,
    maxTokens: 2000,
    prompt: `Here is everything known about this player. All numbers were computed deterministically from their own data.

${renderContext(context)}

${caveats.length > 0 ? `Sample-size constraints you must respect:\n${caveats.map((c) => `- ${c}`).join("\n")}\n` : ""}
Write the coaching insight that connects their course data, practice data and swing data into ONE development priority.

Use weakness_id values exactly as they appear in rankedWeaknesses. Return JSON matching:
{
  "headline": string,
  "primary_priority": { "weakness_id": string, "title": string, "confidence": number, "certainty": "observed"|"likely"|"possible"|"uncertain", "strokes_lost_per_round": number, "reasoning": string[], "evidence": [{ "source": "course"|"practice"|"swing"|"profile", "statement": string }] },
  "secondary_priorities": [same shape, at most 2],
  "cross_system_connection": string,
  "training_recommendation": string,
  "player_message": string,
  "data_caveats": string[]
}`,
    schema: coachingInsightSchema,
    fallback: () => ruleBasedInsight(context, weaknesses),
  });
}

/**
 * Rule-based coaching. Real analysis, no language model: it reads the same
 * ranked weaknesses and evidence and states them in coaching language.
 */
export function ruleBasedInsight(
  context: CoachingContext,
  weaknesses: Weakness[],
): CoachingInsight {
  const primary = weaknesses[0];

  if (!primary) {
    return {
      headline: "Not enough data yet to name a single priority",
      primary_priority: {
        weakness_id: "none",
        title: "Build a baseline",
        confidence: 0.2,
        certainty: "uncertain",
        strokes_lost_per_round: 0,
        reasoning: [
          `You have ${context.dataCoverage.rounds} logged round${context.dataCoverage.rounds === 1 ? "" : "s"} and ${context.dataCoverage.shots} shots on file.`,
          "Until there are enough shots in each category, any conclusion would be guesswork.",
        ],
        evidence: [],
      },
      secondary_priorities: [],
      cross_system_connection:
        "There is not yet enough overlap between your course, practice and swing data to connect them honestly.",
      training_recommendation:
        "Log one full round shot by shot and two practice sessions. That is normally enough to pick out a real pattern.",
      player_message:
        "Nothing to diagnose yet, and I would rather tell you that than invent a weakness. Get a round and a couple of sessions in and there will be something real to work on.",
      data_caveats: ["No weakness can be confirmed from the current sample."],
    };
  }

  const courseEvidence = primary.evidence.filter((e) => e.source === "course");
  const practiceEvidence = primary.evidence.filter((e) => e.source === "practice");
  const swingEvidence = primary.evidence.filter((e) => e.source === "swing");

  const connection = buildConnection(primary, practiceEvidence.length > 0, swingEvidence.length > 0);

  const reasoning = [
    courseEvidence[0]?.statement ??
      `Course data shows ${primary.strokes_lost_per_round.toFixed(2)} strokes per round lost from ${primary.title.toLowerCase()}.`,
    ...practiceEvidence.map((e) => e.statement),
    ...swingEvidence.map((e) => e.statement),
    primary.trend_label === "declining"
      ? "This area is also trending the wrong way over your recent rounds, which moves it up the list."
      : primary.trend_label === "improving"
        ? "It is already trending upward, so the plan protects what is working rather than rebuilding it."
        : `Trend is flat across the current sample.`,
  ];

  return {
    headline: primary.sufficient_sample
      ? `Your biggest development area right now is ${primary.title.toLowerCase()}`
      : `Early signal: ${primary.title.toLowerCase()} may be costing you shots`,
    primary_priority: {
      weakness_id: primary.id,
      title: primary.title,
      confidence: primary.confidence,
      certainty: certaintyFor(primary),
      strokes_lost_per_round: primary.strokes_lost_per_round,
      reasoning,
      evidence: primary.evidence.map((e) => ({ source: e.source, statement: e.statement })),
    },
    secondary_priorities: weaknesses.slice(1, 3).map((w) => ({
      weakness_id: w.id,
      title: w.title,
      confidence: w.confidence,
      certainty: certaintyFor(w),
      strokes_lost_per_round: w.strokes_lost_per_round,
      reasoning: [w.evidence[0]?.statement ?? w.recommended_action],
      evidence: w.evidence.slice(0, 2).map((e) => ({ source: e.source, statement: e.statement })),
    })),
    cross_system_connection: connection,
    training_recommendation: primary.recommended_action,
    player_message: playerMessage(primary, context),
    data_caveats: sampleSizeNotes(weaknesses).slice(0, 3),
  };
}

function buildConnection(primary: Weakness, hasPractice: boolean, hasSwing: boolean): string {
  const area = primary.title.toLowerCase();
  if (hasPractice && hasSwing) {
    return `Three separate data sources point at the same thing. Your course data says you are losing shots from ${area}. Your practice data says the skill underneath it has not reached its target. Your swing analysis flagged something consistent with that. These may well be the same problem showing up three different ways, so we will treat them as one development area rather than three.`;
  }
  if (hasPractice) {
    return `Your course data and your practice data agree here: ${area} is costing you strokes, and the underlying skill has not reached its target in practice. That is a consistent picture, though without swing data we cannot say why it is happening.`;
  }
  if (hasSwing) {
    return `Your course data shows losses from ${area}, and your swing analysis flagged something that may explain it. There is no practice data on this skill yet, so the link is possible rather than established.`;
  }
  return `So far this shows up only in your course data. It is a real loss of ${primary.strokes_lost_per_round.toFixed(2)} strokes per round, but practice and swing data would tell us whether the cause is technical or a skill gap.`;
}

function playerMessage(primary: Weakness, context: CoachingContext): string {
  const total = context.strokesGainedSummary.perRound;
  const strongest = [...context.strokesGainedSummary.byCategory]
    .filter((c) => c.shots > 0)
    .sort((a, b) => b.perRound - a.perRound)[0];

  const opening = primary.sufficient_sample
    ? `You are giving away ${primary.strokes_lost_per_round.toFixed(1)} strokes a round from ${primary.title.toLowerCase()}. That is the single biggest thing standing between you and a lower score.`
    : `${primary.title} looks like it might be costing you shots, but with ${primary.sample_size} shots on file I would call that a signal rather than a verdict.`;

  // Against a Tour baseline a good amateur category can still be negative, so
  // only call something a strength when it actually is one.
  const strength = !strongest
    ? ""
    : strongest.perRound >= 0
      ? ` ${strongest.category} is a genuine strength (+${strongest.perRound.toFixed(2)} per round), so leave it alone.`
      : ` ${strongest.category} is your strongest category (${strongest.perRound.toFixed(2)} per round against Tour), so it is not where the work belongs right now.`;

  const overall =
    context.dataCoverage.rounds > 0
      ? ` Across ${context.dataCoverage.rounds} round${context.dataCoverage.rounds === 1 ? "" : "s"} you are at ${total >= 0 ? "+" : ""}${total.toFixed(1)} strokes per round against the ${context.dataCoverage.baseline} baseline.`
      : "";

  return `${opening}${strength}${overall} ${primary.recommended_action}`;
}

/** Turns an insight priority back into the weakness it refers to, if it is real. */
export function resolvePriority(
  insight: CoachingInsight,
  weaknesses: Weakness[],
): Weakness | null {
  return weaknesses.find((w) => w.id === insight.primary_priority.weakness_id) ?? weaknesses[0] ?? null;
}

export function categoryLabel(category: string): string {
  return SG_CATEGORY_LABELS[category as keyof typeof SG_CATEGORY_LABELS] ?? category;
}
