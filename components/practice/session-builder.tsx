"use client";

import { useActionState, useState } from "react";
import { Loader2, Play } from "lucide-react";

import { createPracticeSessionAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import type { Drill } from "@/types/practice";
import type { SuggestedSession } from "@/lib/practice/session";
import { PRACTICE_BLOCK_LABELS } from "@/types/practice";
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
} from "@/components/ui/primitives";
import { DrillLibrary } from "./drill-library";

/**
 * Builds a practice session, pre-filled from the suggested session so starting
 * today's work is one click.
 */
export function SessionBuilder({
  drills,
  suggested,
  defaultDuration,
}: {
  drills: Drill[];
  suggested: SuggestedSession | null;
  defaultDuration: number;
}) {
  const [state, formAction, pending] = useActionState(createPracticeSessionAction, IDLE);
  const [selected, setSelected] = useState<string[]>(suggested?.drills.map((d) => d.id) ?? []);
  const [open, setOpen] = useState(!suggested);
  const errors = state.errors ?? {};
  const today = new Date().toISOString().slice(0, 10);

  const totalMinutes = selected.reduce((sum, id) => {
    const drill = drills.find((d) => d.id === id);
    return sum + (drill?.recommended_duration ?? 0);
  }, 0);

  function toggle(drillId: string) {
    setSelected((current) =>
      current.includes(drillId) ? current.filter((id) => id !== drillId) : [...current, drillId],
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {selected.map((id) => (
        <input key={id} type="hidden" name="drill_ids" value={id} />
      ))}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>{suggested ? "Today's session" : "New session"}</CardTitle>
            {suggested ? (
              <p className="mt-0.5 text-xs text-fg-muted">{suggested.objective}</p>
            ) : null}
          </div>
          {suggested ? (
            <Badge tone="accent">{PRACTICE_BLOCK_LABELS[suggested.block]}</Badge>
          ) : null}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Session title" error={errors.title}>
            <Input
              name="title"
              required
              maxLength={90}
              defaultValue={suggested?.title ?? ""}
              placeholder="Mid-iron contact"
            />
          </Field>
          <Field label="Focus" error={errors.focus}>
            <Input
              name="focus"
              required
              maxLength={60}
              defaultValue={suggested ? PRACTICE_BLOCK_LABELS[suggested.block] : ""}
              placeholder="Contact"
            />
          </Field>
          <Field label="Date" error={errors.scheduled_for}>
            <Input name="scheduled_for" type="date" required defaultValue={today} />
          </Field>
          <Field label="Planned minutes" error={errors.planned_duration}>
            <Input
              name="planned_duration"
              type="number"
              min={10}
              max={240}
              step={5}
              required
              defaultValue={suggested?.duration || defaultDuration}
            />
          </Field>
          <Field label="Location" error={errors.location}>
            <Input name="location" maxLength={90} placeholder="Range" />
          </Field>
          <Field label="Energy level" hint="1 flat, 5 fresh">
            <Select name="energy_level" defaultValue="3">
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Drills</CardTitle>
            <p className="mt-0.5 text-xs text-fg-muted">
              {selected.length} selected &middot; {totalMinutes} minutes of work
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide library" : "Change drills"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {selected.length > 0 ? (
            <ol className="space-y-2">
              {selected.map((id, index) => {
                const drill = drills.find((d) => d.id === id);
                if (!drill) return null;
                return (
                  <li
                    key={id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {index + 1}. {drill.name}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {drill.metric_to_track} &middot; target{" "}
                        {Math.round(drill.success_threshold * 100)}%
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggle(id)}
                      aria-label={`Remove ${drill.name}`}
                    >
                      Remove
                    </Button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-fg-muted">Pick at least one drill to start the session.</p>
          )}

          {errors.drill_ids ? <p className="text-xs text-bad">{errors.drill_ids}</p> : null}

          {open ? (
            <div className="border-t border-border pt-4">
              <DrillLibrary drills={drills} selectable selected={selected} onToggle={toggle} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {state.message ? (
        <p
          role="status"
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            state.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad",
          )}
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending || selected.length === 0}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Start session
      </Button>
    </form>
  );
}
