"use client";

import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { recordAttemptAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { PRACTICE_GOALS } from "@/lib/practice/goals";
import { dispersionDiameter, measuredTest, plottedTest, scoreTest, spiralProgress, testResultLabel, type PracticeTest } from "@/lib/practice/tests";
import type { DrillAttempt, PracticeItem } from "@/types/practice";
import { cn } from "@/lib/utils";
import { TargetPlot } from "./target-plot";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Textarea } from "@/components/ui/primitives";

export function TestTracker({ test, item, attempt, history, readOnly, onDirty }: {
  test: PracticeTest; item: PracticeItem; attempt: DrillAttempt | null; history: DrillAttempt[]; readOnly: boolean;
  onDirty: (id: string, dirty: boolean) => void;
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
  const label = test.kind === "fairway" ? ["Fairway", "Missed"] : test.kind === "up_down" ? ["2 strokes or fewer", "More than 2"] : test.kind === "gate" ? ["Through gate", "Touched / missed gate"] : ["Made", "Missed"];
  const full = spiral ? progress.complete || samples.length >= 500 : samples.length >= 10;
  const disabled = readOnly || pending;
  const previous = history.filter((entry) => entry.id !== attempt?.id).sort((a, b) => a.completed_at.localeCompare(b.completed_at)).at(-1);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div><CardTitle>{test.name}</CardTitle><p className="mt-1 text-xs text-fg-muted">{item.objective}</p></div>
        <Badge tone="accent">Test</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <details className="text-xs text-fg-muted">
          <summary className="min-h-9 cursor-pointer py-2 font-medium text-accent">How to run it</summary>
          <ol className="list-decimal space-y-2 pl-5 leading-relaxed">{test.instructions.map((line, i) => <li key={i}>{line}</li>)}</ol>
        </details>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="session_id" value={item.session_id} />
          <input type="hidden" name="practice_item_id" value={item.id} />
          <input type="hidden" name="drill_id" value={test.id} />
          <input type="hidden" name="attempts" value={result?.attempts ?? Math.max(1, count)} />
          <input type="hidden" name="successes" value={result?.successes ?? 0} />
          {plot ? <input type="hidden" name="shot_points" value={JSON.stringify(points)} /> : <input type="hidden" name="shot_offsets" value={JSON.stringify(submittedSamples)} />}
          {plot ? (
            <>
              {test.kind === "landing" ? <p className="text-xs text-fg-muted">Mark the first landing relative to the spot selected for that ball. Ignore the rollout.</p> : null}
              {test.kind === "dispersion" ? <p className="text-xs text-fg-muted">Plot both sideways and short/long misses in yards. Use Type for finishes outside the plot.</p> : null}
              <TargetPlot goal={goal} tolerance={tolerance} points={points} onChange={setPoints} balls={10} disabled={disabled} measurement={test.kind === "dispersion"} landing={test.kind === "landing"} />
              {test.kind === "dispersion" && points.length > 0 ? <p className="tabular text-sm font-medium" aria-live="polite">Dispersion diameter: {dispersionDiameter(points).toFixed(1)} yd ({points.length}/10 balls)</p> : null}
            </>
          ) : test.kind === "carry" ? (
            <div className="grid grid-cols-2 gap-3">
              {carries.map((value, index) => (
                <Field key={index} label={`Ball ${index + 1} carry (yd)`}>
                  <Input type="number" inputMode="decimal" min="0" max="600" step="0.1" value={value} aria-label={`Ball ${index + 1} carry in yards`} disabled={disabled}
                    onChange={(event) => setCarries((now) => now.map((carry, i) => i === index ? event.target.value : carry))} />
                </Field>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {spiral ? (
                <div className="rounded-xl bg-accent-soft p-4 text-sm" aria-live="polite">
                  <p className="font-semibold">{progress.complete ? "All four made in order" : `Next putt: ${progress.nextDistance} ft`}</p>
                  <p className="mt-1 text-fg-muted">Current sequence {progress.streak}/4 · {samples.length} putts · {progress.restarts} restart{progress.restarts === 1 ? "" : "s"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">{[3, 5, 7, 9].map((distance, i) => <Badge key={distance} tone={i < progress.streak ? "good" : "neutral"}>{distance} ft</Badge>)}</div>
                </div>
              ) : <p className="tabular text-sm font-medium" aria-live="polite">{samples.length === 10 ? "All 10 attempts logged" : `Attempt ${samples.length + 1} of 10`} · {samples.filter((v) => v === 1).length} successful</p>}
              {!readOnly ? <div className="grid grid-cols-2 gap-2">
                <Button type="button" disabled={disabled || full} onClick={() => setSamples([...samples, 1])}>{label[0]}</Button>
                <Button type="button" variant="secondary" disabled={disabled || full} onClick={() => setSamples([...samples, 0])}>{label[1]}</Button>
              </div> : null}
              {!spiral ? <div className="flex flex-wrap gap-2" aria-label="Attempt results">{samples.map((value, i) => <span key={i} className={cn("flex h-7 w-7 items-center justify-center rounded-full text-xs", value ? "bg-good-soft text-good" : "bg-bad-soft text-bad")}>{i + 1}</span>)}</div> : null}
              {!readOnly ? <Button type="button" size="sm" variant="ghost" disabled={disabled || !samples.length} onClick={() => setSamples(samples.slice(0, -1))}><Undo2 className="h-3.5 w-3.5" /> Undo last attempt</Button> : null}
              {spiral && samples.length >= 500 && !progress.complete ? <p className="text-xs text-fg-muted">Save this run as incomplete, then start another test to continue.</p> : null}
            </div>
          )}
          {result ? <p className="rounded-xl bg-surface-2 p-3 text-sm font-semibold" aria-live="polite">{testResultLabel(test, result)}</p> : null}
          {spiral && result && !progress.complete ? <p className="text-xs text-fg-muted">Keep going until all four are made, or save an incomplete run if you stop.</p> : null}
          {!readOnly ? <>
            <Field label="Notes (optional)"><Textarea name="notes" value={notes} maxLength={500} onChange={(event) => setNotes(event.target.value)} disabled={pending} /></Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" disabled={pending || !ready || !result}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{attempt ? "Update result" : spiral && !progress.complete ? "Save incomplete run" : "Save result"}</Button>
              {state.message ? <span role="status" className={cn("text-xs", state.ok ? "text-good" : "text-bad")}>{state.message}</span> : attempt && !changed ? <span className="flex items-center gap-1 text-xs text-good"><CheckCircle2 className="h-3.5 w-3.5" /> Recorded</span> : !ready ? <span className="text-xs text-fg-subtle">{spiral ? "Record your first putt to begin." : "Record all ten attempts to save."}</span> : null}
            </div>
          </> : notes ? <p className="text-sm text-fg-muted">{notes}</p> : null}
        </form>
        {previous ? <p className="border-t border-border pt-3 text-xs text-fg-muted">Previous result: {testResultLabel(test, previous)}{measuredTest(test) ? ". Compare under similar conditions." : ". Use the same target band when comparing counts."}</p> : null}
      </CardContent>
    </Card>
  );
}
