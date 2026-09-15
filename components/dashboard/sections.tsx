import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  CircleDot,
  Flag,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { Evidence, Weakness } from "@/types/analytics";
import type { PlanSession } from "@/types/practice";
import { SG_CATEGORIES, SG_CATEGORY_LABELS } from "@/types/golf";
import type { AIResult } from "@/lib/ai/provider";
import type { CoachingInsight } from "@/lib/ai/schemas";
import type { PlayerState } from "@/lib/player-state";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import { summarizeRound } from "@/lib/golf/strokes-gained";
import { cn, formatDate, percent, relativeDays, signed, toParLabel } from "@/lib/utils";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  SectionHeading,
  Stat,
} from "@/components/ui/primitives";
import { DivergingBars, TrendLine } from "@/components/charts";

const SEVERITY_TONE = {
  critical: "bad",
  significant: "bad",
  moderate: "warn",
  watch: "neutral",
} as const;

const SOURCE_ICON = {
  course: Flag,
  practice: CircleDot,
  swing: Sparkles,
  profile: Brain,
} as const;

export function SourceBadge({ source, note }: { source: "ai" | "rules"; note?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={note}>
      <Badge tone={source === "ai" ? "accent" : "neutral"}>
        <Brain className="h-3 w-3" />
        {source === "ai" ? "AI coach" : "Rule-based coach"}
      </Badge>
    </span>
  );
}

// ------------------------------------------------------------ current focus

export function CurrentFocus({ weakness }: { weakness: Weakness | null }) {
  if (!weakness) {
    return (
      <Card className="hero-grid overflow-hidden">
        <CardContent className="p-6">
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
            Current priority
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">Building your baseline</h2>
          <p className="mt-2 max-w-xl text-sm text-fg-muted">
            There is not enough data yet to name a priority, and guessing one would be worse than
            saying so. Log a round shot by shot and a couple of practice sessions.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ButtonLink href="/rounds/new" size="sm">
              Log a round
            </ButtonLink>
            <ButtonLink href="/practice" size="sm" variant="secondary">
              Start practising
            </ButtonLink>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="hero-grid overflow-hidden">
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
            Current priority
          </p>
          <Badge tone={SEVERITY_TONE[weakness.severity]}>{weakness.severity}</Badge>
          {!weakness.sufficient_sample ? <Badge tone="warn">Early signal</Badge> : null}
          <TrendBadge trend={weakness.trend_label} />
        </div>

        <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">{weakness.title}</h2>

        <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3">
          <Stat
            label="Cost"
            value={`-${weakness.strokes_lost_per_round.toFixed(2)}`}
            sub="strokes per round"
            tone="bad"
          />
          <Stat
            label="Confidence"
            value={percent(weakness.confidence)}
            sub={`${weakness.sample_size} shots`}
          />
          <Stat
            label="Total cost"
            value={`-${weakness.strokes_lost_total.toFixed(1)}`}
            sub="strokes across your logged rounds"
          />
        </div>

        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            Why this matters
          </h3>
          <ul className="mt-2 space-y-1.5">
            {weakness.evidence.map((item, index) => (
              <EvidenceLine key={index} evidence={item} />
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceLine({ evidence }: { evidence: Evidence }) {
  const Icon = SOURCE_ICON[evidence.source];
  return (
    <li className="flex gap-2.5 text-sm text-fg-muted">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
      <span>
        <span className="font-medium uppercase tracking-wide text-[10px] text-fg-subtle">
          {evidence.source}
        </span>{" "}
        {evidence.statement}
      </span>
    </li>
  );
}

function TrendBadge({ trend }: { trend: Weakness["trend_label"] }) {
  if (trend === "improving") {
    return (
      <Badge tone="good">
        <TrendingUp className="h-3 w-3" /> improving
      </Badge>
    );
  }
  if (trend === "declining") {
    return (
      <Badge tone="bad">
        <TrendingDown className="h-3 w-3" /> declining
      </Badge>
    );
  }
  if (trend === "flat") return <Badge tone="neutral">flat</Badge>;
  return <Badge tone="neutral">trend unknown</Badge>;
}

// ------------------------------------------------------------- coach insight

export function CoachInsight({ result }: { result: AIResult<CoachingInsight> }) {
  const insight = result.data;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent" />
          Your coach
        </CardTitle>
        <SourceBadge source={result.source} note={result.note} />
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-base font-medium leading-snug">{insight.headline}</p>
        <p className="text-sm leading-relaxed text-fg-muted">{insight.player_message}</p>

        <div className="rounded-lg border border-border bg-surface-2 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            Connecting the systems
          </h4>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            {insight.cross_system_connection}
          </p>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            What we are doing about it
          </h4>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            {insight.training_recommendation}
          </p>
        </div>

        {insight.secondary_priorities.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Also on the list
            </h4>
            <ul className="mt-2 space-y-1.5">
              {insight.secondary_priorities.map((item) => (
                <li key={item.weakness_id} className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium">{item.title}</span>
                  <span className="tabular text-xs text-bad">
                    -{item.strokes_lost_per_round.toFixed(2)}/rd
                  </span>
                  <Badge tone="neutral">{item.certainty}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {insight.data_caveats.length > 0 ? (
          <div className="rounded-lg border border-warn/30 bg-warn-soft p-3">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold text-warn">
              <AlertTriangle className="h-3.5 w-3.5" />
              Worth knowing about this data
            </h4>
            <ul className="mt-1.5 space-y-1 text-xs text-fg-muted">
              {insight.data_caveats.map((caveat, index) => (
                <li key={index}>{caveat}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------ today session

export function TodaysSession({
  session,
  state,
}: {
  session: PlanSession | null;
  state: PlayerState;
}) {
  if (!state.plan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s training</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No active training plan"
            message="Generate a plan and the app will schedule your sessions around your availability and your biggest development area."
            action={
              <ButtonLink href="/plans" size="sm">
                Build a plan
              </ButtonLink>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const progress = state.planProgress;

  if (!session || session.is_rest) {
    return (
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Today&apos;s training</CardTitle>
          {progress ? (
            <Badge tone="neutral">
              {progress.completed}/{progress.scheduled} sessions
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-fg-muted">
            Rest day. {session?.objective ?? "Nothing scheduled today."}
          </p>
          <ButtonLink href="/plans" variant="secondary" size="sm">
            See the full plan <ArrowRight className="h-3.5 w-3.5" />
          </ButtonLink>
        </CardContent>
      </Card>
    );
  }

  const drills = session.drill_ids.map((id) => DRILLS_BY_ID.get(id)).filter(Boolean);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Today&apos;s training</CardTitle>
        <Badge tone={session.status === "complete" ? "good" : "accent"}>
          {session.status === "complete" ? "Complete" : `${session.duration} min`}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-base font-medium">{session.title}</p>
          <p className="mt-1 text-sm text-fg-muted">{session.objective}</p>
        </div>

        <ol className="space-y-2">
          {drills.map((drill) => (
            <li
              key={drill!.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{drill!.name}</span>
                <span className="block truncate text-xs text-fg-subtle">
                  {drill!.metric_to_track} &middot; target {Math.round(drill!.success_threshold * 100)}%
                </span>
              </span>
              <span className="tabular shrink-0 text-xs text-fg-muted">
                {drill!.recommended_duration} min
              </span>
            </li>
          ))}
        </ol>

        {progress ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-fg-muted">
              <span>Plan progress</span>
              <span className="tabular">{percent(progress.completion_rate)}</span>
            </div>
            <Progress value={progress.completion_rate} label="Plan completion" />
          </div>
        ) : null}

        {session.status !== "complete" ? (
          <ButtonLink href={`/practice?plan_session=${session.id}`} size="sm">
            Start this session <ArrowRight className="h-3.5 w-3.5" />
          </ButtonLink>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-good">
            <CheckCircle2 className="h-4 w-4" /> Session complete
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------- performance grid

export function PerformanceOverview({ state }: { state: PlayerState }) {
  const { summary } = state;
  const data = SG_CATEGORIES.map((category) => ({
    label: SG_CATEGORY_LABELS[category],
    value: summary.by_category[category].per_round,
  }));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Strokes gained per round</CardTitle>
          <p className="mt-0.5 text-xs text-fg-muted">
            Against the PGA Tour baseline, across {summary.rounds} round
            {summary.rounds === 1 ? "" : "s"}
          </p>
        </div>
        <Stat
          label="Total"
          value={signed(summary.per_round, 1)}
          tone={summary.per_round >= 0 ? "good" : "bad"}
        />
      </CardHeader>
      <CardContent>
        <DivergingBars data={data} height={190} />
      </CardContent>
    </Card>
  );
}

export function TrendsCard({ state }: { state: PlayerState }) {
  const handicap = state.handicapHistory.map((entry) => ({
    date: entry.recorded_on,
    label: "Handicap index",
    value: entry.handicap_index,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trends</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium text-fg-muted">Scoring</p>
          <TrendLine points={state.scoringTrend} height={150} invert />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-fg-muted">Strokes gained per round</p>
          <TrendLine points={state.sgTrend} height={150} zeroLine />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-fg-muted">Handicap index</p>
          <TrendLine points={handicap} height={150} invert />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-fg-muted">Practice minutes per week</p>
          <TrendLine points={state.volume.by_week} height={150} unit=" min" />
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------- recent round

export function RecentRound({ state }: { state: PlayerState }) {
  const round = state.rounds[0];
  if (!round) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent round</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No rounds yet"
            message="Play your first round to start discovering where you're gaining and losing shots."
            action={
              <ButtonLink href="/rounds/new" size="sm">
                Log a round
              </ButtonLink>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const shots = state.shotsByRound.get(round.id) ?? [];
  const stats = summarizeRound(round, shots);
  const worstCategory = SG_CATEGORIES.map((c) => ({ c, v: stats.sg_by_category[c] })).sort(
    (a, b) => a.v - b.v,
  )[0];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>{round.course_name}</CardTitle>
          <p className="mt-0.5 text-xs text-fg-muted">
            {formatDate(round.played_on)} &middot; {relativeDays(round.played_on)}
          </p>
        </div>
        <Link href={`/rounds/${round.id}`} className="text-xs text-accent hover:underline">
          Full round
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Score" value={stats.score ?? "—"} sub={toParLabel(stats.to_par)} />
          <Stat
            label="SG total"
            value={signed(stats.sg_total, 1)}
            tone={stats.sg_total >= 0 ? "good" : "bad"}
          />
          <Stat
            label="Fairways"
            value={`${stats.fairways_hit}/${stats.fairway_opportunities}`}
          />
          <Stat label="GIR" value={`${stats.greens_in_regulation}/${stats.holes_played}`} />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Putts" value={stats.putts} />
          <Stat
            label="Up & down"
            value={`${stats.up_and_downs}/${stats.up_and_down_opportunities}`}
          />
          <Stat label="Penalties" value={stats.penalties} />
          <Stat
            label="Biggest leak"
            value={
              <span className="text-base">
                {worstCategory ? SG_CATEGORY_LABELS[worstCategory.c] : "—"}
              </span>
            }
            sub={worstCategory ? signed(worstCategory.v, 1) : undefined}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------- practice progress

export function PracticeProgress({ state }: { state: PlayerState }) {
  const { improvement, volume } = state;
  const tracked = state.practiceTrends.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice: volume vs improvement</CardTitle>
        <p className="mt-0.5 text-xs text-fg-muted">
          Showing up is not the same as getting better. These are tracked separately on purpose.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-4">
          <Stat label="Sessions" value={volume.sessions_completed} sub="completed" />
          <Stat label="Minutes" value={volume.total_minutes} sub="logged" />
          <Stat
            label="Improving"
            value={`${improvement.improving.length}/${improvement.improving.length + improvement.flat.length + improvement.declining.length}`}
            sub="skills moving"
            tone={improvement.improving.length > improvement.declining.length ? "good" : "neutral"}
          />
        </div>

        {tracked.length === 0 ? (
          <EmptyState
            title="No practice results yet"
            message="Complete your first training session and we'll start building your performance profile."
            action={
              <ButtonLink href="/practice" size="sm">
                Start a session
              </ButtonLink>
            }
          />
        ) : (
          <ul className="space-y-3">
            {tracked.map((trend) => {
              const toTarget =
                trend.latest === null
                  ? 0
                  : Math.max(0, Math.min(1, trend.latest / Math.max(0.01, trend.target)));
              return (
                <li key={trend.drill_id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-medium">{trend.drill_name}</span>
                    <span className="tabular shrink-0 text-xs text-fg-muted">
                      {trend.latest === null ? "—" : percent(trend.latest)} / {percent(trend.target)}
                      {trend.delta !== null ? (
                        <span className={cn("ml-2", trend.delta >= 0 ? "text-good" : "text-bad")}>
                          {trend.delta >= 0 ? "+" : ""}
                          {Math.round(trend.delta * 100)} pts
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <Progress
                    value={toTarget}
                    tone={trend.meeting_target ? "good" : trend.sessions < 3 ? "accent" : "warn"}
                    label={trend.drill_name}
                  />
                  <p className="text-[11px] text-fg-subtle">
                    {trend.sessions < 3
                      ? `${trend.sessions} session${trend.sessions === 1 ? "" : "s"} recorded - not enough to call a direction yet.`
                      : trend.meeting_target
                        ? "Meeting the standard for this drill."
                        : `${trend.metric} still below the ${percent(trend.target)} standard.`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------- weakness list

export function WeaknessList({
  weaknesses,
  limit = 6,
  title = "Development areas",
  description,
}: {
  weaknesses: Weakness[];
  limit?: number;
  title?: string;
  description?: string;
}) {
  if (weaknesses.length === 0) {
    return (
      <div className="space-y-3">
        <SectionHeading title={title} description={description} />
        <EmptyState
          title="Nothing to report yet"
          message="Once there are enough shots on file, the ranked list of where you're losing strokes appears here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SectionHeading title={title} description={description} />
      <div className="grid gap-3 md:grid-cols-2">
        {weaknesses.slice(0, limit).map((weakness) => (
          <Card key={weakness.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{weakness.title}</p>
                  <p className="text-xs text-fg-subtle">
                    {SG_CATEGORY_LABELS[weakness.category]} &middot; {weakness.sample_size} shots
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-lg font-semibold text-bad">
                    -{weakness.strokes_lost_per_round.toFixed(2)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wide text-fg-subtle">per round</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Badge tone={SEVERITY_TONE[weakness.severity]}>{weakness.severity}</Badge>
                <TrendBadge trend={weakness.trend_label} />
                <Badge tone="neutral">{percent(weakness.confidence)} confidence</Badge>
                {!weakness.sufficient_sample ? <Badge tone="warn">early signal</Badge> : null}
              </div>

              <p className="text-xs leading-relaxed text-fg-muted">{weakness.recommended_action}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function DemoNotice({ onReset }: { onReset: () => Promise<void> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn-soft px-4 py-2.5 text-xs">
      <span className="text-fg-muted">
        <strong className="font-semibold text-warn">Demo mode.</strong> Everything you see is
        computed from a simulated player&apos;s real shot-by-shot data. Changes are kept in memory
        only. Add Supabase credentials to switch to real accounts.
      </span>
      <form action={onReset}>
        <Button type="submit" variant="secondary" size="sm">
          Reset demo
        </Button>
      </form>
    </div>
  );
}
