import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Pencil } from "lucide-react";

import { SourceBadge } from "@/components/dashboard/sections";
import { DeleteRoundButton } from "@/components/rounds/delete-round";
import { DivergingBars } from "@/components/charts";
import {
  Badge,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  HeroPill,
  PageHero,
  Stat,
} from "@/components/ui/primitives";
import { CLUB_LABELS, SG_CATEGORIES, SG_CATEGORY_LABELS, labelize } from "@/types/golf";
import { summarizeRound } from "@/lib/golf/strokes-gained";
import { buildHoleResults } from "@/lib/golf/strokes-gained";
import { summarizeRound as narrateRound } from "@/lib/ai/insights";
import * as repo from "@/lib/db/repo";
import { cn, formatDate, signed, toParLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Round detail" };
export const dynamic = "force-dynamic";

export default async function RoundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await repo.currentUser();
  if (!user) return null;

  const round = await repo.getRound(user.id, id);
  if (!round) notFound();

  const shots = await repo.getShots(user.id, round.id);
  const holes = buildHoleResults(shots);
  const stats = summarizeRound(round, shots);
  const narrative = await narrateRound(stats, holes);

  const scored = holes.flatMap((h) => h.shots);
  const biggestLosses = [...scored].sort((a, b) => a.strokes_gained - b.strokes_gained).slice(0, 3);
  const biggestGains = [...scored].sort((a, b) => b.strokes_gained - a.strokes_gained).slice(0, 3);

  return (
    <div className="space-y-5">
      <PageHero
        art="course"
        size="lg"
        title={<>Round<br />summary</>}
        pills={
          <>
            <HeroPill tone="solid">
              {round.course_name} · {formatDate(round.played_on)}
            </HeroPill>
            {round.tees ? <HeroPill>{round.tees} tees</HeroPill> : null}
            {round.conditions.length ? (
              <HeroPill>{round.conditions.map(labelize).join(", ")}</HeroPill>
            ) : null}
          </>
        }
        topLeft={
          <ButtonLink href="/rounds" variant="onHero" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" /> Rounds
          </ButtonLink>
        }
        topRight={
          <ButtonLink href={`/rounds/${round.id}/play`} variant="onHeroSolid" size="sm">
            <Pencil className="h-3.5 w-3.5" /> Edit shots
          </ButtonLink>
        }
      />

      <div className="flex justify-end">
        <DeleteRoundButton roundId={round.id} />
      </div>

      {shots.length === 0 ? (
        <EmptyState
          title="No shots recorded"
          message="Add your shots and the strokes-gained breakdown, hole analysis and coaching read-out all appear automatically."
          action={
            <ButtonLink href={`/rounds/${round.id}/play`} size="sm">
              Record shots
            </ButtonLink>
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="grid grid-cols-3 gap-x-3 gap-y-4 p-5 lg:grid-cols-6">
              <Stat label="Score" value={stats.score ?? "—"} sub={toParLabel(stats.to_par)} />
              <Stat
                label="SG total"
                value={signed(stats.sg_total, 1)}
                tone={stats.sg_total >= 0 ? "good" : "bad"}
                sub="vs Tour baseline"
              />
              <Stat label="Fairways" value={`${stats.fairways_hit}/${stats.fairway_opportunities}`} />
              <Stat label="GIR" value={`${stats.greens_in_regulation}/${stats.holes_played}`} />
              <Stat label="Putts" value={stats.putts} />
              <Stat
                label="Up & down"
                value={`${stats.up_and_downs}/${stats.up_and_down_opportunities}`}
                sub={`Sand ${stats.sand_saves}/${stats.sand_save_opportunities}`}
              />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Strokes gained by category</CardTitle>
              </CardHeader>
              <CardContent>
                <DivergingBars
                  data={SG_CATEGORIES.map((c) => ({
                    label: SG_CATEGORY_LABELS[c],
                    value: stats.sg_by_category[c],
                  }))}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle>Round read-out</CardTitle>
                <SourceBadge source={narrative.source} note={narrative.note} />
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-medium">{narrative.data.headline}</p>
                {narrative.data.what_went_well.length > 0 ? (
                  <div>
                    <p className="dsp text-[9px] font-medium tracking-[0.17em] text-good">
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
                    <p className="dsp text-[9px] font-medium tracking-[0.17em] text-bad">
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
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <ShotHighlights title="Biggest losses" shots={biggestLosses} tone="bad" />
            <ShotHighlights title="Biggest gains" shots={biggestGains} tone="good" />
          </div>

          <div className="space-y-3">
            <h2 className="dsp text-[26px] font-semibold leading-none tracking-[-0.01em]">Hole by hole</h2>
            <div className="space-y-2">
              {holes.map((hole) => (
                <details
                  key={hole.hole_number}
                  className="group rounded-xl border border-border bg-surface"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                    <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold">
                      {hole.hole_number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        Par {hole.par} &middot; {hole.strokes} shots
                        <span
                          className={cn(
                            "ml-2 tabular",
                            hole.score_to_par > 0
                              ? "text-bad"
                              : hole.score_to_par < 0
                                ? "text-good"
                                : "text-fg-muted",
                          )}
                        >
                          {toParLabel(hole.score_to_par)}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {hole.shots
                          .map((s) => (s.club ? CLUB_LABELS[s.club] : labelize(s.shot_type)))
                          .join(" → ")}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {hole.green_in_regulation ? <Badge tone="good">GIR</Badge> : null}
                      {hole.up_and_down ? <Badge tone="accent">U&amp;D</Badge> : null}
                      {hole.penalties > 0 ? <Badge tone="bad">+{hole.penalties}</Badge> : null}
                      <span
                        className={cn(
                          "tabular text-sm font-semibold",
                          hole.strokes_gained >= 0 ? "text-good" : "text-bad",
                        )}
                      >
                        {signed(hole.strokes_gained)}
                      </span>
                    </span>
                  </summary>

                  <div className="overflow-x-auto border-t border-border px-4 py-3">
                    <table className="w-full min-w-[620px] text-xs">
                      <thead>
                        <tr className="text-left uppercase tracking-wider text-fg-subtle">
                          <th className="pb-1.5 pr-3 font-medium">#</th>
                          <th className="pb-1.5 pr-3 font-medium">Club</th>
                          <th className="pb-1.5 pr-3 font-medium">From</th>
                          <th className="pb-1.5 pr-3 font-medium">Type</th>
                          <th className="pb-1.5 pr-3 font-medium">To</th>
                          <th className="pb-1.5 pr-3 font-medium">Miss</th>
                          <th className="pb-1.5 pr-3 text-right font-medium">Before</th>
                          <th className="pb-1.5 pr-3 text-right font-medium">After</th>
                          <th className="pb-1.5 text-right font-medium">SG</th>
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </>
      )}

      {round.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-fg-muted">{round.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
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
