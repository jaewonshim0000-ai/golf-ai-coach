import type { Metadata } from "next";

import { InkTrendLine } from "@/components/charts";
import { Avatar, MenuButton } from "@/components/layout/screen-header";
import { AddSwing } from "@/components/swing/add-swing";
import { SwingLibrary, type LibrarySwing } from "@/components/swing/swing-library";
import { ButtonLink, ScreenTitle, TopBar } from "@/components/ui/primitives";
import { CLUB_LABELS, clubGroup, labelize } from "@/types/golf";
import { diagnoseSwing } from "@/lib/golf/swing-metrics";
import { currentSwingModel } from "@/lib/golf/swing-reference";
import { GPP_VERSION } from "@/lib/golfposepro/result";
import { scoreTrend, swingResult } from "@/lib/swing/result";
import * as repo from "@/lib/db/repo";
import { remaining } from "@/lib/billing/plans";
import { loadPlayerState } from "@/lib/player-state";
import { cn, relativeDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Swing" };
export const dynamic = "force-dynamic";

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The score trend reads this many of the latest swings, from one camera side. */
const TREND_SWINGS = 12;

/** How the swing score has moved: the recent average, its change, and the line behind it. */
function ScoreTrend({ view, points }: { view: string; points: { date: string; value: number }[] }) {
  const { recent, average, change } = scoreTrend(points);
  if (average === null) return null;
  return (
    <section aria-label="Swing score trend" className="flex flex-col gap-2.5 rounded-[28px] bg-ink p-[18px] text-white">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="dsp text-[11px] text-[#c9ccbf]">
            Swing score · {view}
          </span>
          <span className="font-display tabular text-[64px] leading-[0.9]">{average.toFixed(1)}</span>
          <span className="text-[12px] text-[#c9ccbf]">
            {recent === 1 ? "Your latest swing" : `Average of your last ${recent}`}
          </span>
        </div>
        {change !== null && Math.abs(change) >= 0.05 ? (
          <span className={cn("inline-flex h-[30px] shrink-0 items-center rounded-full px-3 text-[12px] font-bold", change > 0 ? "bg-accent" : "bg-[#3a3f33] text-[#e9a08e]")}>
            {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)} on the {recent === 1 ? "one" : recent} before
          </span>
        ) : null}
      </div>
      {points.length > 1 ? (
        <InkTrendLine label="Swing score" points={points} dates="day" />
      ) : (
        <p className="text-[13px] text-[#c9ccbf]">Your trend line appears after your next {view.toLowerCase()} swing.</p>
      )}
    </section>
  );
}

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
  // Scores are worked out from each swing's tracks, so the trend always uses
  // today's rubric. Camera sides score different checks, so it keeps to one.
  // ponytail: ~40 KB of tracks a swing per visit; store the score on save if this gets slow.
  const newest = sessions[0];
  const sameSide = newest ? sessions.filter((session) => session.camera_angle === newest.camera_angle).slice(0, TREND_SWINGS) : [];
  const models = await repo.getSwingModels(user.id, sameSide.map((session) => session.id));
  const results = new Map(sameSide.map((session) => {
    const model = models.get(session.id) ?? null;
    const fresh = currentSwingModel(model, session) && model.golfPosePro?.version === GPP_VERSION;
    // A reference is someone else's swing, so it never counts toward yours.
    return [session.id, fresh && !model.reference ? swingResult(model) : null] as const;
  }));
  const trend = sameSide
    .flatMap((session) => {
      const score = results.get(session.id)?.score ?? null;
      return score === null ? [] : [{ date: session.created_at, value: score }];
    })
    .reverse();
  let latest = null;
  if (newest) {
    const result = results.get(newest.id) ?? null;
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
        <SwingLibrary swings={swings} latest={latest} trend={<ScoreTrend view={labelize(newest!.camera_angle)} points={trend} />} />
      )}

      <ButtonLink href="/swing/references" variant="secondary" className="self-start">
        Reference library
      </ButtonLink>
    </div>
  );
}
