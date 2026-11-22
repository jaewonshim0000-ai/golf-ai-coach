"use client";

import { useActionState, useCallback, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, RotateCcw, X } from "lucide-react";

import { completeSessionAction, recordAttemptAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { offsetFor, practiceGoal } from "@/lib/practice/goals";
import type { PracticeMetricTrend } from "@/types/analytics";
import type { Drill, DrillAttempt, PracticeItem, PracticeSession } from "@/types/practice";
import { PRACTICE_BLOCK_LABELS } from "@/types/practice";
import { cn, percent } from "@/lib/utils";
import { TargetPlot } from "@/components/practice/target-plot";
import { TestTracker } from "@/components/practice/test-tracker";
import { BallStrip, StripFooter, TrackerHead } from "@/components/practice/tracker-parts";
import { Disclosure } from "@/components/ui/disclosure";
import { practiceTest } from "@/lib/practice/tests";
import {
  ActionBar,
  ArtHero,
  Button,
  GroupLabel,
  Input,
  RoundButton,
  Sheet,
  StatCircle,
  Textarea,
  barButton,
} from "@/components/ui/primitives";

type Point = [number, number];

/**
 * Running a plan, one block at a time, as the design's live drill screen: the
 * drill over the range art with the block clock, then a white sheet with what
 * counts, the strip of balls so far, and the two big logging buttons.
 *
 * Each block has its own clock and its own way of logging: the goal's test is
 * plotted on a target, putts and library drills are tapped in or out. Logging
 * a result takes seconds, because a result nobody logs is worth nothing to the
 * next plan. After the last block comes the wrap-up: minutes and a reflection.
 */
export function SessionRunner({
  session,
  items,
  attempts,
  drills,
  trends,
  history = attempts,
  footer,
}: {
  session: PracticeSession;
  items: PracticeItem[];
  attempts: DrillAttempt[];
  drills: Drill[];
  trends: PracticeMetricTrend[];
  history?: DrillAttempt[];
  /** Shown at the end of the wrap-up, e.g. the delete button. */
  footer?: ReactNode;
}) {
  const complete = session.status === "complete";
  const logged = (item: PracticeItem) => attempts.some((attempt) => attempt.practice_item_id === item.id);
  const [current, setCurrent] = useState(() => {
    const next = items.findIndex((item) => !logged(item));
    return next === -1 ? items.length : next;
  });
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
  const canFinish = attempts.length > 0 && tests.every(logged) && Object.values(dirty).every((value) => !value);
  const totalMinutes = Math.round(Object.values(elapsed).reduce((sum, value) => sum + value, 0) / 60);
  const next = () => setCurrent((index) => Math.min(items.length, index + 1));

  const tracker = (block: PracticeItem, index: number, readOnly: boolean) => {
    const drill = drills.find((candidate) => candidate.id === block.drill_id);
    if (!drill) return null;
    const test = practiceTest(drill.id);
    const nextLabel = index === items.length - 1 ? "Wrap up" : "Next drill";
    if (test)
      return (
        <TestTracker
          key={block.id}
          test={test}
          item={block}
          attempt={attempts.find((attempt) => attempt.practice_item_id === block.id) ?? null}
          history={history.filter((attempt) => attempt.drill_id === drill.id)}
          readOnly={readOnly}
          onDirty={onDirty}
          onNext={readOnly ? undefined : next}
          nextLabel={nextLabel}
        />
      );
    return (
      <DrillTracker
        key={block.id}
        item={block}
        drill={drill}
        attempt={attempts.find((attempt) => attempt.practice_item_id === block.id) ?? null}
        trend={trends.find((trend) => trend.drill_id === drill.id) ?? null}
        readOnly={readOnly}
        onDirty={onDirty}
        onNext={readOnly ? undefined : next}
        nextLabel={nextLabel}
      />
    );
  };

  if (complete) {
    const done = items.filter(logged);
    if (done.length === 0) return null;
    return (
      <Disclosure title="Recorded balls" count={done.length} description="Open to review every ball and score you logged.">
        <div className="flex flex-col gap-6">
          {done.map((block, index) => (
            <div key={block.id} className="flex flex-col gap-3">
              <GroupLabel>{drills.find((drill) => drill.id === block.drill_id)?.name ?? PRACTICE_BLOCK_LABELS[block.block]}</GroupLabel>
              {tracker(block, index, true)}
            </div>
          ))}
        </div>
      </Disclosure>
    );
  }

  const finishing = current >= items.length;
  const drillName = item ? (drills.find((drill) => drill.id === item.drill_id)?.name ?? PRACTICE_BLOCK_LABELS[item.block]) : "";
  const seconds = item ? item.duration * 60 - (elapsed[item.id] ?? 0) : 0;
  const clock = `${seconds < 0 ? "+" : ""}${String(Math.floor(Math.abs(seconds) / 60)).padStart(2, "0")}:${String(Math.abs(seconds) % 60).padStart(2, "0")}`;
  const blockLabel = item?.block === "skill" ? "Test" : item ? PRACTICE_BLOCK_LABELS[item.block].replace(/ block$/, "") : "";

  return (
    <div className="flex flex-col">
      <ArtHero
        art="range"
        height="lg"
        center
        title={finishing ? "Wrap up" : drillName}
        topLeft={
          <RoundButton href="/practice" tone="hero" label="Leave the session; it stays saved">
            <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
        topRight={
          finishing || !item ? null : (
            <>
              {!running && (elapsed[item.id] ?? 0) > 0 ? (
                <RoundButton
                  tone="hero"
                  label="Reset the clock"
                  onClick={() => setElapsed((now) => ({ ...now, [item.id]: 0 }))}
                >
                  <RotateCcw className="h-4 w-4" />
                </RoundButton>
              ) : null}
              <button
                type="button"
                onClick={() => setRunning((on) => !on)}
                aria-label={`${running ? "Pause" : "Start"} the clock, ${clock} ${seconds < 0 ? "over" : "left"}`}
                role="timer"
                className={cn(
                  "press font-display tabular flex h-11 items-center gap-2 rounded-full bg-[rgb(20_24_15_/_0.6)] px-4 text-[18px] tracking-[0.04em]",
                  seconds < 0 && "text-gold",
                )}
              >
                {running ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
                    <rect x="5" y="4" width="5" height="16" rx="1.5" fill="#E8C547" />
                    <rect x="14" y="4" width="5" height="16" rx="1.5" fill="#E8C547" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden>
                    <path d="M6 4v16l14-8z" fill="#E8C547" />
                  </svg>
                )}
                {clock}
              </button>
            </>
          )
        }
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCurrent((index) => Math.max(0, index - 1))}
            disabled={current === 0}
            aria-label="Previous drill"
            className="press flex h-8 w-8 items-center justify-center rounded-full text-white disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="dsp inline-flex h-8 items-center rounded-full border-[1.5px] border-white/85 px-3.5 text-[11px] tracking-[0.1em]">
            {finishing ? `${items.filter(logged).length} of ${items.length} logged` : `Drill ${current + 1} of ${items.length} · ${blockLabel}`}
          </span>
          <button
            type="button"
            onClick={next}
            disabled={finishing}
            aria-label={current === items.length - 1 ? "Wrap up" : "Next drill"}
            className="press flex h-8 w-8 items-center justify-center rounded-full text-white disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </ArtHero>

      <Sheet className="[--bar-fade:var(--c-surface)]">
        {seconds <= 0 && item && !finishing ? (
          <p className="text-[12.5px] font-semibold text-warn">Time. Log it and move on.</p>
        ) : null}
        {/* Every block stays mounted, so balls logged but not yet saved survive
            a look at another block. */}
        {items.map((block, index) => (
          <div key={block.id} hidden={index !== current} className="flex flex-col gap-[18px]">
            {tracker(block, index, false)}
          </div>
        ))}
        {finishing ? (
          <FinishStep
            session={session}
            canFinish={canFinish}
            minutes={totalMinutes || session.planned_duration}
            attempts={attempts.reduce((sum, attempt) => sum + attempt.attempts, 0)}
            blocks={items.filter(logged).length}
            footer={footer}
          />
        ) : null}
      </Sheet>
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
  onNext,
  nextLabel,
}: {
  item: PracticeItem;
  drill: Drill;
  attempt: DrillAttempt | null;
  trend: PracticeMetricTrend | null;
  readOnly: boolean;
  onDirty: (id: string, value: boolean) => void;
  onNext?: () => void;
  nextLabel: string;
}) {
  const [state, formAction, pending] = useActionState(recordAttemptAction, IDLE);
  const goal = practiceGoal(drill.id);
  const tolerance = goal ? (item.tolerance ?? goal.tolerance) : null;
  const plotted = goal !== undefined && tolerance !== null;
  const putting = goal?.id === "putting_conversion";
  const capped = plotted || putting;
  const unit = goal?.unit === "feet" ? "feet" : "yards";

  const [points, setPoints] = useState<Point[]>(() => attempt?.shot_points ?? []);
  // Tapped drills: the sequence of ins and misses, in order. Results saved as
  // counts come back as the ins first, which is all a count can say.
  const [taps, setTaps] = useState<boolean[]>(() =>
    attempt && !plotted ? Array.from({ length: attempt.attempts }, (_, index) => index < attempt.successes) : [],
  );

  // Same rounding as the server, so a ball on the line scores the same on both.
  const offsets = plotted ? points.map((point) => Math.abs(offsetFor(goal, point))) : [];
  // Results saved before plotting existed have counts but no points.
  const legacy = plotted && attempt !== null && !attempt.shot_points?.length && points.length === 0;
  const attempts = legacy ? attempt.attempts : plotted ? points.length : taps.length;
  const results = plotted ? offsets.map((value) => value <= tolerance) : taps;
  const successes = legacy ? attempt.successes : results.filter(Boolean).length;
  const full = capped && attempts >= item.target_reps;
  const ready = capped ? attempts === item.target_reps : attempts > 0;

  const hasChanges =
    !attempt ||
    attempts !== attempt.attempts ||
    successes !== attempt.successes ||
    (plotted && JSON.stringify(points) !== JSON.stringify(attempt.shot_points ?? []));
  // Unsaved work holds the session open; a block nobody has touched does not.
  const touched = attempts > 0;
  const unsaved = (attempt ? hasChanges : touched) || pending;
  useEffect(() => {
    onDirty(item.id, unsaved);
  }, [item.id, unsaved, onDirty]);

  const needed = Math.ceil(item.target_value * item.target_reps);
  const met = successes >= needed && attempts > 0;
  const history = trend?.points ?? [];
  const best = history.length ? Math.max(...history.map((point) => point.value)) : null;
  const last = history.length > (attempt ? 1 : 0) ? (history[history.length - (attempt ? 2 : 1)]?.value ?? null) : null;
  const disabled = readOnly || pending;
  const inLabel = putting ? "Made" : "Good";
  const title = plotted
    ? `Inside ${tolerance} ${unit}`
    : putting
      ? "Putts holed"
      : drill.metric_to_track;

  return (
    <form action={formAction} className="flex flex-col gap-[18px]">
      <input type="hidden" name="session_id" value={item.session_id} />
      <input type="hidden" name="practice_item_id" value={item.id} />
      <input type="hidden" name="drill_id" value={drill.id} />
      <input type="hidden" name="attempts" value={attempts} />
      <input type="hidden" name="successes" value={successes} />
      {plotted ? <input type="hidden" name="shot_points" value={JSON.stringify(points)} /> : null}

      <TrackerHead
        title={title}
        met={met}
        metLabel={`Goal met · ${successes} ${putting ? "made" : "in"}`}
        sub={
          needed - successes > 0
            ? `${needed - successes} more ${putting ? "made" : plotted ? "in the zone" : "good"} to hit the goal`
            : `Goal: ${needed} of ${item.target_reps}`
        }
        count={`${successes}/${attempts}`}
      />

      {goal ? null : (
        <details className="text-[13px] text-fg-muted">
          <summary className="cursor-pointer font-semibold text-fg">How to run it</summary>
          <p className="mt-2">{drill.description}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {drill.instructions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </details>
      )}

      {plotted ? (
        <>
          <BallStrip results={results} total={item.target_reps} labels={["In", "Miss"]} />
          <TargetPlot
            goal={goal}
            tolerance={tolerance}
            points={points}
            onChange={setPoints}
            balls={item.target_reps}
            disabled={disabled}
          />
        </>
      ) : (
        <>
          <BallStrip
            results={taps}
            total={capped ? item.target_reps : Math.max(item.target_reps, taps.length + 1)}
            labels={putting ? ["Made", "Miss"] : ["Good", "Miss"]}
          />
          <StripFooter
            note={
              best !== null
                ? `Your best ${percent(best)}${last !== null ? ` · last ${percent(last)}` : ""}`
                : `Target ${percent(item.target_value)}`
            }
            onUndo={readOnly ? undefined : () => setTaps((now) => now.slice(0, -1))}
            canUndo={!disabled && taps.length > 0}
          />
        </>
      )}

      {plotted && best !== null ? (
        <p className="text-[13px] text-fg-subtle">
          Your best {percent(best)}
          {last !== null ? ` · last ${percent(last)}` : ""}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-3">
          {ready && hasChanges && !full ? (
            <Button type="submit" variant="secondary" size="sm" disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {attempt ? "Update result" : "Save result"}
            </Button>
          ) : null}
          {state.message ? (
            <span role="status" className={cn("text-[12.5px]", state.ok ? "text-good" : "text-bad")}>
              {state.message}
            </span>
          ) : attempt && !hasChanges ? (
            <span className="flex items-center gap-1 text-[12.5px] text-good">
              <CheckCircle2 className="h-3.5 w-3.5" /> Recorded · {successes}/{attempts}
            </span>
          ) : capped && !ready ? (
            <span className="text-[12.5px] text-fg-subtle">
              {item.target_reps - attempts} ball{item.target_reps - attempts === 1 ? "" : "s"} to go
            </span>
          ) : null}
        </div>
      ) : null}

      {!readOnly ? (
        <ActionBar className="[--bar-fade:var(--c-surface)]">
          {!full && !plotted ? (
            <>
              <Button
                type="button"
                variant="secondary"
                className={cn(barButton, "bg-surface")}
                disabled={disabled}
                onClick={() => setTaps((now) => [...now, false])}
              >
                Miss
              </Button>
              <Button
                type="button"
                className={barButton}
                disabled={disabled}
                onClick={() => setTaps((now) => [...now, true])}
              >
                {inLabel}
              </Button>
            </>
          ) : ready && hasChanges ? (
            <Button type="submit" className={barButton} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {attempt ? "Update result" : "Save result"}
            </Button>
          ) : attempt && onNext ? (
            <Button type="button" className={barButton} onClick={onNext}>
              {nextLabel}
            </Button>
          ) : null}
        </ActionBar>
      ) : null}
    </form>
  );
}

function FinishStep({
  session,
  canFinish,
  minutes,
  attempts,
  blocks,
  footer,
}: {
  session: PracticeSession;
  canFinish: boolean;
  minutes: number;
  attempts: number;
  blocks: number;
  footer?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(completeSessionAction, IDLE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="session_id" value={session.id} />
      <dl aria-label="Session totals" className="grid grid-cols-3 gap-2 rounded-[28px] bg-ink px-3 py-5 text-white">
        <StatCircle value={minutes} label="Minutes" tone="accent" size={64} />
        <StatCircle value={attempts} label="Attempts" tone="white" size={64} />
        <StatCircle value={blocks} label="Blocks" tone="white" size={64} />
      </dl>
      <label className="flex flex-col gap-2">
        <GroupLabel>Minutes practised</GroupLabel>
        <Input key={minutes} name="actual_duration" type="number" min={1} max={300} defaultValue={minutes} />
      </label>
      <label className="flex flex-col gap-2">
        <GroupLabel>Reflection</GroupLabel>
        <Textarea
          name="reflection"
          maxLength={1000}
          rows={3}
          placeholder="What clicked? What felt off?"
          className="min-h-[84px]"
        />
      </label>
      {state.message && !state.ok ? (
        <p role="alert" className="rounded-2xl bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">
          {state.message}
        </p>
      ) : null}
      {!canFinish ? (
        <p className="text-[12.5px] text-fg-subtle">
          Save the test block&apos;s result (and any unsaved edits) before finishing.
        </p>
      ) : null}
      {footer}
      <ActionBar className="[--bar-fade:var(--c-surface)]">
        <Button type="submit" className={barButton} disabled={pending || !canFinish}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Finish practice
        </Button>
      </ActionBar>
    </form>
  );
}

