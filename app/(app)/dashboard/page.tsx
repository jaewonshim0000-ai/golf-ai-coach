import type { Metadata } from "next";
import Link from "next/link";
import { User } from "lucide-react";

import { resetDemoAction } from "@/app/actions";
import {
  CurrentFocus,
  DemoNotice,
  PerformanceOverview,
  RecentRound,
  TodaysSession,
} from "@/components/dashboard/sections";
import { BaselinePicker } from "@/components/stats/baseline-picker";
import { HeroPill, PageHero } from "@/components/ui/primitives";
import { baselineForHandicap, getBaseline, rebaseSummary } from "@/lib/golf/baselines";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { greeting } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ baseline?: string }>;
}) {
  const user = await repo.currentUser();
  if (!user) return null;

  const [state, search] = await Promise.all([loadPlayerState(user.id), searchParams]);
  const handicap = state.profile?.handicap_index ?? null;

  // Default to the player's own level, because "-10.7 against the Tour" is a
  // true number that answers a question nobody asked.
  const baseline = search.baseline ? getBaseline(search.baseline) : baselineForHandicap(handicap);
  const summary = rebaseSummary(state.summary, baseline);

  return (
    <div className="space-y-5">
      <PageHero
        art="course"
        eyebrow={greeting()}
        title={state.profile?.display_name ?? "Player"}
        topRight={
          <Link
            href="/profile"
            aria-label="Profile"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 text-white md:hidden"
          >
            <User className="h-4 w-4" />
          </Link>
        }
        pills={
          <>
            {handicap !== null ? <HeroPill tone="solid">HCP {handicap.toFixed(1)}</HeroPill> : null}
            <HeroPill>{state.rounds.length} rounds</HeroPill>
          </>
        }
      />

      {repo.mode() === "demo" ? <DemoNotice onReset={resetDemoAction} /> : null}

      <div className="rise">
        <CurrentFocus weakness={state.weaknesses[0] ?? null} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <TodaysSession session={state.session} />
        <PerformanceOverview
          state={{ ...state, summary }}
          baseline={baseline}
          control={<BaselinePicker current={baseline.id} />}
        />
      </div>

      <RecentRound state={state} baseline={baseline} />
    </div>
  );
}
