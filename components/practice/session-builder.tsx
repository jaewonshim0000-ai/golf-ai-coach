"use client";

import { useActionState, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { createPracticeSessionAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { QUICK_DRILLS } from "@/lib/practice/goals";
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select } from "@/components/ui/primitives";

export function SessionBuilder({ initialDrillId }: { initialDrillId?: string }) {
  const [state, formAction, pending] = useActionState(createPracticeSessionAction, IDLE);
  const [selected, setSelected] = useState(QUICK_DRILLS.find((d) => d.id === initialDrillId)?.id ?? QUICK_DRILLS[1]!.id);
  const drill = QUICK_DRILLS.find((d) => d.id === selected)!;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="title" value={drill.name} />
      <input type="hidden" name="focus" value={drill.skill_trained} />
      <input type="hidden" name="planned_duration" value="10" />
      <input type="hidden" name="scheduled_for" value={today} />
      <Card>
        <CardHeader><CardTitle>One goal. Ten balls.</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Field label="Practice goal">
            <Select name="drill_ids" value={selected} onChange={(event) => setSelected(event.target.value)}>
              {QUICK_DRILLS.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}
            </Select>
          </Field>
          <p className="text-sm text-fg-muted">{drill.description}</p>
          <p className="font-semibold text-accent">Goal: 7 of 10 · about 10 minutes</p>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-fg-muted">
            {drill.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}
          </ol>
          <Field label="Location (optional)"><Input name="location" maxLength={90} placeholder="Range or practice green" /></Field>
        </CardContent>
      </Card>
      {state.message ? <p role="alert" className="text-sm text-bad">{state.message}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Start practice
      </Button>
    </form>
  );
}
