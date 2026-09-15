import { Suspense } from "react";
import type { Metadata } from "next";

import { resetDemoAction } from "@/app/actions";
import {
  CoachInsight,
  CurrentFocus,
  DemoNotice,
  PerformanceOverview,
  PracticeProgress,
  RecentRound,
  TodaysSession,
  TrendsCard,
  WeaknessList,
} from "@/components/dashboard/sections";
import { Card, CardContent, Skeleton } from "@/components/ui/primitives";
import { generateCoachingInsight } from "@/lib/ai/coaching";
import * as repo from "@/lib/db/repo";
import { loadPlayerState, todaysSession } from "@/lib/player-state";
import { greeting } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await repo.currentUser();
  if (!user) return null;

  const state = await loadPlayerState(user.id);
  const priority = state.weaknesses[0] ?? null;

  return (
    <div className="space-y-6">
      {repo.mode() === "demo" ? <DemoNotice onReset={resetDemoAction} /> : null}

      <header className="rise">
        <p className="text-sm text-fg-muted">{greeting()}</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {state.profile?.display_name ?? "Player"}
        </h1>
      </header>

      <div className="rise">
        <CurrentFocus weakness={priority} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <Suspense fallback={<InsightSkeleton />}>
          <CoachInsightSection userId={user.id} />
        </Suspense>
        <TodaysSession session={todaysSession(state)} state={state} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <PerformanceOverview state={state} />
        <RecentRound state={state} />
      </div>

      <WeaknessList
        weaknesses={state.weaknesses}
        title="Where the strokes are going"
        description="Ranked by how much they cost, how confident we are, and how much practice tends to move them."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <PracticeProgress state={state} />
        <TrendsCard state={state} />
      </div>
    </div>
  );
}

/**
 * The AI call is the only slow part of this page, so it streams in separately
 * rather than holding up the deterministic numbers.
 */
async function CoachInsightSection({ userId }: { userId: string }) {
  const state = await loadPlayerState(userId);
  if (!state.context) return null;
  const insight = await generateCoachingInsight(state.context, state.weaknesses);
  return <CoachInsight result={insight} />;
}

function InsightSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
      </CardContent>
    </Card>
  );
}
