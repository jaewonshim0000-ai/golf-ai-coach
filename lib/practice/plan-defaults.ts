import type { PlayerState } from "../player-state";
import { goalsForDrill, rankPracticeDrills } from "./drill-priorities";
import { goalForWeakness, type GoalId } from "./goals";
import { buildPlan, planLengthFor } from "./plan";

/**
 * Where Build a session starts: the goal it recommends, the drills the player
 * saved, and the last test per goal, which sets today's band. Practice home
 * previews the same plan, so the two never disagree.
 */
export function planDefaults(state: PlayerState) {
  const ranked = rankPracticeDrills(state.drills, state);
  const priorities = ranked.filter(({ drill }) => state.practiceDrillPriorities.includes(drill.id));
  const needed = ranked.find((entry) => entry.reason);
  const recommended: GoalId = needed ? goalsForDrill(needed.drill)[0]! : goalForWeakness(state.weaknesses[0] ?? null);
  const preferredGoal = priorities[0] ? goalsForDrill(priorities[0].drill)[0] : undefined;
  const lastOffsets = (goal: GoalId) =>
    state.drillAttempts
      .filter((attempt) => attempt.drill_id === `drill_${goal}` && attempt.shot_offsets?.length)
      .sort((a, b) => a.completed_at.localeCompare(b.completed_at))
      .at(-1)?.shot_offsets;
  return { ranked, priorities, recommended, preferredGoal, lastOffsets };
}

/** The plan Build a session opens on, at the player's usual length. */
export function defaultPlan(state: PlayerState) {
  const { priorities, recommended, preferredGoal, lastOffsets } = planDefaults(state);
  const goal = preferredGoal ?? recommended;
  const minutes = planLengthFor(state.profile?.typical_practice_duration);
  return { minutes, plan: buildPlan(minutes, goal, lastOffsets(goal), priorities.map(({ drill }) => drill.id)) };
}
