import Link from "next/link";
import { Brain, ChevronDown, TrendingDown, TrendingUp } from "lucide-react";

import type { Evidence, Weakness } from "@/types/analytics";
import { SG_CATEGORIES, SG_CATEGORY_LABELS } from "@/types/golf";
import type { Baseline } from "@/lib/golf/baselines";
import type { PlayerState } from "@/lib/player-state";
import type { SuggestedSession } from "@/lib/practice/session";
import { rebaseRound } from "@/lib/golf/baselines";
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
  SectionHeading,
  Stat,
} from "@/components/ui/primitives";
import { DivergingBars } from "@/components/charts";

const SEVERITY_TONE = {
  critical: "bad",
  significant: "bad",
  moderate: "warn",
  watch: "neutral",
} as const;

const SEVERITY_TONE_INK = {
  critical: "onInkBad",
  significant: "onInkBad",
  moderate: "onInk",
  watch: "onInk",
} as const;

const INK_GLOW = {
  backgroundImage:
    "radial-gradient(120% 62% at 6% 0%, rgb(47 189 111 / 0.2), transparent 54%), radial-gradient(90% 46% at 100% 100%, rgb(168 135 63 / 0.16), transparent 58%)",
} as const;

export function SourceBadge({ source, note }: { source: "ai" | "rules"; note?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={note}>
      <Badge tone={source === "ai" ? "gold" : "neutral"}>
        <Brain className="h-3 w-3" />
        {source === "ai" ? "AI" : "Rules"}
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
          <Eyebrow className="tracking-[0.2em] text-white/60">Priority</Eyebrow>
          <h2 className="dsp mt-3 text-[31px] font-semibold leading-[0.98] tracking-[-0.015em]">
            Building your baseline
          </h2>
          <p className="mt-3 max-w-md text-[13px] leading-relaxed text-ink-fg/70">
            Not enough data to name a priority yet. Guessing one would be worse than saying so.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/rounds/new" size="sm" variant="onHeroSolid">
              Log a round
            </ButtonLink>
            <ButtonLink href="/train" size="sm" variant="onHero">
              Practise
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
          <Eyebrow className="tracking-[0.2em] text-white/60">Priority</Eyebrow>
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
            label="Total"
            value={`-${weakness.strokes_lost_total.toFixed(1)}`}
            sub="all rounds"
            tone="bad"
            divided
          />
        </div>

        {/*
          The evidence is what makes the priority trustworthy, so it stays -
          but it is four lines of prose on a screen that should read at a
          glance. <details> keeps it one tap away and costs no JavaScript.
        */}
        {weakness.evidence.length > 0 ? (
          <details className="group mt-5 border-t border-white/15 pt-4">
            <summary className="dsp flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-medium tracking-[0.17em] text-gold marker:hidden">
              Evidence ({weakness.evidence.length})
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="mt-3 flex flex-col gap-2.5">
              {weakness.evidence.map((item, index) => (
                <EvidenceLine key={index} evidence={item} />
              ))}
            </ul>
          </details>
        ) : null}
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
  return <Badge tone={onInk ? "onInk" : "neutral"}>no trend yet</Badge>;
}

// ------------------------------------------------------------ today session

/**
 * The training block. It names the strokes it is aimed at, because "technical
 * block" on its own tells a player nothing about why they are doing it.
 */
export function TodaysSession({ session }: { session: SuggestedSession | null }) {
  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Today</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="Nothing to work on yet"
            message="Log a round and a session, and today's work is built from whatever is costing you most."
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

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Today</CardTitle>
        <div className="flex shrink-0 gap-1.5">
          <Badge tone="neutral">{session.block}</Badge>
          <Badge tone="accent">{session.duration} min</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-[15px] font-medium leading-snug">{session.title}</p>
          <p className="mt-1 text-[13px] leading-[1.5] text-fg-muted">{session.objective}</p>
        </div>

        <ol className="space-y-2">
          {session.drills.map((drill) => (
            <li
              key={drill.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">{drill.name}</span>
                <span className="block truncate text-[11px] text-fg-subtle">
                  Beat {Math.round(drill.success_threshold * 100)}% · {drill.metric_to_track}
                </span>
              </span>
              <span className="tabular shrink-0 text-[11px] text-fg-muted">
                {drill.recommended_duration} min
              </span>
            </li>
          ))}
        </ol>

        <ButtonLink href="/train" size="lg">
          Start
        </ButtonLink>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------- performance grid

export function PerformanceOverview({
  state,
  baseline,
  control,
}: {
  state: PlayerState;
  baseline: Baseline;
  /** The baseline picker, passed in so this stays a server component. */
  control?: React.ReactNode;
}) {
  const { summary } = state;
  const data = SG_CATEGORIES.map((category) => ({
    label: SG_CATEGORY_LABELS[category],
    value: summary.by_category[category].per_round,
    sub: `${summary.by_category[category].shots}`,
  }));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Strokes gained / round</CardTitle>
          <p className="mt-1 text-[11px] text-fg-muted">
            vs {baseline.label} &middot; {summary.rounds} rounds
          </p>
        </div>
        <Stat
          label="Total"
          value={signed(summary.per_round, 1)}
          tone={summary.per_round >= 0 ? "good" : "bad"}
          className="items-end text-right"
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {control}
        <DivergingBars data={data} />
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------- recent round

export function RecentRound({ state, baseline }: { state: PlayerState; baseline: Baseline }) {
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
            message="Play a round to find where the strokes are going."
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
  const stats = rebaseRound(summarizeRound(round, shots), baseline);

  return (
    <Card className="overflow-hidden">
      <Link href={`/rounds/${round.id}`} className="block">
        <div className="hero-art-green relative h-[120px]">
          <div className="hero-scrim absolute inset-0" />
          <div className="absolute inset-x-4 bottom-3.5">
            <p className="dsp text-[22px] font-semibold leading-none text-white">
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
          label="SG"
          value={signed(stats.sg_total, 1)}
          tone={stats.sg_total >= 0 ? "good" : "bad"}
          size="sm"
        />
        <Stat
          label="Fairways"
          value={`${stats.fairways_hit}/${stats.fairway_opportunities}`}
          size="sm"
        />
        <Stat label="GIR" value={`${stats.greens_in_regulation}/${stats.holes_played}`} size="sm" />
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
          message="Once enough shots are on file, the ranked list appears here."
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
              <Badge tone="neutral">{percent(weakness.confidence)}</Badge>
            </div>
          </MiniCard>
        ))}
      </div>
    </div>
  );
}

export function DemoNotice({ onReset }: { onReset: () => Promise<void> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5">
      <span className="flex min-w-0 items-center gap-2.5 text-[11px] text-fg-muted">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
        <span>
          <strong className="font-semibold text-warn">Demo.</strong> Simulated player, real maths.
        </span>
      </span>
      <form action={onReset}>
        <Button type="submit" variant="secondary" size="sm">
          Reset
        </Button>
      </form>
    </div>
  );
}
