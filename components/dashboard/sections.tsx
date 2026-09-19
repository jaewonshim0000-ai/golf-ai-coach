import Link from "next/link";
import { Brain, Check, ChevronDown, TrendingDown, TrendingUp } from "lucide-react";

import type { Evidence, Weakness } from "@/types/analytics";
import type { DrillAttempt } from "@/types/practice";
import { SG_CATEGORIES, SG_CATEGORY_LABELS } from "@/types/golf";
import type { Baseline } from "@/lib/golf/baselines";
import type { PlayerState } from "@/lib/player-state";
import type { SuggestedSession } from "@/lib/practice/session";
import { rebaseRound } from "@/lib/golf/baselines";
import { summarizeRound } from "@/lib/golf/strokes-gained";
import { benchmarkFor } from "@/lib/practice/benchmark";
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

/**
 * Whether a weakness shows up in the swing or only on the card. The tag is not
 * a guess: it is true when one of the corroborating pieces of evidence came
 * from a swing finding, and false otherwise.
 */
export function priorityKind(weakness: Weakness): "Swing related" | "Course pattern" {
  return weakness.evidence.some((item) => item.source === "swing") ? "Swing related" : "Course pattern";
}

/**
 * A ranked priority. Rank 1 gets the ink card because there is only ever one
 * thing that costs the most; rank 2 gets the same content at card weight.
 */
export function PriorityCard({ weakness, rank }: { weakness: Weakness | null; rank: 1 | 2 }) {
  if (!weakness) {
    if (rank === 2) return null;
    return (
      <InkCard>
        <div className="p-6" style={INK_GLOW}>
          <Eyebrow className="tracking-[0.2em] text-white/60">Priority #1</Eyebrow>
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
            <ButtonLink href="/practice/start" size="sm" variant="onHero">
              Practise
            </ButtonLink>
          </div>
        </div>
      </InkCard>
    );
  }

  const badges = (
    <>
      <Badge tone={rank === 1 ? SEVERITY_TONE_INK[weakness.severity] : SEVERITY_TONE[weakness.severity]}>
        {weakness.severity}
      </Badge>
      <Badge tone={rank === 1 ? "onInk" : "neutral"}>{priorityKind(weakness)}</Badge>
      <TrendBadge trend={weakness.trend_label} onInk={rank === 1} />
    </>
  );

  /*
    Rank 1 switches between the reasoning and the evidence with one pill that
    travels between two labels. Two radios and a `:has()` selector do it with
    no JavaScript at all, which is also why the panels can be plain markup.
  */
  if (rank === 1) {
    return (
      <InkCard>
        <div className="p-6" style={INK_GLOW}>
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow className="tracking-[0.2em] text-white/60">Priority #1</Eyebrow>
            {badges}
          </div>

          <h2 className="dsp mt-3.5 text-[31px] font-semibold leading-[0.98] tracking-[-0.015em]">
            {weakness.title}
          </h2>

          <div className="mt-6">
            <div className="flex items-baseline justify-between gap-3">
              <span className="tabular text-[36px] font-semibold leading-none tracking-[-0.03em] text-bad">
                -{weakness.strokes_lost_per_round.toFixed(2)}
              </span>
              <span className="text-[11px] text-white/65">
                a round &middot; {weakness.sample_size} shots &middot; {percent(weakness.confidence)}{" "}
                confidence
              </span>
            </div>
            <CostBar value={weakness.strokes_lost_per_round} onInk />
          </div>

          <div className="mt-6 [&:has(#priority-evidence:checked)_.tab-pill]:translate-x-full [&:has(#priority-evidence:checked)_.tab-why]:text-white/70 [&:has(#priority-evidence:checked)_.tab-ev]:text-ink [&:has(#priority-why:checked)_.panel-why]:block [&:has(#priority-evidence:checked)_.panel-ev]:flex">
            <input
              type="radio"
              id="priority-why"
              name="priority-panel"
              defaultChecked
              className="sr-only"
            />
            <input type="radio" id="priority-evidence" name="priority-panel" className="sr-only" />

            <div className="relative flex rounded-full bg-white/[0.09] p-1">
              <span
                className="tab-pill pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-ink-fg shadow-[0_2px_8px_-4px_rgb(0_0_0_/_0.6)] transition-transform duration-[420ms] [transition-timing-function:var(--ease)]"
                aria-hidden
              />
              <label
                htmlFor="priority-why"
                className="tab-why relative z-10 flex-1 cursor-pointer rounded-full py-2.5 text-center text-[12px] font-semibold text-ink transition-colors"
              >
                Why this is #1
              </label>
              <label
                htmlFor="priority-evidence"
                className="tab-ev relative z-10 flex-1 cursor-pointer rounded-full py-2.5 text-center text-[12px] font-semibold text-white/70 transition-colors"
              >
                Evidence &middot; {weakness.evidence.length}
              </label>
            </div>

            <div className="panel-why hidden min-h-[132px] pt-5">
              <p className="text-[13px] leading-[1.62] text-ink-fg/85">
                {weakness.recommended_action}
              </p>
              <div className="mt-6 flex gap-2">
                <ButtonLink href="/practice/start" size="md" className="press flex-1">
                  Start today&rsquo;s session
                </ButtonLink>
                <ButtonLink href="/rounds" size="md" variant="onHero" className="press">
                  See shots
                </ButtonLink>
              </div>
            </div>

            <ul className="panel-ev hidden min-h-[132px] flex-col gap-3 pt-5">
              {weakness.evidence.map((item, index) => (
                <EvidenceLine key={index} evidence={item} onInk />
              ))}
            </ul>
          </div>
        </div>
      </InkCard>
    );
  }

  /* Rank 2 is the same content at card weight: cost, then one line, then the
     evidence a tap away in a disclosure. */
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow className="tracking-[0.2em]">Priority #2</Eyebrow>
          <TrendBadge trend={weakness.trend_label} />
        </div>
        <h3 className="dsp mt-3 text-[26px] font-semibold leading-[1.02] tracking-[-0.018em]">
          {weakness.title}
        </h3>

        <div className="mt-4 flex items-baseline justify-between gap-3">
          <span className="tabular text-[24px] font-semibold leading-none tracking-[-0.02em] text-bad">
            -{weakness.strokes_lost_per_round.toFixed(2)}
          </span>
          <span className="text-[11px] text-fg-muted">
            a round &middot; {weakness.sample_size} shots &middot; {percent(weakness.confidence)}{" "}
            confidence
          </span>
        </div>
        <CostBar value={weakness.strokes_lost_per_round} />

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge tone={SEVERITY_TONE[weakness.severity]}>{weakness.severity}</Badge>
          <Badge tone="neutral">{priorityKind(weakness)}</Badge>
        </div>

        <p className="mt-4 text-[13px] leading-[1.62] text-fg-muted">
          {weakness.recommended_action}
        </p>

        {weakness.evidence.length > 0 ? (
          <details className="group mt-4 border-t border-border pt-3.5">
            <summary className="dsp flex cursor-pointer list-none items-center gap-1.5 text-[10px] font-medium tracking-[0.17em] text-fg-subtle marker:hidden">
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
      </CardContent>
    </Card>
  );
}

/**
 * The cost, drawn from the centre line outwards. Half the track is three
 * strokes a round, which keeps every real figure on the bar without a scale
 * that changes under the reader.
 */
function CostBar({ value, onInk }: { value: number; onInk?: boolean }) {
  const width = Math.min(50, (Math.abs(value) / 3) * 50);
  return (
    <div
      className={cn(
        "relative mt-3 h-2 overflow-hidden rounded-full",
        onInk ? "bg-white/10" : "bg-track",
      )}
    >
      <div
        className={cn("absolute inset-y-0 left-1/2 w-px", onInk ? "bg-white/35" : "bg-border-strong")}
        aria-hidden
      />
      <div
        className="glide absolute inset-y-0 right-1/2 rounded-l-full bg-bad"
        style={{ width: `${width}%` }}
        aria-hidden
      />
    </div>
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

function EvidenceLine({ evidence, onInk }: { evidence: Evidence; onInk?: boolean }) {
  return (
    <li
      className={cn(
        "flex gap-2.5 text-[13px] leading-[1.55]",
        onInk ? "text-ink-fg/80" : "text-fg-muted",
      )}
    >
      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden />
      <span>
        <span
          className={cn(
            "dsp text-[9px] tracking-[0.15em]",
            onInk ? "text-white/45" : "text-fg-subtle",
          )}
        >
          {evidence.source}
        </span>{" "}
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
export function TodaysSession({
  session,
  attempts,
}: {
  session: SuggestedSession | null;
  attempts: DrillAttempt[];
}) {
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

  const benchmarks = session.drills.map((drill) => benchmarkFor(drill, attempts));
  const met = benchmarks.filter((benchmark) => benchmark.beaten).length;

  /*
    The ring reports the standards already being met on today's drills, which
    is a figure the app has rather than a tick box it would have to remember.
    r=25 on a 60px circle, so the circumference is what the dash array divides.
  */
  const circumference = 2 * Math.PI * 25;
  const filled = (circumference * met) / benchmarks.length;
  const complete = met === benchmarks.length;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className="relative h-[60px] w-[60px] shrink-0">
            {complete ? (
              <span
                className="absolute -inset-1.5 rounded-full bg-[radial-gradient(circle,rgb(16_115_63_/_0.22),rgb(16_115_63_/_0)_68%)]"
                aria-hidden
              />
            ) : null}
            <svg viewBox="0 0 60 60" width="60" height="60" className="relative" aria-hidden>
              <circle cx="30" cy="30" r="25" fill="none" stroke="var(--c-track)" strokeWidth="5" />
              <circle
                cx="30"
                cy="30"
                r="25"
                fill="none"
                stroke="var(--c-accent)"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={`${filled.toFixed(1)} ${circumference.toFixed(1)}`}
                transform="rotate(-90 30 30)"
              />
            </svg>
            <span className="tabular absolute inset-0 flex items-center justify-center text-[13px] font-semibold">
              {met}/{benchmarks.length}
            </span>
          </div>

          <div className="min-w-0">
            <Eyebrow className={cn("tracking-[0.2em]", complete && "text-accent")}>
              {complete
                ? "Standards met"
                : `Today · ${session.block} · ${session.duration} min`}
            </Eyebrow>
            <h3 className="dsp mt-2 text-[24px] font-semibold leading-none tracking-[-0.018em]">
              {session.title}
            </h3>
            <p className="mt-2 text-[12px] leading-[1.5] text-fg-muted">{session.objective}</p>
          </div>
        </div>

        <ul className="mt-5 space-y-2">
          {benchmarks.map((benchmark) => (
            <li
              key={benchmark.drill.id}
              className="flex min-h-[60px] items-center gap-3 rounded-[18px] border border-border bg-surface-2 p-3"
            >
              <span
                className={cn(
                  "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px]",
                  benchmark.beaten ? "bg-accent text-white" : "bg-track text-transparent",
                )}
                aria-hidden
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3.2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight">
                  {benchmark.drill.name}
                </span>
                <span className="mt-1 block truncate text-[11px] text-fg-subtle">
                  {benchmark.drill.metric_to_track} &middot; {benchmark.drill.recommended_duration}{" "}
                  min
                </span>
              </span>
              <span className="tabular shrink-0 text-[12px] font-semibold text-accent">
                {benchmark.target} of {benchmark.reps}
              </span>
            </li>
          ))}
        </ul>

        <ButtonLink href="/practice/start" size="lg" className="press mt-5">
          Start practice
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
    <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft px-3.5 py-2.5">
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
