"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { recordAttemptAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { PRACTICE_GOALS } from "@/lib/practice/goals";
import { dispersionDiameter, measuredTest, plottedTest, scoreTest, spiralProgress, testResultLabel, type PracticeTest } from "@/lib/practice/tests";
import type { DrillAttempt, PracticeItem } from "@/types/practice";
import { cn } from "@/lib/utils";
import { TargetPlot } from "./target-plot";
import { BallStrip, StripFooter, TrackerHead } from "./tracker-parts";
import { ActionBar, Badge, Button, GroupLabel, Input, Textarea, barButton } from "@/components/ui/primitives";

/**
 * One of the thirty practice tests, logged as the design's practice-test
 * screen: what counts and the count, all ten attempts in a dark grid, a
 * legend and Undo, notes, and the two outcomes as big buttons at the bottom.
 * Plotted tests are tapped on the target instead; carry tests are typed.
 */
export function TestTracker({ test, item, attempt, history, readOnly, onDirty, onNext, nextLabel = "Next drill" }: {
  test: PracticeTest; item: PracticeItem; attempt: DrillAttempt | null; history: DrillAttempt[]; readOnly: boolean;
  onDirty: (id: string, dirty: boolean) => void;
  onNext?: () => void;
  nextLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(recordAttemptAction, IDLE);
  const [points, setPoints] = useState<[number, number][]>(attempt?.shot_points ?? []);
  const [samples, setSamples] = useState<number[]>(attempt?.shot_offsets ?? []);
  const [carries, setCarries] = useState<string[]>(() => Array.from({ length: 10 }, (_, i) => attempt?.shot_offsets?.[i]?.toString() ?? ""));
  const [notes, setNotes] = useState(attempt?.notes ?? "");
  const plot = plottedTest(test);
  const spiral = test.kind === "spiral";
  const progress = spiralProgress(samples);
  const tolerance = item.tolerance ?? test.defaultTolerance ?? 15;
  const numericCarries = carries.map((value) => Number(value));
  const carryReady = carries.every((value) => value.trim() !== "") && numericCarries.every((value) => Number.isFinite(value) && value >= 0 && value <= 600);
  const ready = plot ? points.length === 10 : test.kind === "carry" ? carryReady : spiral ? samples.length > 0 : samples.length === 10;
  const count = plot ? points.length : test.kind === "carry" ? carries.filter((value) => value.trim() !== "").length : samples.length;
  const submittedSamples = test.kind === "carry" ? numericCarries : samples;
  let result: ReturnType<typeof scoreTest> | null = null;
  if (ready) {
    try { result = scoreTest(test, item, points, submittedSamples); } catch { /* Invalid or incomplete samples cannot be saved. */ }
  }
  const changed = !attempt || JSON.stringify(points) !== JSON.stringify(attempt.shot_points ?? []) ||
    JSON.stringify(submittedSamples) !== JSON.stringify(attempt.shot_offsets ?? []) || notes !== (attempt.notes ?? "");
  const touched = count > 0 || notes.length > 0;
  const dirty = pending || (attempt ? changed : touched);
  useEffect(() => { onDirty(item.id, dirty); }, [item.id, dirty, onDirty]);
  const goal = PRACTICE_GOALS.find((goal) => goal.id === (test.group === "range" ? "iron_accuracy" : "chip_accuracy"))!;
  const label: [string, string] = test.kind === "fairway" ? ["Fairway", "Missed"] : test.kind === "up_down" ? ["Up and down", "More than 2"] : test.kind === "gate" ? ["Through", "Touched gate"] : ["Made", "Missed"];
  const heading = test.kind === "fairway" ? "Fairways hit" : test.kind === "up_down" ? "Up and down in 2" : test.kind === "gate" ? "Through the gate" : "Putts made";
  const full = spiral ? progress.complete || samples.length >= 500 : samples.length >= 10;
  const disabled = readOnly || pending;
  const previous = history.filter((entry) => entry.id !== attempt?.id).sort((a, b) => a.completed_at.localeCompare(b.completed_at)).at(-1);
  const made = samples.filter((value) => value === 1).length;
  const tapped = !plot && test.kind !== "carry";

  const saveButton = (
    <Button type="submit" className={barButton} disabled={pending || !ready || !result}>
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {attempt ? "Update result" : spiral && !progress.complete ? "Save incomplete run" : "Save result"}
    </Button>
  );

  return (
    <form action={formAction} className="flex flex-col gap-[18px]">
      <input type="hidden" name="session_id" value={item.session_id} />
      <input type="hidden" name="practice_item_id" value={item.id} />
      <input type="hidden" name="drill_id" value={test.id} />
      <input type="hidden" name="attempts" value={result?.attempts ?? Math.max(1, count)} />
      <input type="hidden" name="successes" value={result?.successes ?? 0} />
      {plot ? <input type="hidden" name="shot_points" value={JSON.stringify(points)} /> : <input type="hidden" name="shot_offsets" value={JSON.stringify(submittedSamples)} />}

      {tapped && !spiral ? (
        <TrackerHead
          title={heading}
          met={false}
          metLabel=""
          sub={`${samples.length >= 10 ? "All 10 logged" : `Attempt ${samples.length + 1} of 10`} · ${test.scoring}`}
          count={`${made}/${samples.length}`}
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          <h2 className="dsp text-[24px] leading-none">{spiral ? "Spiral: 3, 5, 7, 9 ft" : test.kind === "carry" ? "Ten carries" : test.kind === "dispersion" ? "Dispersion" : `Inside ${tolerance} ${test.kind === "line" ? "yd" : "ft"}`}</h2>
          <p className="text-[13px] text-fg-subtle">{item.objective}</p>
        </div>
      )}

      <details className="text-[13px] text-fg-muted">
        <summary className="cursor-pointer font-semibold text-fg">How to run it</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed">{test.instructions.map((line, i) => <li key={i}>{line}</li>)}</ol>
      </details>

      {plot ? (
        <>
          {test.kind === "landing" ? <p className="text-[13px] text-fg-muted">Mark the first landing relative to the spot selected for that ball. Ignore the rollout.</p> : null}
          {test.kind === "dispersion" ? <p className="text-[13px] text-fg-muted">Plot both sideways and short/long misses in yards. Use Type for finishes outside the plot.</p> : null}
          <TargetPlot goal={goal} tolerance={tolerance} points={points} onChange={setPoints} balls={10} disabled={disabled} measurement={test.kind === "dispersion"} landing={test.kind === "landing"} />
          {test.kind === "dispersion" && points.length > 0 ? <p className="tabular text-[14px] font-semibold" aria-live="polite">Dispersion diameter: {dispersionDiameter(points).toFixed(1)} yd ({points.length}/10 balls)</p> : null}
        </>
      ) : test.kind === "carry" ? (
        <div className="grid grid-cols-2 gap-3">
          {carries.map((value, index) => (
            <label key={index} className="flex flex-col gap-1.5">
              <GroupLabel className="text-[11px]">Ball {index + 1} (yd)</GroupLabel>
              <Input type="number" inputMode="decimal" min="0" max="600" step="0.1" value={value} aria-label={`Ball ${index + 1} carry in yards`} disabled={disabled}
                onChange={(event) => setCarries((now) => now.map((carry, i) => i === index ? event.target.value : carry))} />
            </label>
          ))}
        </div>
      ) : spiral ? (
        <div className="flex flex-col gap-3 rounded-[22px] bg-ink p-4 text-white" aria-live="polite">
          <p className="dsp text-[20px] leading-none">{progress.complete ? "All four made in order" : `Next putt: ${progress.nextDistance} ft`}</p>
          <p className="text-[13px] text-[#c9ccbf]">Current sequence {progress.streak}/4 · {samples.length} putts · {progress.restarts} restart{progress.restarts === 1 ? "" : "s"}</p>
          <div className="grid grid-cols-4 gap-2">{[3, 5, 7, 9].map((distance, i) => (
            <span key={distance} className={cn("font-display flex aspect-square items-center justify-center rounded-full text-[18px]", i < progress.streak ? "bg-accent" : i === progress.streak && !progress.complete ? "step-now bg-white text-[#1e211b]" : "border-[1.5px] border-[#4a5042] text-[#a9ad9f]")}>{distance}</span>
          ))}</div>
        </div>
      ) : (
        <BallStrip results={samples.map((value) => value === 1)} total={10} layout="grid" />
      )}

      {tapped ? (
        <StripFooter
          note={spiral ? `${samples.length} putt${samples.length === 1 ? "" : "s"} logged` : (
            <span className="flex items-center gap-3 text-[13px] font-semibold text-fg">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-accent" />{label[0]}</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#3a3f33] ring-1 ring-[#e9a08e]" />{label[1]}</span>
            </span>
          )}
          onUndo={readOnly ? undefined : () => setSamples(samples.slice(0, -1))}
          canUndo={!disabled && samples.length > 0}
        />
      ) : null}

      {result ? <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[14px] font-semibold" aria-live="polite">{testResultLabel(test, result)}</p> : null}
      {spiral && result && !progress.complete ? <p className="text-[12.5px] text-fg-subtle">Keep going until all four are made, or save an incomplete run if you stop.</p> : null}
      {spiral && samples.length >= 500 && !progress.complete ? <p className="text-[12.5px] text-fg-subtle">Save this run as incomplete, then start another test to continue.</p> : null}

      {!readOnly ? (
        <label className="flex flex-col gap-2">
          <GroupLabel>Notes (optional)</GroupLabel>
          <Textarea name="notes" value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} disabled={pending} placeholder="Fast green, slight left-to-right" className="min-h-[50px] rounded-full py-3.5" rows={1} />
        </label>
      ) : notes ? <p className="text-[14px] text-fg-muted">{notes}</p> : null}

      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-3">
          {state.message ? <span role="status" className={cn("text-[12.5px]", state.ok ? "text-good" : "text-bad")}>{state.message}</span> : attempt && !changed ? <span className="flex items-center gap-1 text-[12.5px] text-good"><CheckCircle2 className="h-3.5 w-3.5" /> Recorded</span> : !ready ? <span className="text-[12.5px] text-fg-subtle">{spiral ? "Record your first putt to begin." : "Record all ten attempts to save."}</span> : null}
          {spiral && ready && changed ? <Button type="submit" size="sm" variant="secondary" disabled={pending || !result}>{attempt ? "Update result" : progress.complete ? "Save result" : "Save incomplete run"}</Button> : null}
        </div>
      ) : null}

      {previous ? <p className="text-[12.5px] text-fg-subtle">Previous result: {testResultLabel(test, previous)}{measuredTest(test) ? ". Compare under similar conditions." : ". Use the same target band when comparing counts."}</p> : null}
      {readOnly ? <Badge tone="accent" className="self-start">Test</Badge> : null}

      {!readOnly ? (
        <ActionBar className="[--bar-fade:var(--c-surface)]">
          {tapped && !full ? (
            <>
              <Button type="button" variant="secondary" className={cn(barButton, "bg-surface")} disabled={disabled} onClick={() => setSamples([...samples, 0])}>{label[1]}</Button>
              <Button type="button" className={barButton} disabled={disabled} onClick={() => setSamples([...samples, 1])}>{label[0]}</Button>
            </>
          ) : ready && changed ? saveButton : attempt && onNext ? (
            <Button type="button" className={barButton} onClick={onNext}>{nextLabel}</Button>
          ) : plot || test.kind === "carry" ? saveButton : null}
        </ActionBar>
      ) : null}
    </form>
  );
}
