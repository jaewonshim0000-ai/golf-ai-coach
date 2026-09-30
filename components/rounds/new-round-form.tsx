"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { createRoundAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { ROUND_TYPES, labelize } from "@/types/golf";
import { cn } from "@/lib/utils";
import { Button, Card, CardContent, Eyebrow, Field, Input } from "@/components/ui/primitives";

export function NewRoundForm({ courseNames }: { courseNames: string[] }) {
  const [state, formAction, pending] = useActionState(createRoundAction, IDLE);
  const errors = state.errors ?? {};
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-5">
          <Field label="Course name" error={errors.course_name}>
            <Input
              name="course_name"
              required
              minLength={2}
              maxLength={120}
              list="course-names"
              autoComplete="off"
              placeholder="Riverbend Golf Club"
            />
          </Field>
          <datalist id="course-names">
            {courseNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <Field label="Date" error={errors.played_on}>
            <Input name="played_on" type="date" required defaultValue={today} />
          </Field>

          <fieldset>
            <legend className="mb-1.5"><Eyebrow className="tracking-[0.15em]">Type of round</Eyebrow></legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ROUND_TYPES.map((type) => (
                <label key={type} className="cursor-pointer">
                  <input
                    type="radio"
                    name="round_type"
                    value={type}
                    defaultChecked={type === "casual"}
                    className="peer sr-only"
                  />
                  <span
                    className={cn(
                      "block rounded-xl border border-border-strong bg-surface-2 px-3 py-2.5 text-center text-sm font-medium transition-colors",
                      "peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-fg peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                    )}
                  >
                    {labelize(type)}
                  </span>
                </label>
              ))}
            </div>
            {errors.round_type ? <p className="mt-1 text-xs text-bad">{errors.round_type}</p> : null}
          </fieldset>
        </CardContent>
      </Card>

      {state.message && !state.ok ? (
        <p className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.message}</p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Continue
      </Button>
    </form>
  );
}
