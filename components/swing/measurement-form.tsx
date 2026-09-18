"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";

import { saveMeasurementAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { PHASE_LABELS, SWING_METRICS, METRICS_BY_ID } from "@/lib/golf/swing-metrics";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui/primitives";

/**
 * Manual entry for one measurement. The confidence field is not decoration:
 * a number read off a phone video is not the same as one from a launch
 * monitor, and the diagnostic carries that through rather than flattening it.
 */
export function MeasurementForm({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(saveMeasurementAction, IDLE);
  const [metricId, setMetricId] = useState(SWING_METRICS[0]!.id);
  const metric = METRICS_BY_ID.get(metricId) ?? SWING_METRICS[0]!;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a measurement</CardTitle>
        <p className="mt-1 text-[11px] text-fg-muted">
          Reference band {metric.min} to {metric.max} {metric.unit === "deg" ? "degrees" : "inches"}.
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3.5">
          <input type="hidden" name="swing_session_id" value={sessionId} />

          <Field label="Measurement">
            <Select name="metric" value={metricId} onChange={(e) => setMetricId(e.target.value)}>
              {SWING_METRICS.map((option) => (
                <option key={option.id} value={option.id}>
                  {PHASE_LABELS[option.phase]} · {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={metric.unit === "deg" ? "Degrees" : "Inches"}>
              <Input
                name="value"
                type="number"
                inputMode="decimal"
                step="0.1"
                required
                placeholder={String(metric.min)}
              />
            </Field>
            <Field label="How sure" hint="Eyeballed or measured">
              <Select name="confidence" defaultValue="0.6">
                <option value="0.35">Rough estimate</option>
                <option value="0.6">Read off video</option>
                <option value="0.9">Measured</option>
              </Select>
            </Field>
          </div>

          {state.message ? (
            <p className={state.ok ? "text-[12px] text-good" : "text-[12px] text-bad"}>
              {state.message}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
