import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { MiniSpark, RadarChart } from "@/components/charts";
import { Avatar, MenuButton } from "@/components/layout/screen-header";
import { ShowMore } from "@/components/ui/show-more";
import { ArtHero, Badge, ButtonLink, ChipNav } from "@/components/ui/primitives";
import { gameProfile, holeLines } from "@/lib/analytics/classic";
import { rebaseRound } from "@/lib/golf/baselines";
import { summarizeRound } from "@/lib/golf/strokes-gained";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import type { Round } from "@/types/rounds";
import { cn, toParLabel } from "@/lib/utils";

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
      toPar,
      sub: `${holes} hole${holes === 1 ? "" : "s"}${holes >= 18 && toPar !== null ? ` · ${toParLabel(toPar)}` : ""}`,
    };
  });

  const ranked = profile.axes.filter((axis) => axis.recent !== null).sort((a, b) => b.recent! - a.recent!);
  const radarLabel = ranked.length
    ? `Game profile. ${ranked[0]!.label} is your strongest area and ${ranked.at(-1)!.label.toLowerCase()} the weakest${profile.hasEarlier ? `, compared with the ${profile.earlierLabel.toLowerCase()}` : ""}.`
    : "Game profile: not enough rounds yet.";

  // The handicap card: today's index, its change over the year, and the line behind it.
  const history = [...state.handicapHistory].sort((a, b) => a.recorded_on.localeCompare(b.recorded_on));
  const yearAgo = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);
  const year = history.filter((entry) => entry.recorded_on >= yearAgo);
  const handicap = state.profile?.handicap_index ?? history.at(-1)?.handicap_index ?? null;
  const delta = year.length > 1 ? year.at(-1)!.handicap_index - year[0]!.handicap_index : null;
  const last = rows[0] ?? null;
  const lastToPar = last ? last.toPar : null;

  return (
    <div className="flex flex-col">
      <ArtHero
        art="course"
        topLeft={<MenuButton />}
        topRight={<Avatar name={state.profile?.display_name ?? ""} />}
        className="min-h-[250px] [&>div:last-child]:pb-7"
      >
        <div className="flex items-end justify-between gap-3">
          <h1 className="dsp text-[46px] leading-[0.98] text-white">
            Your
            <br />
            rounds
          </h1>
          <ButtonLink
            href="/rounds/new"
            variant="onHeroSolid"
            className="h-11 bg-white px-4 tracking-[0.1em] shadow-[0_10px_20px_-10px_rgb(0_0_0_/_0.5)]"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Log a round
          </ButtonLink>
        </div>
      </ArtHero>

      <div className="relative z-10 -mx-4 -mt-[18px] flex flex-col gap-3.5 rounded-t-[24px] bg-bg px-4 pt-[18px] md:-mx-8 md:px-8">
        <ChipNav
          label="Play views"
          items={[
            { href: "/rounds", label: "Stats", active: view === "stats" },
            { href: "/rounds?view=rounds", label: rows.length ? `Rounds · ${rows.length}` : "Rounds", active: view === "rounds" },
            { href: "/rounds/handicap", label: "Handicap", active: false },
          ]}
        />

        {state.rounds.length === 0 ? (
          <section className="flex flex-col items-start gap-3 rounded-[28px] bg-surface p-5 shadow-[var(--shadow-card)]">
            <h2 className="dsp text-[24px] leading-none">No rounds yet</h2>
            <p className="text-[14px] leading-relaxed text-fg-muted">
              Play your first round to start finding where you gain and lose shots. Shot by shot finds your weak spot fastest.
            </p>
            <ButtonLink href="/rounds/new">Log a round</ButtonLink>
          </section>
        ) : view === "stats" ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/rounds/handicap"
                className="press-lg flex min-w-0 flex-col gap-1 overflow-hidden rounded-[26px] bg-ink p-3.5 text-white shadow-[var(--shadow-ink)]"
              >
                <span className="dsp text-[11px] tracking-[0.1em] text-[#c9ccbf]">Handicap</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="font-display tabular text-[34px] leading-none">{handicap !== null ? handicap.toFixed(1) : "—"}</span>
                  {delta !== null && Math.abs(delta) >= 0.05 ? (
                    <span className={cn("text-[12px] font-bold", delta < 0 ? "text-[#a6c266]" : "text-[#f2b59b]")}>
                      {delta < 0 ? "▼" : "▲"} {Math.abs(delta).toFixed(1)}
                    </span>
                  ) : null}
                </span>
                <MiniSpark
                  values={year.map((entry) => entry.handicap_index)}
                  label={delta !== null && delta < 0 ? "Falling over the year" : "Rising over the year"}
                  height={26}
                />
              </Link>
              {last ? (
                <Link
                  href={`/rounds/${last.round.id}`}
                  className="press-lg flex min-w-0 flex-col gap-1.5 rounded-[26px] bg-surface p-3.5 shadow-[var(--shadow-card)]"
                >
                  <span className="dsp text-[11px] tracking-[0.1em] text-fg-subtle">Last round</span>
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-[52px] w-[52px] shrink-0 flex-col items-center justify-center rounded-full bg-surface-2 leading-none">
                      <span className="font-display tabular text-[20px]">{last.score ?? "—"}</span>
                      {lastToPar !== null ? (
                        <span className="tabular mt-0.5 text-[10px] font-bold text-fg-subtle">{toParLabel(lastToPar)}</span>
                      ) : null}
                    </span>
                    <span className="min-w-0 text-[12.5px] font-semibold leading-[1.3]">
                      <span className="line-clamp-2">{last.round.course_name}</span>
                      <span className="block font-medium text-fg-subtle">
                        {DAY.format(new Date(`${last.round.played_on}T00:00:00Z`))}
                      </span>
                    </span>
                  </span>
                </Link>
              ) : null}
            </div>

            <section
              aria-labelledby="profile-title"
              className="flex flex-col gap-1 rounded-[28px] bg-surface px-4 pb-3.5 pt-4 shadow-[var(--shadow-card)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="profile-title" className="dsp text-[22px] leading-none">
                  Game profile
                </h2>
                <Link href="/rounds/insights" className="inline-flex items-center gap-1 text-[13px] font-bold text-accent underline underline-offset-2">
                  Strokes gained
                  <ChevronRight className="h-3 w-3" strokeWidth={2.6} />
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
          </>
        ) : (
          <ShowMore as="div" limit={10} className="flex flex-col gap-2">
            {rows.map((row) => (
              <RoundRow key={row.round.id} {...row} />
            ))}
          </ShowMore>
        )}
      </div>
    </div>
  );
}
