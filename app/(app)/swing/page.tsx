import type { Metadata } from "next";

import { Avatar, MenuButton } from "@/components/layout/screen-header";
import { AddSwing } from "@/components/swing/add-swing";
import { SwingLibrary, type LibrarySwing } from "@/components/swing/swing-library";
import { ButtonLink, ScreenTitle, TopBar } from "@/components/ui/primitives";
import { CLUB_LABELS, clubGroup, labelize } from "@/types/golf";
import { diagnoseSwing } from "@/lib/golf/swing-metrics";
import { currentSwingModel } from "@/lib/golf/swing-reference";
import { GPP_VERSION } from "@/lib/golfposepro/result";
import { swingResult } from "@/lib/swing/result";
import * as repo from "@/lib/db/repo";
import { remaining } from "@/lib/billing/plans";
import { loadPlayerState } from "@/lib/player-state";
import { relativeDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Swing" };
export const dynamic = "force-dynamic";

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function SwingLibraryPage({ searchParams }: { searchParams: Promise<{ record?: string }> }) {
  const user = await repo.currentUser();
  if (!user) return null;
  const [state, billing, search] = await Promise.all([loadPlayerState(user.id), repo.getBilling(user.id), searchParams]);

  const sessions = [...state.swingSessions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const swings: LibrarySwing[] = sessions.map((session) => {
    const measurements = state.swingMeasurements.filter((m) => m.swing_session_id === session.id && m.source === "manual");
    const diagnostic = diagnoseSwing(measurements);
    const group = clubGroup(session.club);
    return {
      id: session.id,
      title: CLUB_LABELS[session.club],
      date: SHORT.format(new Date(session.created_at)),
      videoUrl: session.video_url,
      group: group.endsWith("irons") ? "irons" : (group as LibrarySwing["group"]),
      badge:
        diagnostic.measured === 0
          ? { label: session.analysis_status === "processed" ? "Reviewed" : "Open review", tone: "neutral" }
          : diagnostic.outOfRange.length > 0
            ? { label: `${diagnostic.outOfRange.length} to fix`, tone: "warn" }
            : { label: "In band", tone: "good" },
    };
  });

  // The latest swing gets the big card, with its score if it has been read.
  const newest = sessions[0];
  let latest = null;
  if (newest) {
    const model = await repo.getSwingModel(user.id, newest.id);
    const result = model && currentSwingModel(model, newest) && model.golfPosePro?.version === GPP_VERSION ? swingResult(model) : null;
    const days = relativeDays(newest.created_at.slice(0, 10));
    latest = {
      id: newest.id,
      title: `${CLUB_LABELS[newest.club]} · ${labelize(newest.camera_angle)}`,
      when: days,
      score: result?.score ?? null,
      toWork: result ? result.weaknesses.length : null,
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <TopBar left={<MenuButton />} right={<Avatar name={state.profile?.display_name ?? ""} />} />
      <div className="flex items-end justify-between gap-3">
        <ScreenTitle>
          Your
          <br />
          swing
        </ScreenTitle>
        <AddSwing left={remaining(billing, "swing")} plan={billing.plan} autoOpen={search.record === "1"} bag={state.profile?.bag} />
      </div>

      {swings.length === 0 ? (
        <section className="flex flex-col items-start gap-3 rounded-[28px] bg-surface p-5">
          <h2 className="dsp text-[24px] leading-none">No swings yet</h2>
          <p className="text-[14px] leading-relaxed text-fg-muted">
            Record or upload one face-on swing. We read every frame and give you a score, your main weakness and drills to fix it.
          </p>
        </section>
      ) : (
        <SwingLibrary swings={swings} latest={latest} />
      )}

      <ButtonLink href="/swing/references" variant="secondary" className="self-start">
        Reference library
      </ButtonLink>
    </div>
  );
}
