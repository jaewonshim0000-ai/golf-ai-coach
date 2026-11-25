import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { SessionBuilder, type PlanPreview } from "@/components/practice/session-builder";
import { ButtonLink, RoundButton, ScreenTitle, TopBar } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { PRACTICE_GOALS, earnedTolerance, goalForWeakness, type GoalId } from "@/lib/practice/goals";
import { planDefaults } from "@/lib/practice/plan-defaults";
import { PLAN_LENGTHS, buildPlan, planLengthFor } from "@/lib/practice/plan";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import { goalsForDrill } from "@/lib/practice/drill-priorities";

export const metadata: Metadata = { title: "Build a session" };
export const dynamic = "force-dynamic";

export default async function StartPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ goal?: string }>;
}) {
  const user = await repo.currentUser();
  if (!user) return null;
  const [state, search] = await Promise.all([loadPlayerState(user.id), searchParams]);

  const { priorities, recommended, preferredGoal, lastOffsets } = planDefaults(state);
  // Links arrive with a goal, a drill id or a weakness id.
  const asked =
    PRACTICE_GOALS.find((goal) => goal.id === search.goal || `drill_${goal.id}` === search.goal)?.id ??
    (DRILLS_BY_ID.has(search.goal ?? "") ? goalsForDrill(DRILLS_BY_ID.get(search.goal!)!)[0] : undefined) ??
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
      const plan = buildPlan(minutes, goal.id, last, priorities.map(({ drill }) => drill.id));
      previews[`${minutes}:${goal.id}`] = {
        title: plan.title,
        blocks: plan.items.map((item) => ({
          block: item.block,
          duration: item.duration,
          name: DRILLS_BY_ID.get(item.drill_id)?.name ?? item.drill_id,
          objective: item.objective,
          prioritized: state.practiceDrillPriorities.includes(item.drill_id),
        })),
      };
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <TopBar
        left={
          <RoundButton href="/practice" label="Back to Practice">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
        right={
          <ButtonLink href="/practice/drills" variant="secondary" className="h-10 px-3.5 text-[11px]">
            Drill library
          </ButtonLink>
        }
      />
      <ScreenTitle>
        Build a
        <br />
        session
      </ScreenTitle>
      <SessionBuilder
        goals={PRACTICE_GOALS.map((goal) => goal.id)}
        recommended={recommended}
        priorityGoal={state.weaknesses[0] ? goalForWeakness(state.weaknesses[0]) : null}
        priorityLost={state.weaknesses[0]?.strokes_lost_per_round ?? null}
        initialGoal={asked ?? preferredGoal ?? recommended}
        initialMinutes={planLengthFor(state.profile?.typical_practice_duration)}
        previews={previews}
        bands={bands}
        priorityNames={priorities.map(({ drill }) => drill.name)}
      />
    </div>
  );
}
