"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, Loader2, Minus, Plus } from "lucide-react";

import { completeSessionAction, recordAttemptAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
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
          />
        );
      })}

      {!complete ? <CompleteSessionForm session={session} /> : null}
    </div>
  );
}

function DrillTracker({
  item,
  drill,
  attempt,
  trend,
  readOnly,
}: {
  item: PracticeItem;
  drill: Drill;
  attempt: DrillAttempt | null;
  trend: PracticeMetricTrend | null;
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(recordAttemptAction, IDLE);
  const [attempts, setAttempts] = useState(attempt?.attempts ?? drill.recommended_reps);
  const [successes, setSuccesses] = useState(attempt?.successes ?? 0);

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

          <div className="grid gap-4 sm:grid-cols-2">
            <Counter
              label={`Good (${drill.metric_to_track.toLowerCase()})`}
              value={successes}
              onChange={(v) => setSuccesses(Math.max(0, Math.min(attempts, v)))}
              disabled={readOnly}
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
              disabled={readOnly}
            />
          </div>

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
              <Button type="submit" size="sm" variant="secondary" disabled={pending}>
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
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      <div className="flex items-center gap-2">
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
          className="tabular text-center text-lg font-semibold"
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

function CompleteSessionForm({ session }: { session: PracticeSession }) {
  const [state, formAction, pending] = useActionState(completeSessionAction, IDLE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Finish the session</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="session_id" value={session.id} />
          <Field label="Actual minutes">
            <Input
              name="actual_duration"
              type="number"
              min={5}
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
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Complete session
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
