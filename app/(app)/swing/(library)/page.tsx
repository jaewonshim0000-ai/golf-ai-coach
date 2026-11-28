import type { Metadata } from "next";

import { ScoreLine } from "@/components/charts";
import { Avatar, MenuButton } from "@/components/layout/screen-header";
import { AddSwing } from "@/components/swing/add-swing";
import { SwingLibrary, type LibrarySwing } from "@/components/swing/swing-library";
import { ButtonLink, ScreenTitle, TopBar } from "@/components/ui/primitives";
import { CLUB_LABELS, clubGroup, labelize } from "@/types/golf";
import { diagnoseSwing } from "@/lib/golf/swing-metrics";
import { scoreTrend } from "@/lib/swing/result";
import { swingScores } from "@/lib/swing/score-trend";
import * as repo from "@/lib/db/repo";
import { LIMITS, remaining } from "@/lib/billing/plans";
import { loadPlayerState } from "@/lib/player-state";
import { cn, relativeDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Swing" };
export const dynamic = "force-dynamic";

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** How the swing score has moved: the recent average, its change, and the line behind it. */
function ScoreTrend({ view, points }: { view: string; points: { date: string; value: number }[] }) {
  const { recent, average, change } = scoreTrend(points);
  if (average === null) return null;
  const values = points.slice(-10).map((point) => point.value);
  return (
    <section aria-label="Swing score trend" className="flex flex-col gap-2 rounded-[28px] bg-ink px-[18px] py-4 text-white">
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="dsp text-[11px] tracking-[0.1em] text-[#c9ccbf]">Swing score · {view}</span>
          <span className="flex items-baseline gap-1.5">
            <span className="font-display tabular text-[52px] leading-[0.9]">{average.toFixed(1)}</span>
            <span className="text-[13px] text-[#c9ccbf]">/ 10</span>
          </span>
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
      {values.length > 1 ? (
        <ScoreLine
          values={values}
          recent={recent}
          label={`Swing score over your last ${values.length} ${view.toLowerCase()} swings, from ${values[0]!.toFixed(1)} to ${values.at(-1)!.toFixed(1)}`}
        />
      ) : (
        <p className="text-[13px] text-[#c9ccbf]">Your trend line appears after your next {view.toLowerCase()} swing.</p>
      )}
    </section>
  );
}

/** What is left of the month's swing analyses: a dot each on a small allowance, a number on a big one. */
function Allowance({ left, limit }: { left: number; limit: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-fg-muted">
      {limit <= 10 ? (
        <span aria-hidden className="inline-flex gap-[3px]">
          {Array.from({ length: limit }, (_, index) => (
            <span key={index} className={cn("h-2 w-2 rounded-full", index < left ? "bg-accent" : "bg-[#d5d1c4]")} />
          ))}
        </span>
      ) : null}
      {left} of {limit} left this month
    </span>
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
  const { newest, results, trend } = await swingScores(user.id, state.swingSessions);
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

  const left = remaining(billing, "swing");
  const limit = LIMITS[billing.plan].swing;

  return (
    <div className="flex flex-col gap-3.5">
      <TopBar left={<MenuButton />} right={<Avatar name={state.profile?.display_name ?? ""} />} />
      <div className="flex items-end justify-between gap-3">
        <ScreenTitle>
          Your
          <br />
          swing
        </ScreenTitle>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <AddSwing left={left} plan={billing.plan} autoOpen={search.record === "1"} bag={state.profile?.bag} />
          {left !== null && limit !== null ? <Allowance left={left} limit={limit} /> : null}
        </div>
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

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/swing/references" variant="secondary">
          Reference library
        </ButtonLink>
        {/* The calibration page writes into this project, so it exists only under npm run dev. */}
        {process.env.NODE_ENV === "development" ? <ButtonLink href="/swing/calibrate" variant="secondary">Score calibration</ButtonLink> : null}
      </div>
    </div>
  );
}
