import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { SourceBadge } from "@/components/dashboard/sections";
import { SessionRunner } from "@/components/practice/session-runner";
import {
  Badge,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  HeroPill,
  PageHero,
} from "@/components/ui/primitives";
import { summarizePracticeSession } from "@/lib/ai/insights";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Practice session" };
export const dynamic = "force-dynamic";

export default async function PracticeSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await repo.currentUser();
  if (!user) return null;

  const bundle = await repo.getPracticeSession(user.id, id);
  if (!bundle) notFound();

  const state = await loadPlayerState(user.id);
  const summary = await summarizePracticeSession({
    session: bundle.session,
    attempts: bundle.attempts,
    drills: state.drills,
    trends: state.practiceTrends,
  });

  return (
    <div className="space-y-5">
      <PageHero
        art="range"
        eyebrow={`${formatDate(bundle.session.scheduled_for)} · ${
          bundle.session.actual_duration ?? bundle.session.planned_duration
        } min`}
        title={bundle.session.title}
        pills={
          <>
            <HeroPill tone="solid">{bundle.session.focus}</HeroPill>
            <HeroPill>
              {bundle.session.status === "complete" ? "Complete" : "In progress"}
            </HeroPill>
          </>
        }
        topLeft={
          <ButtonLink href="/practice" variant="onHero" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" /> Practice
          </ButtonLink>
        }
      />

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle>Session read-out</CardTitle>
          <SourceBadge source={summary.source} note={summary.note} />
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium">{summary.data.headline}</p>
          {summary.data.results.length > 0 ? (
            <ul className="space-y-1 text-sm text-fg-muted">
              {summary.data.results.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <Badge
              tone={
                summary.data.verdict === "improving"
                  ? "good"
                  : summary.data.verdict === "not_transferring"
                    ? "bad"
                    : summary.data.verdict === "holding"
                      ? "warn"
                      : "neutral"
              }
            >
              {summary.data.verdict.replace(/_/g, " ")}
            </Badge>
            <p className="text-sm text-fg-muted">{summary.data.next_step}</p>
          </div>
        </CardContent>
      </Card>

      <SessionRunner
        session={bundle.session}
        items={bundle.items}
        attempts={bundle.attempts}
        drills={state.drills}
        trends={state.practiceTrends}
      />

      {bundle.session.reflection ? (
        <Card>
          <CardHeader>
            <CardTitle>Your reflection</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-fg-muted">{bundle.session.reflection}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
