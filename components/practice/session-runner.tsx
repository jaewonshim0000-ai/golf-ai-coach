"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Minus, Plus } from "lucide-react";

import { completeSessionAction, recordAttemptAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { dispersion, practiceGoal } from "@/lib/practice/goals";
import type { PracticeMetricTrend } from "@/types/analytics";
import type { Drill, DrillAttempt, PracticeItem, PracticeSession } from "@/types/practice";
import { PRACTICE_BLOCK_LABELS } from "@/types/practice";
import { cn, percent } from "@/lib/utils";
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

/**
 * Running a session. Each drill is a tap-counter rather than a form: the point
 * is that logging a result takes seconds, because a result nobody logs is worth
 * nothing to the coaching engine.
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
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const onDirty = useCallback((id: string, value: boolean) => setDirty((current) => current[id] === value ? current : { ...current, [id]: value }), []);
  const canFinish = items.every((item) => attempts.some((attempt) => attempt.practice_item_id === item.id) && dirty[item.id] === false);

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const drill = drills.find((d) => d.id === item.drill_id);
        if (!drill) return null;
        return (
          <DrillTracker
            key={item.id}
            item={item}
            drill={drill}
            attempt={attempts.find((a) => a.drill_id === drill.id) ?? null}
            trend={trends.find((t) => t.drill_id === drill.id) ?? null}
            readOnly={complete}
            onDirty={onDirty}
          />
        );
      })}

      {!complete ? <CompleteSessionForm session={session} canFinish={canFinish} /> : null}
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
  const tracksOffsets = goal?.tolerance != null;
  const [counts, setAttempts] = useState(attempt?.attempts ?? item.target_reps);
  const [good, setSuccesses] = useState(attempt?.successes ?? 0);
  const [offsets, setOffsets] = useState<string[]>(Array.from({ length: item.target_reps }, (_, index) => attempt?.shot_offsets?.[index]?.toString() ?? ""));
  const values = offsets.filter((value) => value.trim() !== "").map(Number);
  const summary = tracksOffsets ? dispersion(values, goal.tolerance!) : null;
  const attempts = tracksOffsets ? values.length : counts;
  const successes = summary?.successes ?? good;
  const chip = goal?.id === "chip_accuracy";
  const hasChanges = !attempt || (tracksOffsets
    ? JSON.stringify(values) !== JSON.stringify(attempt.shot_offsets)
    : counts !== attempt.attempts || good !== attempt.successes);
  useEffect(() => { onDirty(item.id, hasChanges || pending); }, [item.id, hasChanges, pending, onDirty]);

  const score = attempts > 0 ? successes / attempts : 0;
  const met = score >= drill.success_threshold;

  // "Previous" means the last recorded result before this session.
  const history = trend?.points ?? [];
  const previous =
    history.length > (attempt ? 1 : 0)
      ? history[history.length - (attempt ? 2 : 1)]?.value ?? null
      : null;
  const change = previous !== null ? score - previous : null;

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{drill.name}</CardTitle>
          <p className="mt-0.5 text-xs text-fg-muted">{item.objective}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge tone="neutral">{PRACTICE_BLOCK_LABELS[item.block]}</Badge>
          <span className="tabular text-xs text-fg-subtle">{item.duration} min</span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="session_id" value={item.session_id} />
          <input type="hidden" name="practice_item_id" value={item.id} />
          <input type="hidden" name="drill_id" value={drill.id} />
          <input type="hidden" name="attempts" value={attempts} />
          <input type="hidden" name="successes" value={successes} />
          {tracksOffsets ? <input type="hidden" name="shot_offsets" value={JSON.stringify(values)} /> : null}

          <p className="text-sm text-fg-muted">{drill.description}</p>
          {tracksOffsets ? (
            <div className="space-y-3">
              <p className="text-sm text-fg-muted">{chip ? "Distance from the hole in feet (0 = holed)." : "Estimated sideways miss in yards: negative = left, positive = right, 0 = on line."}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {offsets.map((value, index) => (
                  <Field key={index} label={`Ball ${index + 1}`}>
                    <Input type="number" step="0.5" min={chip ? 0 : -300} max={300} required disabled={readOnly || pending}
                      aria-label={`Ball ${index + 1} ${chip ? "distance" : "offline"}`} value={value} placeholder={chip ? "e.g. 4" : "e.g. -5"}
                      onChange={(event) => setOffsets((current) => current.map((entry, i) => i === index ? event.target.value : entry))} />
                  </Field>
                ))}
              </div>
              {summary ? <div className="rounded-xl bg-surface-2 p-3 text-sm" aria-live="polite">
                <p>{summary.count}/{item.target_reps} logged · Average {chip ? "proximity" : "miss"}: {summary.averageMiss.toFixed(1)} {goal.unit}</p>
                {!chip ? <p>Left-to-right spread: {summary.spread.toFixed(1)} yd · Average direction: {Math.abs(summary.bias).toFixed(1)} yd {summary.bias < 0 ? "left" : summary.bias > 0 ? "right" : "on line"}</p> : null}
              </div> : null}
            </div>
          ) : <div className="grid grid-cols-2 gap-3">
            <Counter
              label={`Good (${drill.metric_to_track.toLowerCase()})`}
              value={successes}
              onChange={(v) => setSuccesses(Math.max(0, Math.min(attempts, v)))}
              disabled={readOnly || pending}
            />
            <Counter
              label="Total attempts"
              value={attempts}
              step={1}
              onChange={(v) => {
                const next = Math.max(1, v);
                setAttempts(next);
                setSuccesses((s) => Math.min(s, next));
              }}
              disabled={readOnly || pending || Boolean(goal)}
            />
          </div>}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-fg-muted">
                Result{" "}
                <span className="tabular font-medium text-fg">
                  {successes}/{attempts} = {percent(score)}
                </span>
              </span>
              <span className="tabular text-fg-subtle">
                target {percent(drill.success_threshold)}
                {change !== null ? (
                  <span className={cn("ml-2", change >= 0 ? "text-good" : "text-bad")}>
                    {change >= 0 ? "+" : ""}
                    {Math.round(change * 100)} pts vs last time
                  </span>
                ) : null}
              </span>
            </div>
            <Progress
              value={drill.success_threshold === 0 ? 0 : score / drill.success_threshold}
              tone={met ? "good" : "warn"}
              label={drill.name}
            />
          </div>

          {!readOnly ? (
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" variant="secondary" disabled={pending || (tracksOffsets && values.length !== item.target_reps)}>
                {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {attempt ? "Update result" : "Save result"}
              </Button>
              {state.message ? (
                <span className={cn("text-xs", state.ok ? "text-good" : "text-bad")}>
                  {state.message}
                </span>
              ) : null}
              {attempt && !state.message ? (
                <span className="flex items-center gap-1 text-xs text-good">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Recorded
                </span>
              ) : null}
            </div>
          ) : null}
        </form>

        {trend && trend.points.length > 1 ? (
          <p className="border-t border-border pt-3 text-xs text-fg-subtle">
            History: {trend.points.map((p) => `${Math.round(p.value * 100)}%`).join(" → ")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Counter({
  label,
  value,
  onChange,
  step = 1,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <span className="dsp block truncate text-[9px] font-medium tracking-[0.15em] text-fg-subtle">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => onChange(value - step)}
          disabled={disabled}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="tabular min-w-0 px-1 text-center text-lg font-semibold"
          aria-label={label}
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={() => onChange(value + step)}
          disabled={disabled}
          aria-label={`Increase ${label}`}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function CompleteSessionForm({ session, canFinish }: { session: PracticeSession; canFinish: boolean }) {
  const [state, formAction, pending] = useActionState(completeSessionAction, IDLE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish practice</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="session_id" value={session.id} />
          <Field label="Actual minutes">
            <Input
              name="actual_duration"
              type="number"
              min={1}
              max={300}
              defaultValue={session.planned_duration}
            />
          </Field>
          <Field label="Reflection" hint="What felt different? What is still not working?">
            <Textarea name="reflection" maxLength={1000} rows={3} />
          </Field>
          {state.message && !state.ok ? (
            <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.message}</p>
          ) : null}
          {!canFinish ? <p className="text-xs text-fg-muted">Save your result above before finishing practice.</p> : null}
          <Button type="submit" disabled={pending || !canFinish}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Finish practice
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
