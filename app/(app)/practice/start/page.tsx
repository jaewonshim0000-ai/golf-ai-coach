import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { SessionBuilder, type PlanPreview } from "@/components/practice/session-builder";
import { ButtonLink, PageHero } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { PRACTICE_GOALS, earnedTolerance, goalForWeakness, type GoalId } from "@/lib/practice/goals";
import { PLAN_LENGTHS, buildPlan } from "@/lib/practice/plan";
import { DRILLS_BY_ID } from "@/lib/seed/drills";

export const metadata: Metadata = { title: "Start practice" };
export const dynamic = "force-dynamic";

export default async function StartPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ goal?: string }>;
}) {
  const user = await repo.currentUser();
  if (!user) return null;
  const [state, search] = await Promise.all([loadPlayerState(user.id), searchParams]);

  // The last test per goal sets today's band.
  const lastOffsets = (goal: GoalId) =>
    state.drillAttempts
      .filter((attempt) => attempt.drill_id === `drill_${goal}` && attempt.shot_offsets?.length)
      .sort((a, b) => a.completed_at.localeCompare(b.completed_at))
      .at(-1)?.shot_offsets;

  const recommended = goalForWeakness(state.weaknesses[0] ?? null);
  // Links arrive with a goal, a drill id or a weakness id.
  const asked =
    PRACTICE_GOALS.find((goal) => goal.id === search.goal || `drill_${goal.id}` === search.goal)?.id ??
    (state.weaknesses.some((weakness) => weakness.id === search.goal)
      ? goalForWeakness(state.weaknesses.find((weakness) => weakness.id === search.goal)!)
      : undefined);

  const previews: Record<string, PlanPreview> = {};
  const bands: Partial<Record<GoalId, string>> = {};
  for (const goal of PRACTICE_GOALS) {
    const last = lastOffsets(goal.id);
    const band = earnedTolerance(goal, last);
    if (band !== null) bands[goal.id] = `${band} ${goal.unit === "feet" ? "ft" : "yd"} band${last ? " earned" : ""}`;
    for (const minutes of PLAN_LENGTHS) {
      const plan = buildPlan(minutes, goal.id, last);
      previews[`${minutes}:${goal.id}`] = {
        title: plan.title,
        blocks: plan.items.map((item) => ({
          block: item.block,
          duration: item.duration,
          name: DRILLS_BY_ID.get(item.drill_id)?.name ?? item.drill_id,
          objective: item.objective,
        })),
      };
    }
  }

  return (
    <div className="space-y-5">
      <PageHero
        art="range"
        size="sm"
        eyebrow="Build a plan"
        title="Start practice"
        description="Warm up, work on it, test it, then prove it under pressure."
        topLeft={
          <ButtonLink href="/practice" variant="onHero" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" /> Practice
          </ButtonLink>
        }
      />
      <SessionBuilder
        goals={PRACTICE_GOALS.map((goal) => goal.id)}
        recommended={recommended}
        initialGoal={asked ?? recommended}
        previews={previews}
        bands={bands}
      />
    </div>
  );
}
