"use client";

import { useActionState, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { createTestSessionAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { testObjective, type PracticeTest } from "@/lib/practice/tests";
import { Button, Card, CardContent, Field, Input } from "@/components/ui/primitives";

export function TestSetup({ test }: { test: PracticeTest }) {
  const [state, formAction, pending] = useActionState(createTestSessionAction, IDLE);
  const [tolerance, setTolerance] = useState(String(test.defaultTolerance ?? ""));
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-fg-muted">
          {test.instructions.map((line, index) => <li key={index}>{line}</li>)}
        </ol>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="drill_id" value={test.id} />
          <input type="hidden" name="scheduled_for" value={date} />
          {test.defaultTolerance !== undefined ? (
            <Field label={test.kind === "line" ? "Allowed miss either side of target line (yd)" : test.kind === "landing" ? "Allowed landing radius (ft)" : "Allowed finishing radius (ft)"} error={state.errors?.tolerance}>
              <Input name="tolerance" type="number" inputMode="decimal" min="0.1" max="300" step="0.1" value={tolerance} onChange={(event) => setTolerance(event.target.value)} required />
              <p className="text-xs text-fg-subtle">Choose your X before starting. This band stays with the saved result.</p>
            </Field>
          ) : null}
          <p className="rounded-xl bg-accent-soft p-3 text-sm text-fg-muted">{testObjective(test, tolerance ? Number(tolerance) : null)}</p>
          <Field label="Location (optional)" error={state.errors?.location}><Input name="location" maxLength={90} placeholder="Range or practice green" /></Field>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start test
          </Button>
          {state.message ? <p role="status" className="text-sm text-bad">{state.message}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
