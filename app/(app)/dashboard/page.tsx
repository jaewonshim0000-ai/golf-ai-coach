import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { User } from "lucide-react";

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
import { Card, CardContent, HeroPill, PageHero, Skeleton } from "@/components/ui/primitives";
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
  const name = state.profile?.display_name ?? "Player";
  const handicap = state.profile?.handicap_index;

  return (
    <div className="space-y-5">
      <PageHero
        art="course"
        size="lg"
        eyebrow={greeting()}
        title={name}
        topRight={
          <Link
            href="/profile"
            aria-label="Your profile"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 text-white md:hidden"
          >
            <User className="h-4 w-4" />
          </Link>
        }
        pills={
          <>
            {handicap !== null && handicap !== undefined ? (
              <HeroPill tone="solid">HCP {handicap.toFixed(1)}</HeroPill>
            ) : null}
            <HeroPill>
              {state.rounds.length} round{state.rounds.length === 1 ? "" : "s"} logged
            </HeroPill>
          </>
        }
      />

      {repo.mode() === "demo" ? <DemoNotice onReset={resetDemoAction} /> : null}

      <div className="rise">
        <CurrentFocus weakness={priority} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <Suspense fallback={<InsightSkeleton />}>
          <CoachInsightSection userId={user.id} />
        </Suspense>
        <TodaysSession session={todaysSession(state)} state={state} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <PerformanceOverview state={state} />
        <RecentRound state={state} />
      </div>

      <WeaknessList
        weaknesses={state.weaknesses}
        title="Where the strokes are going"
        description="Ranked by cost, confidence, and how much practice tends to move them."
      />

      <div className="grid gap-5 lg:grid-cols-2">
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
