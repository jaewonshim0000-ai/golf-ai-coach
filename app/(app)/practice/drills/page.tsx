import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { DrillLibrary } from "@/components/practice/drill-library";
import { RoundButton, ScreenTitle, TopBar } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { rankPracticeDrills } from "@/lib/practice/drill-priorities";
import { TEST_DRILLS } from "@/lib/practice/tests";

export const metadata: Metadata = { title: "Drill library" };
export const dynamic = "force-dynamic";

export default async function DrillLibraryPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const state = await loadPlayerState(user.id);
  // Most needed first: the ranking the Practice tab uses, then the rest in catalogue order.
  const ranked = rankPracticeDrills(TEST_DRILLS, state);
  const order = [...ranked].sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col gap-4">
      <TopBar
        left={
          <RoundButton href="/practice" label="Back to Practice">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
        right={
          <Link
            href="/practice/start"
            className="press dsp inline-flex h-11 items-center rounded-full border-[1.5px] border-fg px-4 text-[11px]"
          >
            Build a session
          </Link>
        }
      />
      <ScreenTitle>
        Drill
        <br />
        library
      </ScreenTitle>
      <DrillLibrary
        drills={order.map(({ drill, reason }) => ({ drill, forYou: Boolean(reason) }))}
        priorities={state.practiceDrillPriorities}
      />
    </div>
  );
}
