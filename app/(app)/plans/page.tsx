import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays, CheckCircle2, Moon } from "lucide-react";

import { AdaptPlanForm, GeneratePlanForm } from "@/components/plans/plan-controls";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  SectionHeading,
  Stat,
} from "@/components/ui/primitives";
import { PRACTICE_BLOCK_LABELS } from "@/types/practice";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { DAY_NAMES, cn, formatDate, percent } from "@/lib/utils";

export const metadata: Metadata = { title: "Training plan" };
export const dynamic = "force-dynamic";

const VERDICT_TONE = {
  ahead: "good",
  on_track: "accent",
  stalled: "warn",
  regressing: "bad",
} as const;

export default async function PlansPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const state = await loadPlayerState(user.id);

  if (!state.plan) {
    return (
      <div className="space-y-6">
        <SectionHeading
          title="Training plan"
          description="A block built around your biggest development area, progressing from technique to pressure."
        />
        <EmptyState
          title="No plan yet"
          message="The plan is generated from your ranked weaknesses, your practice baselines and how much time you actually have. Nothing is invented."
          action={<GeneratePlanForm hasPlan={false} />}
        />
      </div>
    );
  }

  const { plan, sessions, adaptations } = state.plan;
  const progress = state.planProgress;
  const weeks = [...new Set(sessions.map((s) => s.week))].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Training plan"
        description={`${formatDate(plan.starts_on)} to ${formatDate(plan.ends_on)}`}
        action={<GeneratePlanForm hasPlan />}
      />

      <Card className="hero-grid">
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">
              <CalendarDays className="h-3 w-3" />
              {plan.weeks}-week block
            </Badge>
            <Badge tone={plan.generated_by === "ai" ? "accent" : "neutral"}>
              {plan.generated_by === "ai" ? "AI generated" : "Rule generated"}
            </Badge>
            {progress ? <Badge tone={VERDICT_TONE[progress.verdict]}>{progress.verdict.replace("_", " ")}</Badge> : null}
          </div>

          <div>
            <h2 className="text-xl font-semibold tracking-tight">{plan.title}</h2>
            <p className="mt-1 text-sm text-fg-muted">{plan.primary_goal}</p>
          </div>

          <p className="max-w-3xl text-sm leading-relaxed text-fg-muted">{plan.rationale}</p>

          {progress ? (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-fg-muted">
                <span>
                  {progress.completed} of {progress.scheduled} sessions complete
                </span>
                <span className="tabular">{percent(progress.completion_rate)}</span>
              </div>
              <Progress value={progress.completion_rate} label="Plan completion" />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Measurable targets</CardTitle>
          <p className="mt-0.5 text-xs text-fg-muted">
            Each one is anchored on a number you have actually recorded.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {plan.targets.map((target) => {
            const tracked = progress?.target_progress.find((t) => t.metric === target.metric);
            const value = tracked?.latest ?? null;
            const span = target.target - target.baseline;
            const pct = value === null || span === 0 ? 0 : (value - target.baseline) / span;
            return (
              <div key={`${target.metric}-${target.skill}`} className="space-y-2">
                <Stat
                  label={target.metric}
                  value={value === null ? "—" : percent(value)}
                  sub={`from ${percent(target.baseline)} to ${percent(target.target)}`}
                  tone={value !== null && value >= target.target ? "good" : "neutral"}
                />
                <Progress
                  value={Math.max(0, Math.min(1, pct))}
                  tone={pct >= 1 ? "good" : pct < 0 ? "bad" : "accent"}
                  label={target.metric}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Calendar</h2>
          <AdaptPlanForm />
        </div>

        {weeks.map((week) => (
          <div key={week} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Week {week}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {sessions
                .filter((s) => s.week === week)
                .map((session) => {
                  const drills = session.drill_ids
                    .map((id) => DRILLS_BY_ID.get(id))
                    .filter(Boolean);
                  return (
                    <Card
                      key={session.id}
                      className={cn(
                        session.is_rest && "bg-surface-2",
                        session.status === "complete" && "border-good/40",
                      )}
                    >
                      <CardContent className="space-y-2 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-subtle">
                            {DAY_NAMES[session.day - 1]}
                          </span>
                          {session.is_rest ? (
                            <Moon className="h-3.5 w-3.5 text-fg-subtle" />
                          ) : session.status === "complete" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-good" />
                          ) : (
                            <span className="tabular text-[10px] text-fg-subtle">
                              {session.duration}m
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-medium leading-snug">{session.title}</p>

                        {!session.is_rest ? (
                          <>
                            <p className="text-[10px] uppercase tracking-wide text-accent">
                              {PRACTICE_BLOCK_LABELS[session.block_emphasis]}
                            </p>
                            <ul className="space-y-0.5 text-[11px] text-fg-muted">
                              {drills.map((drill) => (
                                <li key={drill!.id} className="truncate">
                                  {drill!.name}
                                </li>
                              ))}
                            </ul>
                            {session.status !== "complete" ? (
                              <Link
                                href={`/practice?plan_session=${session.id}`}
                                className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                              >
                                Start <ArrowRight className="h-3 w-3" />
                              </Link>
                            ) : session.session_id ? (
                              <Link
                                href={`/practice/sessions/${session.session_id}`}
                                className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:underline"
                              >
                                View result
                              </Link>
                            ) : null}
                          </>
                        ) : (
                          <p className="text-[11px] text-fg-subtle">{session.objective}</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {progress && progress.signals.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>What the data says right now</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm text-fg-muted">
              {progress.signals.map((signal, index) => (
                <li key={index}>{signal}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {adaptations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Plan adaptations</CardTitle>
            <p className="mt-0.5 text-xs text-fg-muted">
              Every time new results come in, the plan is re-evaluated against its targets.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {adaptations.map((adaptation) => (
              <div key={adaptation.id} className="border-l-2 border-accent pl-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={VERDICT_TONE[adaptation.verdict]}>
                    {adaptation.verdict.replace("_", " ")}
                  </Badge>
                  <span className="text-xs text-fg-subtle">
                    {formatDate(adaptation.created_at)} &middot; {adaptation.trigger}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{adaptation.summary}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-fg-muted">
                  {adaptation.changes.map((change, index) => (
                    <li key={index}>{change}</li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
