import Link from "next/link";
import { AlertTriangle, ArrowRight, Brain, CheckCircle2, TrendingDown, TrendingUp } from "lucide-react";

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
  Eyebrow,
  InkCard,
  MiniCard,
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

/* On the ink card the pale severity fills vanish, so they get their own tones. */
const SEVERITY_TONE_INK = {
  critical: "onInkBad",
  significant: "onInkBad",
  moderate: "onInk",
  watch: "onInk",
} as const;

/* The green and gold wash that separates the ink card from a plain black box. */
const INK_GLOW = {
  backgroundImage:
    "radial-gradient(120% 62% at 6% 0%, rgb(47 189 111 / 0.2), transparent 54%), radial-gradient(90% 46% at 100% 100%, rgb(168 135 63 / 0.16), transparent 58%)",
} as const;

export function SourceBadge({ source, note }: { source: "ai" | "rules"; note?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={note}>
      <Badge tone={source === "ai" ? "gold" : "neutral"}>
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
      <InkCard>
        <div className="p-6" style={INK_GLOW}>
          <Eyebrow className="tracking-[0.2em] text-white/60">Current priority</Eyebrow>
          <h2 className="dsp mt-3 text-[31px] font-semibold leading-[0.98] tracking-[-0.015em]">
            Building your baseline
          </h2>
          <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-ink-fg/70">
            There is not enough data yet to name a priority, and guessing one would be worse than
            saying so. Log a round shot by shot and a couple of practice sessions.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/rounds/new" size="sm" variant="onHeroSolid">
              Log a round
            </ButtonLink>
            <ButtonLink href="/practice" size="sm" variant="onHero">
              Start practising
            </ButtonLink>
          </div>
        </div>
      </InkCard>
    );
  }

  return (
    <InkCard>
      <div className="p-6" style={INK_GLOW}>
        <div className="flex flex-wrap items-center gap-2">
          <Eyebrow className="tracking-[0.2em] text-white/60">Current priority</Eyebrow>
          <Badge tone={SEVERITY_TONE_INK[weakness.severity]}>{weakness.severity}</Badge>
          {!weakness.sufficient_sample ? <Badge tone="onInk">early signal</Badge> : null}
          <TrendBadge trend={weakness.trend_label} onInk />
        </div>

        <h2 className="dsp mt-3.5 text-[31px] font-semibold leading-[0.98] tracking-[-0.015em]">
          {weakness.title}
        </h2>

        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
          <InkStat
            label="Cost"
            value={`-${weakness.strokes_lost_per_round.toFixed(2)}`}
            sub="per round"
            tone="bad"
          />
          <InkStat
            label="Confidence"
            value={percent(weakness.confidence)}
            sub={`${weakness.sample_size} shots`}
            divided
          />
          <InkStat
            label="Total cost"
            value={`-${weakness.strokes_lost_total.toFixed(1)}`}
            sub="all rounds"
            tone="bad"
            divided
          />
        </div>

        <Eyebrow className="mt-6 text-gold">Why this matters</Eyebrow>
        <ul className="mt-2.5 flex flex-col gap-2.5">
          {weakness.evidence.map((item, index) => (
            <EvidenceLine key={index} evidence={item} />
          ))}
        </ul>
      </div>
    </InkCard>
  );
}

function InkStat({
  label,
  value,
  sub,
  tone,
  divided,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "bad";
  divided?: boolean;
}) {
  return (
    <div className={cn("min-w-0", divided && "border-l border-white/12 pl-3")}>
      <Eyebrow className="tracking-[0.17em] text-white/50">{label}</Eyebrow>
      <p
        className={cn(
          "tabular mt-1 text-[26px] font-semibold leading-none tracking-[-0.02em]",
          tone === "bad" ? "text-bad" : "text-ink-fg",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10.5px] text-white/55">{sub}</p>
    </div>
  );
}

function EvidenceLine({ evidence }: { evidence: Evidence }) {
  return (
    <li className="flex gap-2.5 text-[13px] leading-[1.55] text-ink-fg/80">
      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />
      <span>
        <span className="dsp text-[9px] tracking-[0.15em] text-white/45">{evidence.source}</span>{" "}
        {evidence.statement}
      </span>
    </li>
  );
}

function TrendBadge({ trend, onInk }: { trend: Weakness["trend_label"]; onInk?: boolean }) {
  if (trend === "improving") {
    return (
      <Badge tone={onInk ? "onInkGood" : "good"}>
        <TrendingUp className="h-3 w-3" /> improving
      </Badge>
    );
  }
  if (trend === "declining") {
    return (
      <Badge tone={onInk ? "onInkBad" : "bad"}>
        <TrendingDown className="h-3 w-3" /> declining
      </Badge>
    );
  }
  if (trend === "flat") return <Badge tone={onInk ? "onInk" : "neutral"}>flat</Badge>;
  return <Badge tone={onInk ? "onInk" : "neutral"}>trend unknown</Badge>;
}

// ------------------------------------------------------------- coach insight

export function CoachInsight({ result }: { result: AIResult<CoachingInsight> }) {
  const insight = result.data;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Your coach</CardTitle>
        <SourceBadge source={result.source} note={result.note} />
      </CardHeader>
      <CardContent className="space-y-3.5">
        <p className="text-[15px] font-medium leading-[1.35]">{insight.headline}</p>
        <p className="text-[13px] leading-[1.6] text-fg-muted">{insight.player_message}</p>

        <div className="rounded-[var(--radius-soft)] border border-border bg-surface-2 p-3.5">
          <Eyebrow>Connecting the systems</Eyebrow>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-fg-muted">
            {insight.cross_system_connection}
          </p>
        </div>

        <div>
          <Eyebrow>What we are doing about it</Eyebrow>
          <p className="mt-1.5 text-[13px] leading-[1.6] text-fg-muted">
            {insight.training_recommendation}
          </p>
        </div>

        {insight.secondary_priorities.length > 0 ? (
          <div>
            <Eyebrow>Also on the list</Eyebrow>
            <ul className="mt-2 space-y-1.5">
              {insight.secondary_priorities.map((item) => (
                <li key={item.weakness_id} className="flex flex-wrap items-baseline gap-2 text-[13px]">
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
          <div className="rounded-xl border border-warn/30 bg-warn-soft p-3">
            <h4 className="dsp flex items-center gap-1.5 text-[10px] font-medium tracking-[0.15em] text-warn">
              <AlertTriangle className="h-3.5 w-3.5" />
              Worth knowing about this data
            </h4>
            <ul className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed text-fg-muted">
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
              <ButtonLink href="/plans" size="sm" variant="secondary">
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
          <p className="text-[13px] leading-relaxed text-fg-muted">
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
          <p className="text-[15px] font-medium">{session.title}</p>
          <p className="mt-1 text-[13px] leading-[1.55] text-fg-muted">{session.objective}</p>
        </div>

        <ol className="space-y-2">
          {drills.map((drill) => (
            <li
              key={drill!.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{drill!.name}</span>
                <span className="block truncate text-[11px] text-fg-subtle">
                  {drill!.metric_to_track} &middot; target{" "}
                  {Math.round(drill!.success_threshold * 100)}%
                </span>
              </span>
              <span className="tabular shrink-0 text-[11px] text-fg-muted">
                {drill!.recommended_duration} min
              </span>
            </li>
          ))}
        </ol>

        {progress ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-fg-muted">
              <span>Plan progress</span>
              <span className="tabular">{percent(progress.completion_rate)}</span>
            </div>
            <Progress value={progress.completion_rate} label="Plan completion" />
          </div>
        ) : null}

        {session.status !== "complete" ? (
          <ButtonLink href={`/practice?plan_session=${session.id}`} size="lg">
            Start this session
          </ButtonLink>
        ) : (
          <p className="flex items-center gap-1.5 text-[13px] text-good">
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
    sub: `${summary.by_category[category].shots} shots`,
  }));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Strokes gained / round</CardTitle>
          <CardDescriptionLine>
            vs PGA Tour baseline &middot; {summary.rounds} round{summary.rounds === 1 ? "" : "s"}
          </CardDescriptionLine>
        </div>
        <Stat
          label="Total"
          value={signed(summary.per_round, 1)}
          tone={summary.per_round >= 0 ? "good" : "bad"}
          className="items-end text-right"
        />
      </CardHeader>
      <CardContent>
        <DivergingBars data={data} />
      </CardContent>
    </Card>
  );
}

function CardDescriptionLine({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-fg-muted">{children}</p>;
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
        <CardDescriptionLine>Oldest first. Each point is a logged result.</CardDescriptionLine>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <div>
          <Eyebrow className="mb-2">Scoring</Eyebrow>
          <TrendLine points={state.scoringTrend} height={110} invert />
        </div>
        <div>
          <Eyebrow className="mb-2">Strokes gained / round</Eyebrow>
          <TrendLine points={state.sgTrend} height={110} zeroLine />
        </div>
        <div>
          <Eyebrow className="mb-2">Handicap index</Eyebrow>
          <TrendLine points={handicap} height={110} invert />
        </div>
        <div>
          <Eyebrow className="mb-2">Practice minutes / week</Eyebrow>
          <TrendLine points={state.volume.by_week} height={110} unit=" min" />
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
              <ButtonLink href="/rounds/new" size="sm" variant="secondary">
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
    <Card className="overflow-hidden">
      <Link href={`/rounds/${round.id}`} className="block">
        <div className="hero-art-green relative h-[132px]">
          <div className="hero-scrim absolute inset-0" />
          <div className="absolute inset-x-4 bottom-3.5">
            <Eyebrow className="tracking-[0.2em] text-white/80">Most recent round</Eyebrow>
            <p className="dsp mt-1 text-[22px] font-semibold leading-none text-white">
              {round.course_name}
            </p>
            <p className="mt-1.5 text-[11px] text-white/80">
              {formatDate(round.played_on)} &middot; {relativeDays(round.played_on)}
            </p>
          </div>
        </div>
      </Link>
      <CardContent className="grid grid-cols-4 gap-x-3 gap-y-4 p-4">
        <Stat label="Score" value={stats.score ?? "—"} sub={toParLabel(stats.to_par)} size="sm" />
        <Stat
          label="SG total"
          value={signed(stats.sg_total, 1)}
          sub="vs Tour"
          tone={stats.sg_total >= 0 ? "good" : "bad"}
          size="sm"
        />
        <Stat
          label="Fairways"
          value={`${stats.fairways_hit}/${stats.fairway_opportunities}`}
          size="sm"
        />
        <Stat
          label="GIR"
          value={`${stats.greens_in_regulation}/${stats.holes_played}`}
          size="sm"
        />
        <Stat label="Putts" value={stats.putts} size="sm" />
        <Stat
          label="Up &amp; down"
          value={`${stats.up_and_downs}/${stats.up_and_down_opportunities}`}
          size="sm"
        />
        <Stat
          label="Penalties"
          value={stats.penalties}
          tone={stats.penalties > 0 ? "bad" : "neutral"}
          size="sm"
        />
        <Stat
          label="Biggest leak"
          value={worstCategory ? SG_CATEGORY_LABELS[worstCategory.c] : "—"}
          sub={worstCategory ? signed(worstCategory.v, 1) : undefined}
          tone="bad"
          size="sm"
          className="[&>span:nth-child(2)]:text-[13px]"
        />
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
        <CardTitle>Volume vs improvement</CardTitle>
        <CardDescriptionLine>
          Showing up is not the same as getting better. Tracked separately on purpose.
        </CardDescriptionLine>
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
              <ButtonLink href="/practice" size="sm" variant="secondary">
                Start a session
              </ButtonLink>
            }
          />
        ) : (
          <ul className="space-y-3.5">
            {tracked.map((trend) => {
              const toTarget =
                trend.latest === null
                  ? 0
                  : Math.max(0, Math.min(1, trend.latest / Math.max(0.01, trend.target)));
              return (
                <li key={trend.drill_id} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[12px] font-medium">
                      {trend.drill_name}
                    </span>
                    <span className="tabular shrink-0 text-[11px] text-fg-muted">
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
                  <p className="text-[10.5px] text-fg-subtle">
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
      <div className="space-y-4">
        <SectionHeading title={title} description={description} />
        <EmptyState
          title="Nothing to report yet"
          message="Once there are enough shots on file, the ranked list of where you're losing strokes appears here."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionHeading title={title} description={description} />
      <div className="grid gap-2.5 md:grid-cols-2">
        {weaknesses.slice(0, limit).map((weakness) => (
          <MiniCard key={weakness.id} className="space-y-2.5 p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold">{weakness.title}</p>
                <p className="text-[11px] text-fg-subtle">
                  {SG_CATEGORY_LABELS[weakness.category]} &middot; {weakness.sample_size} shots
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular text-[17px] font-semibold leading-none text-bad">
                  -{weakness.strokes_lost_per_round.toFixed(2)}
                </p>
                <Eyebrow className="mt-0.5 tracking-[0.15em]">per round</Eyebrow>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <Badge tone={SEVERITY_TONE[weakness.severity]}>{weakness.severity}</Badge>
              <TrendBadge trend={weakness.trend_label} />
              <Badge tone="neutral">{percent(weakness.confidence)} confidence</Badge>
              {!weakness.sufficient_sample ? <Badge tone="warn">early signal</Badge> : null}
            </div>

            <p className="text-[12px] leading-[1.55] text-fg-muted">{weakness.recommended_action}</p>
          </MiniCard>
        ))}
      </div>
    </div>
  );
}

export function DemoNotice({ onReset }: { onReset: () => Promise<void> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-3">
      <span className="flex min-w-0 items-start gap-2.5 text-[11px] leading-[1.45] text-fg-muted">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
        <span>
          <strong className="font-semibold text-warn">Demo mode.</strong> Every number is computed
          from a simulated player&apos;s shot-by-shot data. Changes are kept in memory only.
        </span>
      </span>
      <form action={onReset}>
        <Button type="submit" variant="secondary" size="sm">
          Reset demo
        </Button>
      </form>
    </div>
  );
}
