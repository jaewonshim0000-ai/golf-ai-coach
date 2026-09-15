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
    <div className="space-y-6">
      <SectionHeading
        title="Rounds"
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
              <TrendLine points={state.scoringTrend} height={180} invert />
            </CardContent>
          </Card>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-fg-subtle">
                  <th className="py-2 pr-4 font-medium">Course</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 text-right font-medium">Score</th>
                  <th className="py-2 pr-4 text-right font-medium">SG</th>
                  <th className="py-2 pr-4 text-right font-medium">Tee</th>
                  <th className="py-2 pr-4 text-right font-medium">App</th>
                  <th className="py-2 pr-4 text-right font-medium">ARG</th>
                  <th className="py-2 pr-4 text-right font-medium">Putt</th>
                  <th className="py-2 pr-4 text-right font-medium">FIR</th>
                  <th className="py-2 pr-4 text-right font-medium">GIR</th>
                  <th className="py-2 text-right font-medium">Putts</th>
                </tr>
              </thead>
              <tbody>
                {state.rounds.map((round) => {
                  const stats = summarizeRound(round, state.shotsByRound.get(round.id) ?? []);
                  return (
                    <tr key={round.id} className="border-b border-border last:border-0">
                      <td className="py-2.5 pr-4">
                        <Link href={`/rounds/${round.id}`} className="font-medium hover:text-accent">
                          {round.course_name}
                        </Link>
                        {round.status === "in_progress" ? (
                          <Badge tone="warn" className="ml-2">
                            in progress
                          </Badge>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-4 text-fg-muted">
                        {formatDate(round.played_on)}
                        <span className="ml-1.5 text-xs text-fg-subtle">
                          {relativeDays(round.played_on)}
                        </span>
                      </td>
                      <td className="tabular py-2.5 pr-4 text-right font-medium">
                        {stats.score ?? "—"}
                        <span className="ml-1 text-xs text-fg-subtle">{toParLabel(stats.to_par)}</span>
                      </td>
                      <SGCell value={stats.sg_total} digits={1} />
                      <SGCell value={stats.sg_by_category.off_the_tee} />
                      <SGCell value={stats.sg_by_category.approach} />
                      <SGCell value={stats.sg_by_category.around_the_green} />
                      <SGCell value={stats.sg_by_category.putting} />
                      <td className="tabular py-2.5 pr-4 text-right text-fg-muted">
                        {stats.fairways_hit}/{stats.fairway_opportunities}
                      </td>
                      <td className="tabular py-2.5 pr-4 text-right text-fg-muted">
                        {stats.greens_in_regulation}/{stats.holes_played}
                      </td>
                      <td className="tabular py-2.5 text-right text-fg-muted">{stats.putts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SGCell({ value, digits = 2 }: { value: number; digits?: number }) {
  return (
    <td
      className={cn(
        "tabular py-2.5 pr-4 text-right",
        value > 0.05 ? "text-good" : value < -0.05 ? "text-bad" : "text-fg-muted",
      )}
    >
      {signed(value, digits)}
    </td>
  );
}
