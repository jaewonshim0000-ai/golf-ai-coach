"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { createCourseAction, createRoundAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import type { Course } from "@/types/rounds";
import { CONDITIONS, labelize } from "@/types/golf";
import { cn } from "@/lib/utils";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5];
const DEFAULT_YARDS = [400, 370, 165, 510, 425, 390, 150, 530, 415, 395, 185, 440, 505, 360, 420, 165, 385, 525];

export function NewRoundForm({ courses }: { courses: Course[] }) {
  const [state, formAction, pending] = useActionState(createRoundAction, IDLE);
  const [adding, setAdding] = useState(courses.length === 0);
  const errors = state.errors ?? {};
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {!adding ? (
        <form action={formAction} className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <CardTitle>Round details</CardTitle>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)}>
                <Plus className="h-3.5 w-3.5" /> New course
              </Button>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Course" error={errors.course_id}>
                <Select name="course_id" required defaultValue={courses[0]?.id}>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.name}
                      {course.city ? ` · ${course.city}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" error={errors.played_on}>
                <Input name="played_on" type="date" required defaultValue={today} />
              </Field>
              <Field label="Tees" error={errors.tees}>
                <Input name="tees" placeholder="White" maxLength={40} />
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-2 text-xs font-medium text-fg-muted">Conditions</p>
                <div className="flex flex-wrap gap-2">
                  {CONDITIONS.map((condition) => (
                    <ConditionChip key={condition} value={condition} />
                  ))}
                </div>
              </div>
              <Field label="Notes" className="sm:col-span-2" error={errors.notes}>
                <Textarea name="notes" rows={2} maxLength={1000} placeholder="Anything worth remembering" />
              </Field>
            </CardContent>
          </Card>

          {state.message ? (
            <p
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                state.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad",
              )}
            >
              {state.message}
            </p>
          ) : null}

          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Start recording shots
          </Button>
        </form>
      ) : (
        <AddCourseForm onDone={() => setAdding(false)} canCancel={courses.length > 0} />
      )}
    </div>
  );
}

function ConditionChip({ value }: { value: string }) {
  const [checked, setChecked] = useState(false);
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        name="conditions"
        value={value}
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="peer sr-only"
      />
      <Badge tone={checked ? "accent" : "neutral"} className="px-3 py-1 text-xs">
        {labelize(value)}
      </Badge>
    </label>
  );
}

function AddCourseForm({ onDone, canCancel }: { onDone: () => void; canCancel: boolean }) {
  const [state, formAction, pending] = useActionState(createCourseAction, IDLE);
  const errors = state.errors ?? {};

  // The action revalidates the course list; drop back to the round form so the
  // new course can be picked.
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add a course</CardTitle>
          <p className="mt-0.5 text-xs text-fg-muted">
            Par and yardage per hole. Defaults are a typical par 72 you can edit.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Course name" error={errors.name}>
              <Input name="name" required minLength={2} maxLength={120} placeholder="Riverbend Golf Club" />
            </Field>
            <Field label="City" error={errors.city}>
              <Input name="city" maxLength={80} placeholder="Portland, OR" />
            </Field>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-fg-subtle">
                  <th className="pb-2">Hole</th>
                  {DEFAULT_PARS.map((_, index) => (
                    <th key={index} className="pb-2 text-center font-medium">
                      {index + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th className="py-1 text-left text-xs font-medium text-fg-muted">Par</th>
                  {DEFAULT_PARS.map((par, index) => (
                    <td key={index} className="px-0.5 py-1">
                      <Input
                        name="par"
                        type="number"
                        min={3}
                        max={6}
                        defaultValue={par}
                        className="tabular h-8 px-1 text-center text-xs"
                        aria-label={`Par for hole ${index + 1}`}
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="py-1 text-left text-xs font-medium text-fg-muted">Yards</th>
                  {DEFAULT_YARDS.map((yards, index) => (
                    <td key={index} className="px-0.5 py-1">
                      <Input
                        name="yards"
                        type="number"
                        min={60}
                        max={700}
                        defaultValue={yards}
                        className="tabular h-8 px-1 text-center text-xs"
                        aria-label={`Yards for hole ${index + 1}`}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {state.message ? (
            <p
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                state.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad",
              )}
            >
              {state.message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save course
        </Button>
        {canCancel ? (
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
