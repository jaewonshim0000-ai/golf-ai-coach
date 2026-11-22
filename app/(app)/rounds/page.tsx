import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { RadarChart } from "@/components/charts";
import { Avatar, MenuButton } from "@/components/layout/screen-header";
import { ShowMore } from "@/components/ui/show-more";
import { ArtHero, Badge, ButtonLink, ChipNav } from "@/components/ui/primitives";
import { gameProfile, holeLines } from "@/lib/analytics/classic";
import { rebaseRound } from "@/lib/golf/baselines";
import { summarizeRound } from "@/lib/golf/strokes-gained";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import type { Round } from "@/types/rounds";
import { toParLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Play" };
export const dynamic = "force-dynamic";

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** One round as the design's row: course, date and holes, score in a stone circle. */
function RoundRow({ round, score, sub }: { round: Round; score: number | null; sub: string }) {
  return (
    <Link href={`/rounds/${round.id}`} className="press-lg flex items-center gap-3 rounded-[24px] bg-surface px-4 py-3.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[15px] font-bold">
          <span className="truncate">{round.course_name}</span>
          {round.status === "in_progress" ? <Badge tone="warn">in progress</Badge> : null}
        </span>
        <span className="truncate text-[12px] text-fg-subtle">
          {DAY.format(new Date(`${round.played_on}T00:00:00Z`))} · {sub}
        </span>
      </span>
      <span className="font-display tabular flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[20px]">
        {score ?? "—"}
      </span>
    </Link>
  );
}

export default async function RoundsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await repo.currentUser();
  if (!user) return null;
  const [state, search, courses] = await Promise.all([loadPlayerState(user.id), searchParams, repo.getCourses(user.id)]);
  const view = search.view === "rounds" ? "rounds" : "stats";

  const perRound = state.rounds.map((round) => ({
    round,
    lines: holeLines(
      round,
      courses.find((course) => course.id === round.course_id)?.holes ?? [],
      state.shotsByRound.get(round.id) ?? [],
    ),
  }));
  const profile = gameProfile(perRound);
  const rows = perRound.map(({ round, lines }) => {
    const stats = rebaseRound(summarizeRound(round, state.shotsByRound.get(round.id) ?? []), state.baseline);
    const toPar = stats.sg_holes > 0 ? stats.to_par : lines.length ? lines.reduce((sum, line) => sum + line.score - line.par, 0) : null;
    const holes = stats.holes_played || lines.length;
    return {
      round,
      score: stats.score,
      sub: `${holes} hole${holes === 1 ? "" : "s"}${holes >= 18 && toPar !== null ? ` · ${toParLabel(toPar)}` : ""}`,
    };
  });

  const ranked = profile.axes.filter((axis) => axis.recent !== null).sort((a, b) => b.recent! - a.recent!);
  const radarLabel = ranked.length
    ? `Game profile. ${ranked[0]!.label} is your strongest area and ${ranked.at(-1)!.label.toLowerCase()} the weakest${profile.hasEarlier ? `, compared with the ${profile.earlierLabel.toLowerCase()}` : ""}.`
    : "Game profile: not enough rounds yet.";

  return (
    <div className="flex flex-col gap-4">
      <ArtHero
        art="course"
        center
        height="lg"
        title="Your rounds"
        topLeft={<MenuButton />}
        topRight={<Avatar name={state.profile?.display_name ?? ""} />}
        className="[&_h1]:text-[48px]"
      >
        <ButtonLink
          href="/rounds/new"
          variant="onHero"
          size="sm"
          className="h-9 border-white/60 bg-white/[0.22] px-4 tracking-[0.1em]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          New round
        </ButtonLink>
      </ArtHero>

      <ChipNav
        label="Play views"
        className="pt-1"
        items={[
          { href: "/rounds", label: "Stats", active: view === "stats" },
          { href: "/rounds?view=rounds", label: "Rounds", active: view === "rounds" },
          { href: "/rounds/handicap", label: "Handicap", active: false },
        ]}
      />

      {state.rounds.length === 0 ? (
        <section className="flex flex-col items-start gap-3 rounded-[28px] bg-surface p-5">
          <h2 className="dsp text-[24px] leading-none">No rounds yet</h2>
          <p className="text-[14px] leading-relaxed text-fg-muted">
            Play your first round to start finding where you gain and lose shots. Shot by shot finds your weak spot fastest.
          </p>
          <ButtonLink href="/rounds/new">Log a round</ButtonLink>
        </section>
      ) : view === "stats" ? (
        <>
          <section aria-labelledby="profile-title" className="flex flex-col gap-1.5 rounded-[28px] bg-surface px-[18px] pb-4 pt-[18px]">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="profile-title" className="dsp text-[24px] leading-none">
                Game profile
              </h2>
              <Link href="/rounds/insights" className="text-[13px] font-bold text-accent underline underline-offset-2">
                Details
              </Link>
            </div>
            <RadarChart axes={profile.axes} label={radarLabel} />
            <div className="flex justify-center gap-[18px] text-[12px] font-semibold text-fg-muted">
              {profile.hasEarlier ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f2b59b]" />
                  {profile.earlierLabel}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#6f8f37]" />
                {profile.recentLabel}
              </span>
            </div>
          </section>

          <div className="flex flex-col gap-2">
            {rows.slice(0, 3).map((row) => (
              <RoundRow key={row.round.id} {...row} />
            ))}
          </div>
          {rows.length > 3 ? (
            <Link
              href="/rounds?view=rounds"
              className="press flex items-center justify-center gap-1 text-[13px] font-bold text-accent"
            >
              All {rows.length} rounds <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </>
      ) : (
        <ShowMore as="div" limit={10} className="flex flex-col gap-2">
          {rows.map((row) => (
            <RoundRow key={row.round.id} {...row} />
          ))}
        </ShowMore>
      )}
    </div>
  );
}
