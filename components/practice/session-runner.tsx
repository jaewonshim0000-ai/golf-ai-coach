"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Minus, Pause, Play, Plus, RotateCcw, Undo2 } from "lucide-react";

import { completeSessionAction, recordAttemptAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { offsetFor, practiceGoal } from "@/lib/practice/goals";
import type { PracticeMetricTrend } from "@/types/analytics";
import type { Drill, DrillAttempt, PracticeItem, PracticeSession } from "@/types/practice";
import { PRACTICE_BLOCK_LABELS } from "@/types/practice";
import { cn, percent } from "@/lib/utils";
import { TargetPlot } from "@/components/practice/target-plot";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Progress,
  Textarea,
} from "@/components/ui/primitives";

type Point = [number, number];

/**
 * Running a plan, one block at a time.
 *
 * Each block has its own clock and its own way of logging: the goal's test is
 * plotted on a target, putts are tapped made or missed, library drills are a
 * counter. Logging a result takes seconds, because a result nobody logs is
 * worth nothing to the next plan.
 */
export function SessionRunner({
  session,
  items,
  attempts,
  drills,
  trends,
}: {
  session: PracticeSession;
  items: PracticeItem[];
  attempts: DrillAttempt[];
  drills: Drill[];
  trends: PracticeMetricTrend[];
}) {
  const complete = session.status === "complete";
  const logged = (item: PracticeItem) => attempts.some((attempt) => attempt.practice_item_id === item.id);
  const [current, setCurrent] = useState(() => Math.max(0, items.findIndex((item) => !logged(item))));
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const onDirty = useCallback(
    (id: string, value: boolean) => setDirty((now) => (now[id] === value ? now : { ...now, [id]: value })),
    [],
  );
  // ponytail: the clock lives in this tab; a reload restarts the block's
  // count. Store the start time if players come to rely on it across reloads.
  const [elapsed, setElapsed] = useState<Record<string, number>>({});
  const [running, setRunning] = useState(false);
  const item = items[current];

  useEffect(() => {
    if (!running || !item) return;
    const timer = window.setInterval(
      () => setElapsed((now) => ({ ...now, [item.id]: (now[item.id] ?? 0) + 1 })),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [running, item]);

  const tests = items.filter((candidate) => candidate.block === "skill");
  const canFinish =
    attempts.length > 0 &&
    tests.every(logged) &&
    Object.values(dirty).every((value) => !value);
  const totalMinutes = Math.round(Object.values(elapsed).reduce((sum, value) => sum + value, 0) / 60);

  const tracker = (block: PracticeItem, readOnly: boolean) => {
    const drill = drills.find((candidate) => candidate.id === block.drill_id);
    if (!drill) return null;
    return (
      <DrillTracker
        key={block.id}
        item={block}
        drill={drill}
        attempt={attempts.find((attempt) => attempt.practice_item_id === block.id) ?? null}
        trend={trends.find((trend) => trend.drill_id === drill.id) ?? null}
        readOnly={readOnly}
        onDirty={onDirty}
      />
    );
  };

  if (complete) {
    const skipped = items.filter((block) => !logged(block));
    return (
      <div className="space-y-4">
        {items.filter(logged).map((block) => tracker(block, true))}
        {skipped.length > 0 ? (
          <p className="text-[12px] text-fg-subtle">
            Not logged: {skipped.map((block) => PRACTICE_BLOCK_LABELS[block.block]).join(", ")}.
          </p>
        ) : null}
      </div>
    );
  }
  if (!item) return null;

  const seconds = item.duration * 60 - (elapsed[item.id] ?? 0);
  const clock = `${seconds < 0 ? "+" : ""}${Math.floor(Math.abs(seconds) / 60)}:${String(Math.abs(seconds) % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <nav aria-label="Blocks" className="flex gap-1.5 overflow-x-auto pb-1">
        {items.map((block, index) => (
          <button
            key={block.id}
            type="button"
            onClick={() => setCurrent(index)}
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors",
              index === current ? "border-accent bg-accent-soft font-medium" : "border-border bg-surface",
            )}
          >
            {logged(block) ? <CheckCircle2 className="h-3.5 w-3.5 text-good" aria-label="logged" /> : <span className="tabular text-fg-subtle">{index + 1}</span>}
            {PRACTICE_BLOCK_LABELS[block.block].replace(" block", "")}
          </button>
        ))}
      </nav>

      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="dsp text-[9px] tracking-[0.15em] text-fg-subtle">
              Block {current + 1} of {items.length} · {item.duration} min
            </p>
            <p
              className={cn("tabular text-[30px] font-semibold leading-none", seconds < 0 && "text-warn")}
              role="timer"
              aria-live="off"
            >
              {clock}
            </p>
            {seconds <= 0 ? <p className="mt-1 text-[11.5px] text-warn">Time. Log it and move on.</p> : null}
          </div>
          <div className="flex gap-1.5">
            <Button type="button" size="icon" variant={running ? "secondary" : "primary"} onClick={() => setRunning((on) => !on)} aria-label={running ? "Pause the clock" : "Start the clock"}>
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </Button>
            <Button type="button" size="icon" variant="ghost" onClick={() => setElapsed((now) => ({ ...now, [item.id]: 0 }))} aria-label="Reset the clock">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Every block stays mounted, so balls plotted but not yet saved survive
          a look at another block. */}
      {items.map((block, index) => (
        <div key={block.id} hidden={index !== current}>
          {tracker(block, false)}
        </div>
      ))}

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => setCurrent(current - 1)} disabled={current === 0}>
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </Button>
        {current < items.length - 1 ? (
          <Button type="button" size="sm" onClick={() => setCurrent(current + 1)}>
            Next block <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      {current === items.length - 1 || tests.every(logged) ? (
        <CompleteSessionForm session={session} canFinish={canFinish} minutes={totalMinutes || session.planned_duration} />
      ) : null}
    </div>
  );
}

function DrillTracker({
  item,
  drill,
  attempt,
  trend,
  readOnly,
  onDirty,
}: {
  item: PracticeItem;
  drill: Drill;
  attempt: DrillAttempt | null;
  trend: PracticeMetricTrend | null;
  readOnly: boolean;
  onDirty: (id: string, value: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(recordAttemptAction, IDLE);
  const goal = practiceGoal(drill.id);
  const tolerance = goal ? (item.tolerance ?? goal.tolerance) : null;
  const plotted = goal !== undefined && tolerance !== null;
  const putting = goal?.id === "putting_conversion";

  const [points, setPoints] = useState<Point[]>(() => attempt?.shot_points ?? []);
  // Putts: the sequence of makes and misses, in order.
  const [putts, setPutts] = useState<boolean[]>(() =>
    attempt && putting
      ? Array.from({ length: attempt.attempts }, (_, index) => index < attempt.successes)
      : [],
  );
  const [counted, setCounted] = useState(attempt?.attempts ?? item.target_reps);
  const [good, setGood] = useState(attempt?.successes ?? 0);

  // Same rounding as the server, so a ball on the line scores the same on both.
  const offsets = plotted ? points.map((point) => Math.abs(offsetFor(goal, point))) : [];
  // Results saved before plotting existed have counts but no points.
  const legacy = plotted && attempt !== null && !attempt.shot_points?.length && points.length === 0;
  const attempts = legacy ? attempt.attempts : plotted ? points.length : putting ? putts.length : counted;
  const successes = legacy
    ? attempt.successes
    : plotted
      ? offsets.filter((value) => value <= tolerance).length
      : putting
        ? putts.filter(Boolean).length
        : good;
  const ready = plotted || putting ? attempts === item.target_reps : attempts > 0;

  const hasChanges = !attempt || attempts !== attempt.attempts || successes !== attempt.successes ||
    (plotted && JSON.stringify(points) !== JSON.stringify(attempt.shot_points ?? []));
  // Unsaved work holds the session open; a block nobody has touched does not.
  const touched = plotted ? points.length > 0 : putting ? putts.length > 0 : good > 0;
  const unsaved = (attempt ? hasChanges : touched) || pending;
  useEffect(() => {
    onDirty(item.id, unsaved);
  }, [item.id, unsaved, onDirty]);

  const score = attempts > 0 ? successes / attempts : 0;
  const met = score >= item.target_value;
  const history = trend?.points ?? [];
  const previous =
    history.length > (attempt ? 1 : 0) ? history[history.length - (attempt ? 2 : 1)]?.value ?? null : null;
  const change = previous !== null && attempts > 0 ? score - previous : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{drill.name}</CardTitle>
          <p className="mt-0.5 text-xs text-fg-muted">{item.objective}</p>
        </div>
        <Badge tone={item.block === "skill" ? "accent" : "neutral"}>
          {item.block === "skill" ? "Test" : PRACTICE_BLOCK_LABELS[item.block]}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="session_id" value={item.session_id} />
          <input type="hidden" name="practice_item_id" value={item.id} />
          <input type="hidden" name="drill_id" value={drill.id} />
          <input type="hidden" name="attempts" value={attempts} />
          <input type="hidden" name="successes" value={successes} />
          {plotted ? <input type="hidden" name="shot_points" value={JSON.stringify(points)} /> : null}

          {goal ? null : (
            <details className="text-[12.5px] text-fg-muted">
              <summary className="cursor-pointer font-medium text-fg">How to do it</summary>
              <p className="mt-2">{drill.description}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                {drill.instructions.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </details>
          )}

          {plotted ? (
            <TargetPlot goal={goal} tolerance={tolerance} points={points} onChange={setPoints} balls={item.target_reps} disabled={readOnly || pending} />
          ) : putting ? (
            <PuttTapper putts={putts} onChange={setPutts} balls={item.target_reps} disabled={readOnly || pending} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Counter
                label={`Good (${drill.metric_to_track.toLowerCase()})`}
                value={good}
                onChange={(value) => setGood(Math.max(0, Math.min(counted, value)))}
                disabled={readOnly || pending}
              />
              <Counter
                label="Attempts"
                value={counted}
                onChange={(value) => {
                  const next = Math.max(1, value);
                  setCounted(next);
                  setGood((now) => Math.min(now, next));
                }}
                disabled={readOnly || pending}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-fg-muted">
                Result{" "}
                <span className="tabular font-medium text-fg">
                  {successes}/{attempts} = {percent(score)}
                </span>
              </span>
              <span className="tabular text-fg-subtle">
                target {percent(item.target_value)}
                {change !== null ? (
                  <span className={cn("ml-2", change >= 0 ? "text-good" : "text-bad")}>
                    {change >= 0 ? "+" : ""}
                    {Math.round(change * 100)} pts vs last time
                  </span>
                ) : null}
              </span>
            </div>
            <Progress value={item.target_value === 0 ? 0 : score / item.target_value} tone={met ? "good" : "warn"} label={drill.name} />
          </div>

          {!readOnly ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" variant={ready && hasChanges ? "primary" : "secondary"} disabled={pending || !ready}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {attempt ? "Update result" : "Save result"}
              </Button>
              {state.message ? (
                <span className={cn("text-xs", state.ok ? "text-good" : "text-bad")}>{state.message}</span>
              ) : attempt && !hasChanges ? (
                <span className="flex items-center gap-1 text-xs text-good">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Recorded
                </span>
              ) : !ready ? (
                <span className="text-xs text-fg-subtle">
                  {item.target_reps - attempts} ball{item.target_reps - attempts === 1 ? "" : "s"} to go
                </span>
              ) : null}
            </div>
          ) : null}
        </form>

        {trend && trend.points.length > 1 ? (
          <p className="border-t border-border pt-3 text-xs text-fg-subtle">
            History: {trend.points.map((point) => `${Math.round(point.value * 100)}%`).join(" → ")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** Ten putts: tap made or missed after each one. */
function PuttTapper({
  putts,
  onChange,
  balls,
  disabled,
}: {
  putts: boolean[];
  onChange: (putts: boolean[]) => void;
  balls: number;
  disabled: boolean;
}) {
  const full = putts.length >= balls;
  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-1.5" aria-label={`${putts.filter(Boolean).length} made of ${putts.length}`} role="img">
        {Array.from({ length: balls }, (_, index) => (
          <span
            key={index}
            className={cn(
              "h-4 w-4 rounded-full border",
              index >= putts.length ? "border-border-strong" : putts[index] ? "border-good bg-good" : "border-bad bg-bad-soft",
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" onClick={() => onChange([...putts, true])} disabled={disabled || full}>
          Made
        </Button>
        <Button type="button" variant="secondary" onClick={() => onChange([...putts, false])} disabled={disabled || full}>
          Missed
        </Button>
      </div>
      <div className="flex items-center justify-between">
        <p className="tabular text-[12.5px] font-medium" aria-live="polite">
          {full ? "All putts logged" : `Putt ${putts.length + 1} of ${balls}`}
        </p>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(putts.slice(0, -1))} disabled={disabled || putts.length === 0}>
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </Button>
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="dsp block truncate text-[9px] font-medium tracking-[0.15em] text-fg-subtle">{label}</span>
      <div className="flex items-center gap-1.5">
        <Button type="button" variant="secondary" size="icon" onClick={() => onChange(value - 1)} disabled={disabled} aria-label={`Decrease ${label}`}>
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          disabled={disabled}
          className="tabular min-w-0 px-1 text-center text-lg font-semibold"
          aria-label={label}
        />
        <Button type="button" variant="secondary" size="icon" onClick={() => onChange(value + 1)} disabled={disabled} aria-label={`Increase ${label}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CompleteSessionForm({
  session,
  canFinish,
  minutes,
}: {
  session: PracticeSession;
  canFinish: boolean;
  minutes: number;
}) {
  const [state, formAction, pending] = useActionState(completeSessionAction, IDLE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish practice</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="session_id" value={session.id} />
          <Field label="Minutes practised">
            <Input key={minutes} name="actual_duration" type="number" min={1} max={300} defaultValue={minutes} />
          </Field>
          <Field label="Reflection" hint="What felt different? What is still not working?">
            <Textarea name="reflection" maxLength={1000} rows={3} />
          </Field>
          {state.message && !state.ok ? (
            <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.message}</p>
          ) : null}
          {!canFinish ? (
            <p className="text-xs text-fg-muted">Save the test block&apos;s result (and any unsaved edits) before finishing.</p>
          ) : null}
          <Button type="submit" disabled={pending || !canFinish}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Finish practice
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
