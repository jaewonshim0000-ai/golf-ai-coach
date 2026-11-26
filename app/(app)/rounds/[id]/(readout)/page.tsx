import { createHash } from "node:crypto";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronDown, ChevronLeft } from "lucide-react";

import { ReadoutSkeleton, SourceBadge } from "@/components/dashboard/sections";
import { DeleteRoundButton } from "@/components/rounds/delete-round";
import { InkScorecard } from "@/components/rounds/scorecard-summary";
import { classicStats, holeLines } from "@/lib/analytics/classic";
import {
  ActionBar,
  ArtHero,
  Badge,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  RoundButton,
  SectionHeading,
  Sheet,
  StatCircle,
  barButton,
} from "@/components/ui/primitives";
import { CLUB_LABELS, SG_CATEGORIES, SG_CATEGORY_LABELS, labelize } from "@/types/golf";
import { summarizeRound } from "@/lib/golf/strokes-gained";
import { baselineForHandicap, getBaseline, rebaseRound } from "@/lib/golf/baselines";
import { BaselineSelect } from "@/components/stats/baseline-picker";
import { UpgradePrompt } from "@/components/billing/plan";
import { buildHoleResults } from "@/lib/golf/strokes-gained";
import { summarizeRound as narrateRound } from "@/lib/ai/insights";
import { getProvider } from "@/lib/ai/provider";
import { cachedCoach } from "@/lib/ai/reconstruction-coach";
import * as repo from "@/lib/db/repo";
import { cn, signed, toParLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Round read-out" };
export const dynamic = "force-dynamic";

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** One strokes-gained category as the design's row: label, a bar from the centre, the value. */
function SGRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = `${(Math.min(1, Math.abs(value) / max) * 50).toFixed(1)}%`;
  const good = value >= 0;
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_3rem] items-center gap-2.5">
      <span className="truncate text-[14px] font-semibold">{label}</span>
      <span className="relative h-3">
        <span
          className={cn("glide absolute inset-y-0", good ? "left-1/2 rounded-r-full bg-accent" : "right-1/2 rounded-l-full bg-bad")}
          style={{ width }}
        />
      </span>
      <span className={cn("tabular text-right text-[14px] font-bold", good ? "text-accent-strong" : "text-bad")}>{signed(value, 1)}</span>
    </div>
  );
}

export default async function RoundDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ baseline?: string }>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const user = await repo.currentUser();
  if (!user) return null;

  const [round, shots, courses, profile, billing] = await Promise.all([
    repo.getRound(user.id, id),
    repo.getShots(user.id, id),
    repo.getCourses(user.id),
    repo.getProfile(user.id),
    repo.getBilling(user.id),
  ]);
  if (!round) notFound();
  // Strokes gained is Premium; score, fairways, greens and the read-out stay free.
  const premium = billing.plan === "premium";
  // Strokes gained against the level the player picks, their own by default.
  const baseline = search.baseline ? getBaseline(search.baseline) : baselineForHandicap(profile?.handicap_index ?? null);
  const course = courses.find((item) => item.id === round.course_id);
  const lines = holeLines(round, course?.holes ?? [], shots);
  // A scorecard round is one with holes on its card and no shots behind them.
  const scorecard = shots.length === 0 && (lines.length > 0 || Boolean(round.hole_stats));
  const holes = buildHoleResults(shots);
  const tourStats = summarizeRound(round, shots);
  const stats = rebaseRound(tourStats, baseline);
  const classic = classicStats(lines);

  const scored = holes.flatMap((h) => h.shots);
  const biggestLosses = [...scored].sort((a, b) => a.strokes_gained - b.strokes_gained).slice(0, 3);
  const biggestGains = [...scored].sort((a, b) => b.strokes_gained - a.strokes_gained).slice(0, 3);

  const score = shots.length ? stats.score : lines.length ? lines.reduce((sum, line) => sum + line.score, 0) : null;
  const toPar = shots.length ? stats.to_par : lines.length ? lines.reduce((sum, line) => sum + line.score - line.par, 0) : null;
  const putts = lines.every((line) => line.putts !== null) && lines.length ? lines.reduce((sum, line) => sum + (line.putts ?? 0), 0) : null;
  const tiles = shots.length
    ? [
        { label: "Fairways", value: `${stats.fairways_hit}/${stats.fairway_opportunities}` },
        { label: "Greens", value: `${stats.greens_in_regulation}/${stats.holes_played}` },
        { label: "Putts", value: String(stats.putts) },
        { label: "Up & down", value: `${stats.up_and_downs}/${stats.up_and_down_opportunities}` },
      ]
    : [
        { label: "Fairways", value: `${classic.fairways.made}/${classic.fairways.chances}` },
        { label: "Greens", value: `${classic.greens.made}/${classic.greens.chances}` },
        { label: "Putts", value: putts === null ? "—" : String(putts) },
        { label: "Scrambling", value: `${classic.scrambling.made}/${classic.scrambling.chances}` },
      ];
  const words = round.course_name.split(" ");
  const sgMax = Math.max(0.5, ...SG_CATEGORIES.map((category) => Math.abs(stats.sg_by_category[category])));
  const editHref = scorecard ? `/rounds/${round.id}/score` : `/rounds/${round.id}/play`;

  return (
    <div className="flex flex-col">
      <ArtHero
        art="course"
        height="sm"
        topLeft={
          <RoundButton href="/rounds" tone="hero" label="Back to Play">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
        topRight={
          <span className="dsp inline-flex h-9 items-center rounded-full border-[1.5px] border-white/85 px-3.5 text-[11px] tracking-[0.1em]">
            {DAY.format(new Date(`${round.played_on}T00:00:00Z`))}
          </span>
        }
      >
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="dsp text-[40px] leading-[0.98] text-white">
              {words.length > 1 ? (
                <>
                  {words.slice(0, Math.ceil(words.length / 2)).join(" ")}
                  <br />
                  {words.slice(Math.ceil(words.length / 2)).join(" ")}
                </>
              ) : (
                round.course_name
              )}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {round.round_type ? <Badge tone="onInk">{labelize(round.round_type)}</Badge> : null}
              {round.status === "in_progress" ? <Badge tone="onInk">In progress</Badge> : null}
            </div>
          </div>
          <div
            aria-label={score !== null ? `Score ${score}${toPar !== null ? `, ${toParLabel(toPar)}` : ""}` : "No score yet"}
            className="flex h-[84px] w-[84px] shrink-0 flex-col items-center justify-center rounded-full bg-white leading-none text-[#1e211b]"
          >
            <span className="font-display tabular text-[36px]">{score ?? "—"}</span>
            {toPar !== null && score !== null ? <span className="tabular mt-0.5 text-[12px] font-bold">{toParLabel(toPar)}</span> : null}
          </div>
        </div>
      </ArtHero>

      <Sheet className="[--bar-fade:var(--c-surface)]">
        {lines.length === 0 ? (
          <div className="flex flex-col items-start gap-3 rounded-[22px] bg-surface-2 p-5">
            <h2 className="dsp text-[22px] leading-none">{scorecard || round.hole_stats ? "No holes scored yet" : "No shots recorded"}</h2>
            <p className="text-[14px] leading-relaxed text-fg-muted">
              {scorecard || round.hole_stats
                ? "Score the first hole and the card fills in as you go."
                : "Add your shots and the strokes-gained breakdown, hole analysis and coaching read-out all appear automatically."}
            </p>
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-4 gap-2">
              {tiles.map((tile) => (
                <StatCircle key={tile.label} value={tile.value} label={tile.label} size={60} className="[&>span:first-child]:text-[17px]" />
              ))}
            </dl>

            {shots.length > 0 ? (
              premium ? (
                <section className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="dsp text-[24px] leading-none">Strokes gained</h2>
                    <BaselineSelect current={baseline.id} />
                  </div>
                  {SG_CATEGORIES.map((category) => (
                    <SGRow key={category} label={SG_CATEGORY_LABELS[category]} value={stats.sg_by_category[category]} max={sgMax} />
                  ))}
                  <p className="text-[12px] text-fg-subtle">
                    {signed(stats.sg_total, 1)} in all, against a {baseline.label.toLowerCase()}
                    {baseline.id === "tour" ? "" : " (approx.)"}.
                  </p>
                </section>
              ) : (
                <UpgradePrompt
                  title="Strokes gained for this round"
                  message="See which shots gained and lost strokes, by category and hole, against any handicap level."
                />
              )
            ) : null}

            <InkScorecard lines={lines} />

            {shots.length > 0 ? (
              <Suspense fallback={<ReadoutSkeleton title="Round read-out" />}>
                <RoundReadout owner={user.id} stats={tourStats} holes={holes} />
              </Suspense>
            ) : null}

            {premium && shots.length > 0 ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <ShotHighlights title="Biggest losses" shots={biggestLosses} tone="bad" />
                <ShotHighlights title="Biggest gains" shots={biggestGains} tone="good" />
              </div>
            ) : null}
          </>
        )}

        {holes.length > 0 ? (
          <section id="shots" className="flex scroll-mt-4 flex-col gap-3">
            <SectionHeading title="Hole by hole" count={holes.length} description="Tap a hole to see its shots." />
            <div className="space-y-2">
              {holes.map((hole) => (
                <details key={hole.hole_number} className="group rounded-[22px] bg-surface-2">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                    <span className="font-display tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-[16px]">
                      {hole.hole_number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">
                        Par {hole.par} &middot; {hole.strokes} shots
                        <span
                          className={cn(
                            "ml-2 tabular",
                            hole.score_to_par > 0 ? "text-bad" : hole.score_to_par < 0 ? "text-good" : "text-fg-muted",
                          )}
                        >
                          {toParLabel(hole.score_to_par)}
                        </span>
                      </span>
                      <span className="block truncate text-[12px] text-fg-subtle">
                        {hole.shots.map((s) => (s.club ? CLUB_LABELS[s.club] : labelize(s.shot_type))).join(" → ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {hole.green_in_regulation ? <Badge tone="good">GIR</Badge> : null}
                      {hole.up_and_down ? <Badge tone="accent">U&amp;D</Badge> : null}
                      {hole.penalties > 0 ? <Badge tone="bad">+{hole.penalties}</Badge> : null}
                      {premium ? (
                        <span className={cn("tabular text-sm font-semibold", hole.strokes_gained >= 0 ? "text-good" : "text-bad")}>
                          {signed(hole.strokes_gained)}
                        </span>
                      ) : null}
                      <ChevronDown aria-hidden className="h-4 w-4 text-fg-subtle transition-transform group-open:rotate-180" />
                    </span>
                  </summary>
                  <div className="overflow-x-auto border-t border-border/70 px-4 py-3">
                    <table className="w-full min-w-[620px] text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wider text-fg-subtle">
                          <th className="pb-1.5 pr-3 font-medium">#</th>
                          <th className="pb-1.5 pr-3 font-medium">Club</th>
                          <th className="pb-1.5 pr-3 font-medium">From</th>
                          <th className="pb-1.5 pr-3 font-medium">Type</th>
                          <th className="pb-1.5 pr-3 font-medium">To</th>
                          <th className="pb-1.5 pr-3 font-medium">Miss</th>
                          {premium ? (
                            <>
                              <th className="pb-1.5 pr-3 text-right font-medium">Before</th>
                              <th className="pb-1.5 pr-3 text-right font-medium">After</th>
                              <th className="pb-1.5 text-right font-medium">SG</th>
                            </>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {hole.shots.map((shot) => (
                          <tr key={shot.id} className="border-t border-border">
                            <td className="tabular py-1.5 pr-3">{shot.shot_number}</td>
                            <td className="py-1.5 pr-3">{shot.club ? CLUB_LABELS[shot.club] : "—"}</td>
                            <td className="tabular py-1.5 pr-3">
                              {Math.round(shot.starting_distance)}
                              {shot.starting_unit === "feet" ? " ft" : " yd"}{" "}
                              <span className="text-fg-subtle">
                                {labelize(shot.starting_location).toLowerCase()}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3 text-fg-muted">{labelize(shot.shot_type)}</td>
                            <td className="tabular py-1.5 pr-3">
                              {shot.ending_location === "holed"
                                ? "Holed"
                                : `${Math.round(shot.ending_distance)}${shot.ending_unit === "feet" ? " ft" : " yd"} ${labelize(shot.ending_location).toLowerCase()}`}
                              {shot.penalty_strokes > 0 ? (
                                <span className="ml-1 text-bad">+{shot.penalty_strokes}</span>
                              ) : null}
                            </td>
                            <td className="py-1.5 pr-3 text-fg-muted">
                              {shot.miss_direction ? labelize(shot.miss_direction) : "—"}
                            </td>
                            {premium ? (
                              <>
                                <td className="tabular py-1.5 pr-3 text-right text-fg-subtle">
                                  {shot.expected_before.toFixed(2)}
                                </td>
                                <td className="tabular py-1.5 pr-3 text-right text-fg-subtle">
                                  {shot.expected_after.toFixed(2)}
                                </td>
                                <td
                                  className={cn(
                                    "tabular py-1.5 text-right font-medium",
                                    shot.strokes_gained >= 0 ? "text-good" : "text-bad",
                                  )}
                                >
                                  {signed(shot.strokes_gained)}
                                </td>
                              </>
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {round.notes ? (
          <section className="flex flex-col gap-2">
            <h2 className="dsp text-[22px] leading-none">Notes</h2>
            <p className="rounded-[22px] bg-surface-2 px-4 py-3.5 text-[14px] leading-relaxed">{round.notes}</p>
          </section>
        ) : null}

        <div className="flex justify-center">
          <DeleteRoundButton roundId={round.id} />
        </div>

        <ActionBar className="[--bar-fade:var(--c-surface)]">
          <ButtonLink href={editHref} variant="secondary" className={cn(barButton, "bg-surface")}>
            {scorecard || round.hole_stats ? (round.status === "complete" ? "Edit scorecard" : "Keep scoring") : shots.length ? "Edit shots" : "Record shots"}
          </ButtonLink>
          {holes.length > 0 ? (
            <ButtonLink href="#shots" className={barButton}>
              Review shots
            </ButtonLink>
          ) : (
            <ButtonLink href="/rounds" className={barButton}>
              Back to Play
            </ButtonLink>
          )}
        </ActionBar>
      </Sheet>
    </div>
  );
}

/** Streamed, so the round's numbers never wait for Claude; the same round reads the same until it changes. */
async function RoundReadout({ owner, stats, holes }: {
  owner: string;
  stats: Parameters<typeof narrateRound>[0];
  holes: Parameters<typeof narrateRound>[1];
}) {
  const fingerprint = createHash("sha256").update(JSON.stringify(["round_summary", getProvider().model, stats, holes])).digest("hex");
  const narrative = await cachedCoach(owner, fingerprint, () => narrateRound(stats, holes));
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Round read-out</CardTitle>
        <SourceBadge source={narrative.source} note={narrative.note} />
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">{narrative.data.headline}</p>
        {narrative.data.what_went_well.length > 0 ? (
          <div>
            <p className="dsp text-[10px] font-medium tracking-[0.17em] text-good">
              What went well
            </p>
            <ul className="mt-1 space-y-1 text-sm text-fg-muted">
              {narrative.data.what_went_well.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {narrative.data.what_cost_you.length > 0 ? (
          <div>
            <p className="dsp text-[10px] font-medium tracking-[0.17em] text-bad">
              What cost you
            </p>
            <ul className="mt-1 space-y-1 text-sm text-fg-muted">
              {narrative.data.what_cost_you.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="border-t border-border pt-3 text-sm leading-relaxed text-fg-muted">
          {narrative.data.takeaway}
        </p>
      </CardContent>
    </Card>
  );
}

function ShotHighlights({
  title,
  shots,
  tone,
}: {
  title: string;
  shots: { id: string; hole_number: number; club: string | null; starting_distance: number; starting_unit: string; starting_location: string; strokes_gained: number }[];
  tone: "good" | "bad";
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {shots.map((shot) => (
            <li key={shot.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">
                <span className="text-fg-subtle">Hole {shot.hole_number}</span>{" "}
                {shot.club ? CLUB_LABELS[shot.club as keyof typeof CLUB_LABELS] : "Shot"} from{" "}
                <span className="tabular">{Math.round(shot.starting_distance)}</span>
                {shot.starting_unit === "feet" ? " ft" : " yd"}{" "}
                {labelize(shot.starting_location).toLowerCase()}
              </span>
              <span
                className={cn(
                  "tabular shrink-0 font-semibold",
                  tone === "good" ? "text-good" : "text-bad",
                )}
              >
                {signed(shot.strokes_gained)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
