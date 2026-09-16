import Link from "next/link";
import type { Metadata } from "next";
import { Flag } from "lucide-react";

import { TrendLine } from "@/components/charts";
import {
  Badge,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  MiniCard,
  PageHero,
  SectionHeading,
} from "@/components/ui/primitives";
import { summarizeRound } from "@/lib/golf/strokes-gained";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { cn, formatDate, relativeDays, signed, toParLabel } from "@/lib/utils";

export const metadata: Metadata = { title: "Rounds" };
export const dynamic = "force-dynamic";

export default async function RoundsPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const state = await loadPlayerState(user.id);

  return (
    <div className="space-y-5">
      <PageHero
        art="course"
        title="All rounds"
        description="Every shot you log feeds the strokes-gained engine. Nothing here is estimated."
        action={
          <ButtonLink href="/rounds/new" size="sm">
            <Flag className="h-3.5 w-3.5" /> New round
          </ButtonLink>
        }
      />

      {state.rounds.length === 0 ? (
        <EmptyState
          title="No rounds yet"
          message="Play your first round to start discovering where you're gaining and losing shots."
          action={
            <ButtonLink href="/rounds/new" size="sm">
              Log a round
            </ButtonLink>
          }
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Scoring</CardTitle>
            </CardHeader>
            <CardContent>
              <TrendLine points={state.scoringTrend} height={150} invert />
            </CardContent>
          </Card>

          <SectionHeading title="Logged rounds" />

          <div className="grid gap-2.5 md:grid-cols-2">
            {state.rounds.map((round) => {
              const stats = summarizeRound(round, state.shotsByRound.get(round.id) ?? []);
              return (
                <MiniCard key={round.id} className="transition-colors hover:border-border-strong">
                  <Link href={`/rounds/${round.id}`} className="block p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold">
                          {round.course_name}
                          {round.status === "in_progress" ? (
                            <Badge tone="warn" className="ml-2 align-middle">
                              in progress
                            </Badge>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[11px] text-fg-subtle">
                          {formatDate(round.played_on)} &middot; {relativeDays(round.played_on)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular text-[20px] font-semibold leading-none">
                          {stats.score ?? "—"}
                        </p>
                        <p className="tabular dsp mt-0.5 text-[10px] tracking-[0.08em] text-fg-subtle">
                          {toParLabel(stats.to_par)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-5 gap-2">
                      <SGCell label="SG" value={stats.sg_total} digits={1} />
                      <SGCell label="Tee" value={stats.sg_by_category.off_the_tee} />
                      <SGCell label="App" value={stats.sg_by_category.approach} />
                      <SGCell label="ARG" value={stats.sg_by_category.around_the_green} />
                      <SGCell label="Putt" value={stats.sg_by_category.putting} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2.5 text-[11px] text-fg-subtle">
                      <span className="tabular">
                        FIR {stats.fairways_hit}/{stats.fairway_opportunities}
                      </span>
                      <span className="tabular">
                        GIR {stats.greens_in_regulation}/{stats.holes_played}
                      </span>
                      <span className="tabular">Putts {stats.putts}</span>
                    </div>
                  </Link>
                </MiniCard>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SGCell({ label, value, digits = 2 }: { label: string; value: number; digits?: number }) {
  return (
    <div className="min-w-0">
      <p className="dsp text-[8.5px] tracking-[0.15em] text-fg-subtle">{label}</p>
      <p
        className={cn(
          "tabular mt-0.5 text-[12.5px] font-semibold",
          value > 0.05 ? "text-good" : value < -0.05 ? "text-bad" : "text-fg-muted",
        )}
      >
        {signed(value, digits)}
      </p>
    </div>
  );
}
