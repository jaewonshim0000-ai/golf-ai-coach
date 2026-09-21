import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SessionBuilder } from "@/components/practice/session-builder";
import { ButtonLink, PageHero } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { QUICK_DRILLS } from "@/lib/practice/goals";

export const metadata: Metadata = { title: "Start practice" };
export const dynamic = "force-dynamic";

export default async function StartPracticePage({ searchParams }: { searchParams: Promise<{ goal?: string }> }) {
  const user = await repo.currentUser();
  if (!user) return null;
  const [state, search] = await Promise.all([loadPlayerState(user.id), searchParams]);
  const weakness = state.weaknesses.find((item) => item.id === search.goal);
  const initial = QUICK_DRILLS.find((drill) => drill.id === search.goal)
    ?? QUICK_DRILLS.find((drill) => weakness?.related_skills.includes(drill.skill_trained));
  return (
    <div className="space-y-5">
      <PageHero art="range" size="sm" eyebrow="Choose your goal" title="Start practice"
        description="One short block. Track accuracy, save your result, and build from there."
        topLeft={<ButtonLink href="/practice" variant="onHero" size="sm"><ArrowLeft className="h-3.5 w-3.5" /> Practice</ButtonLink>} />
      <SessionBuilder initialDrillId={initial?.id} />
    </div>
  );
}
