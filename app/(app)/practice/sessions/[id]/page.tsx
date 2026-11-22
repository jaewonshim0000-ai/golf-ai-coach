import { createHash } from "node:crypto";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { X } from "lucide-react";

import { ReadoutSkeleton, SourceBadge } from "@/components/dashboard/sections";
import { SessionRunner } from "@/components/practice/session-runner";
import { ResultRow } from "@/components/practice/tracker-parts";
import { DeletePracticeSessionButton } from "@/components/practice/delete-session";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  GroupLabel,
  RoundButton,
  ScreenTitle,
  StatCircle,
  TopBar,
} from "@/components/ui/primitives";
import { summarizePracticeSession } from "@/lib/ai/insights";
import { getProvider } from "@/lib/ai/provider";
import { cachedCoach } from "@/lib/ai/reconstruction-coach";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { practiceTest, testResultLabel } from "@/lib/practice/tests";
import { formatDate, percent } from "@/lib/utils";

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

  const [bundle, state] = await Promise.all([repo.getPracticeSession(user.id, id), loadPlayerState(user.id)]);
  if (!bundle) notFound();
  const { session, items, attempts } = bundle;

  const runner = (
    <SessionRunner
      session={session}
      items={items}
      attempts={attempts}
      drills={state.drills}
      trends={state.practiceTrends}
      history={state.drillAttempts}
      footer={
        <div className="flex justify-center">
          <DeletePracticeSessionButton sessionId={session.id} />
        </div>
      }
    />
  );

  // Live: the runner is the whole screen.
  if (session.status !== "complete") return runner;

  // Done: the design's session-complete screen.
  const results = items
    .map((item) => {
      const attempt = attempts.find((candidate) => candidate.practice_item_id === item.id);
      if (!attempt) return null;
      const drill = state.drills.find((candidate) => candidate.id === item.drill_id);
      const test = practiceTest(item.drill_id);
      // A new best: better than every earlier attempt at the same drill.
      const earlier = state.drillAttempts.filter(
        (other) => other.drill_id === item.drill_id && other.id !== attempt.id && other.completed_at < attempt.completed_at,
      );
      const previousBest = earlier.length ? Math.max(...earlier.map((other) => other.score)) : null;
      const best = previousBest !== null && attempt.score > previousBest;
      const previous = earlier.sort((a, b) => a.completed_at.localeCompare(b.completed_at)).at(-1);
      const detail = test
        ? testResultLabel(test, attempt)
        : best
          ? `New best · was ${percent(previousBest!)}`
          : previous
            ? previous.score === attempt.score
              ? "Same as last time"
              : `Last time ${percent(previous.score)}`
            : attempt.score >= item.target_value
              ? "Goal met"
              : `Target ${percent(item.target_value)}`;
      return {
        id: item.id,
        name: drill?.name ?? test?.name ?? item.drill_id,
        detail,
        score: test && test.kind !== "spiral" && test.kind !== "carry" && test.kind !== "dispersion"
          ? `${attempt.successes}/10`
          : `${attempt.successes}/${attempt.attempts}`,
        best,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <div className="flex flex-col gap-4">
      <TopBar
        left={
          <RoundButton href="/practice/history" label="Close">
            <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
        center={formatDate(session.completed_at ?? session.scheduled_for)}
      />
      <ScreenTitle>
        Session
        <br />
        complete!
      </ScreenTitle>

      <dl aria-label="Session totals" className="grid grid-cols-3 gap-2 rounded-[28px] bg-ink px-3 py-5 text-white">
        <StatCircle value={session.actual_duration ?? session.planned_duration} label="Minutes" tone="accent" size={64} />
        <StatCircle value={attempts.reduce((sum, attempt) => sum + attempt.attempts, 0)} label="Attempts" tone="white" size={64} />
        <StatCircle value={results.length} label="Blocks" tone="white" size={64} />
      </dl>

      {results.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="dsp text-[24px] leading-none">Saved results</h2>
          <ul className="flex flex-col gap-2">
            {results.map((row) => (
              <ResultRow key={row.id} name={row.name} detail={row.detail} score={row.score} best={row.best} />
            ))}
          </ul>
        </section>
      ) : null}

      {session.reflection ? (
        <section className="flex flex-col gap-2">
          <GroupLabel>Reflection</GroupLabel>
          <p className="rounded-[22px] bg-surface px-4 py-3.5 text-[15px] leading-relaxed">{session.reflection}</p>
        </section>
      ) : null}

      <Suspense fallback={<ReadoutSkeleton title="Session read-out" />}>
        <SessionReadout
          owner={user.id}
          input={{ session, attempts, drills: state.drills, trends: state.practiceTrends }}
        />
      </Suspense>

      {runner}

      <div className="flex justify-center">
        <DeletePracticeSessionButton sessionId={session.id} />
      </div>
    </div>
  );
}

/** Streamed, so the drills never wait for Claude; the same session reads the same until it changes. */
async function SessionReadout({ owner, input }: {
  owner: string;
  input: Parameters<typeof summarizePracticeSession>[0];
}) {
  // Drills are reference data shipped with the app, so they stay out of the key.
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(["practice_summary", getProvider().model, input.session, input.attempts, input.trends]))
    .digest("hex");
  const summary = await cachedCoach(owner, fingerprint, () => summarizePracticeSession(input));
  return (
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
  );
}
