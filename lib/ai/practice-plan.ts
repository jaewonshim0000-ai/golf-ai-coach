import type { PracticeMetricTrend, Weakness } from "../../types/analytics";
import type { PlayerProfile } from "../../types/player";
import type { PlanSession, PracticeBlock, Skill, TrainingPlan } from "../../types/practice";
import { SKILLS } from "../../types/practice";
import { DRILLS_BY_ID } from "../seed/drills";
import {
  buildPlanSkeleton,
  evaluatePlanProgress,
  type PlanProgress,
  type PlanSkeleton,
} from "../practice/plan-builder";
import { type CoachingContext, renderContext } from "./context";
import { COACH_SYSTEM_PROMPT, getProvider, type AIResult } from "./provider";
import {
  planAdaptationSchema,
  practicePlanSchema,
  type PlanAdaptationOutput,
  type PracticePlanOutput,
} from "./schemas";

/**
 * Plan generation is a collaboration:
 *  - deterministic code decides the calendar, the drills and the target numbers
 *  - the model decides emphasis, ordering and how it is explained
 *  - deterministic code then validates every drill id before anything is stored
 *
 * The model can never introduce a drill that does not exist or a target that
 * was not derived from the player's own baseline.
 */

export type GeneratePlanInput = {
  profile: PlayerProfile;
  weaknesses: Weakness[];
  practiceTrends: PracticeMetricTrend[];
  context: CoachingContext;
  weeks?: number;
  startsOn: string;
};

export type GeneratedPlan = {
  plan: TrainingPlan;
  sessions: PlanSession[];
  progressionNote: string;
};

export async function generatePracticePlan(
  input: GeneratePlanInput,
): Promise<AIResult<GeneratedPlan>> {
  const skeleton = buildPlanSkeleton({
    profile: input.profile,
    weaknesses: input.weaknesses,
    practiceTrends: input.practiceTrends,
    weeks: input.weeks ?? 2,
    startsOn: input.startsOn,
  });

  const provider = getProvider();
  const result = await provider.generate<PracticePlanOutput>({
    name: "practice_plan",
    system: COACH_SYSTEM_PROMPT,
    maxTokens: 4000,
    prompt: `Build this player's next training block.

PLAYER CONTEXT (all computed from their own data):
${renderContext(input.context)}

DETERMINISTIC SKELETON (calendar, drills and targets already validated against the drill library and the player's own baselines):
${JSON.stringify(
  {
    weeks: skeleton.plan.weeks,
    targets: skeleton.plan.targets,
    sessions: skeleton.sessions.map((s) => ({
      week: s.week,
      day: s.day,
      is_rest: s.is_rest,
      block_emphasis: s.block_emphasis,
      duration: s.duration,
      drill_ids: s.drill_ids,
    })),
  },
  null,
  1,
)}

You may reorder blocks, retitle sessions, rewrite objectives, and swap drills for others in availableDrills.
You may NOT invent drill ids, change the number of weeks, or set a target the player has no baseline for.
Targets must be measurable, e.g. "increase solid-contact rate from 61% to 73%", never "practise your irons more".

Return JSON matching:
{
  "title": string,
  "primary_goal": string,
  "rationale": string,
  "weeks": number,
  "targets": [{ "metric": string, "skill": string, "baseline": number, "target": number, "unit": string }],
  "sessions": [{ "week": number, "day": number, "title": string, "objective": string, "block_emphasis": "warm_up"|"technical"|"skill"|"variable"|"pressure"|"reflection", "duration": number, "drill_ids": string[], "is_rest": boolean }],
  "progression_note": string
}`,
    schema: practicePlanSchema,
    fallback: () => skeletonAsOutput(skeleton),
  });

  return {
    ...result,
    data: materializePlan(result.data, skeleton, result.source === "ai" ? "ai" : "rules"),
  };
}

function skeletonAsOutput(skeleton: PlanSkeleton): PracticePlanOutput {
  return {
    title: skeleton.plan.title,
    primary_goal: skeleton.plan.primary_goal,
    rationale: skeleton.plan.rationale,
    weeks: skeleton.plan.weeks,
    targets: skeleton.plan.targets,
    sessions: skeleton.sessions.map((s) => ({
      week: s.week,
      day: s.day,
      title: s.title,
      objective: s.objective,
      block_emphasis: s.block_emphasis,
      duration: s.duration,
      drill_ids: s.drill_ids,
      is_rest: s.is_rest,
    })),
    progression_note:
      "Blocked technical work first, then measured skill work, then random practice, then pressure. Difficulty only increases once the metric moves.",
  };
}

/**
 * Validates AI output against reality and merges it with the skeleton.
 * Unknown drill ids are dropped; a session left with nothing keeps the
 * skeleton's drills.
 */
export function materializePlan(
  output: PracticePlanOutput,
  skeleton: PlanSkeleton,
  generatedBy: "ai" | "rules",
): GeneratedPlan {
  const skeletonByDay = new Map(skeleton.sessions.map((s) => [`${s.week}:${s.day}`, s]));

  const sessions: PlanSession[] = skeleton.sessions.map((base) => {
    const proposed = output.sessions.find((s) => s.week === base.week && s.day === base.day);
    if (!proposed) return base;

    const validDrills = proposed.drill_ids.filter((id) => DRILLS_BY_ID.has(id));
    const drillIds = validDrills.length > 0 ? [...new Set(validDrills)] : base.drill_ids;

    return {
      ...base,
      title: proposed.title || base.title,
      objective: proposed.objective || base.objective,
      block_emphasis: proposed.block_emphasis as PracticeBlock,
      duration: proposed.is_rest ? 0 : clampDuration(proposed.duration, base.duration),
      drill_ids: proposed.is_rest ? [] : drillIds,
      is_rest: proposed.is_rest,
    };
  });

  // Any week/day the model returned that the skeleton did not have is ignored.
  for (const proposed of output.sessions) {
    if (!skeletonByDay.has(`${proposed.week}:${proposed.day}`)) continue;
  }

  const targets = output.targets
    .filter((t): t is typeof t & { skill: Skill } => (SKILLS as readonly string[]).includes(t.skill))
    .map((t) => ({ ...t, skill: t.skill }));

  const plan: TrainingPlan = {
    ...skeleton.plan,
    title: output.title || skeleton.plan.title,
    primary_goal: output.primary_goal || skeleton.plan.primary_goal,
    rationale: output.rationale || skeleton.plan.rationale,
    targets: targets.length > 0 ? targets : skeleton.plan.targets,
    generated_by: generatedBy,
  };

  return { plan, sessions, progressionNote: output.progression_note };
}

function clampDuration(proposed: number, fallback: number): number {
  if (!Number.isFinite(proposed) || proposed <= 0) return fallback;
  return Math.min(240, Math.max(10, Math.round(proposed)));
}

export type AdaptPlanInput = {
  plan: TrainingPlan;
  sessions: PlanSession[];
  practiceTrends: PracticeMetricTrend[];
  context: CoachingContext;
  trigger: string;
};

export type PlanAdaptationResult = PlanAdaptationOutput & { progress: PlanProgress };

export async function adaptPracticePlan(
  input: AdaptPlanInput,
): Promise<AIResult<PlanAdaptationResult>> {
  const progress = evaluatePlanProgress(input.plan, input.sessions, input.practiceTrends);
  const provider = getProvider();

  const result = await provider.generate<PlanAdaptationOutput>({
    name: "plan_adaptation",
    system: COACH_SYSTEM_PROMPT,
    maxTokens: 1200,
    prompt: `A training block is underway. Deterministic code has already evaluated progress. Explain it and decide what changes.

TRIGGER: ${input.trigger}

PLAN:
${JSON.stringify({ title: input.plan.title, goal: input.plan.primary_goal, targets: input.plan.targets }, null, 1)}

COMPUTED PROGRESS (do not recompute, do not contradict):
${JSON.stringify(progress, null, 1)}

PLAYER CONTEXT:
${renderContext(input.context)}

Return JSON matching:
{ "verdict": "on_track"|"ahead"|"stalled"|"regressing", "summary": string, "changes": string[], "next_session_focus": string }

The verdict must equal the computed verdict.`,
    schema: planAdaptationSchema,
    fallback: () => ruleBasedAdaptation(progress, input.plan),
  });

  // The model does not get to overrule the arithmetic.
  return { ...result, data: { ...result.data, verdict: progress.verdict, progress } };
}

export function ruleBasedAdaptation(
  progress: PlanProgress,
  plan: TrainingPlan,
): PlanAdaptationOutput {
  const moved = progress.target_progress.filter((t) => t.latest !== null);
  const detail = moved
    .map(
      (t) =>
        `${t.metric}: ${formatValue(t.baseline)} at the start, ${formatValue(t.latest!)} now, target ${formatValue(t.target)}.`,
    )
    .join(" ");

  const summaries: Record<PlanProgress["verdict"], string> = {
    ahead: `You have hit the targets for this block. ${detail} That is the point at which more blocked repetition stops paying, so the work shifts toward random and pressure practice.`,
    on_track: `The block is doing what it should. ${detail} Nothing to change structurally.`,
    stalled: `You are doing the sessions but the number is not moving. ${detail} That usually means the task is too hard to give clean feedback, not that you need to try harder.`,
    regressing: `The metric has gone backwards. ${detail} This drill may not be transferring, so we simplify and re-test before adding anything.`,
  };

  const changes: Record<PlanProgress["verdict"], string[]> = {
    ahead: [
      "Cut the technical block roughly in half.",
      "Add a random-practice block with a different club and target on every shot.",
      "Introduce a one-ball pressure test at the end of each session.",
    ],
    on_track: [
      "Keep the current drill and target.",
      "Add one variable-practice block per week to start testing transfer.",
    ],
    stalled: [
      "Swap to the regression drill for this skill and rebuild the feedback loop.",
      "Halve the number of balls and double the attention per rep.",
      "Re-test the original metric at the end of the week.",
    ],
    regressing: [
      "Drop to the regression drill immediately.",
      "Reduce swing speed to 70% until the metric recovers.",
      "Re-assess before adding any variability or pressure back in.",
    ],
  };

  return {
    verdict: progress.verdict,
    summary: `${summaries[progress.verdict]} ${progress.completed} of ${progress.scheduled} planned sessions complete.`,
    changes: [...changes[progress.verdict], ...progress.signals].slice(0, 6),
    next_session_focus:
      progress.verdict === "ahead"
        ? `Random practice built around ${plan.targets[0]?.metric.toLowerCase() ?? "the block target"}.`
        : `Keep the session on ${plan.targets[0]?.metric.toLowerCase() ?? "the block target"} and record the number every time.`,
  };
}

function formatValue(value: number): string {
  return value <= 1 && value >= 0 ? `${Math.round(value * 100)}%` : String(Math.round(value * 100) / 100);
}
