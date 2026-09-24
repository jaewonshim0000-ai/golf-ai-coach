"use client";

import { useActionState, useState } from "react";
import { Loader2, Play } from "lucide-react";

import { createPracticeSessionAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { GOAL_SHORT, type GoalId } from "@/lib/practice/goals";
import { PLAN_LENGTHS, type PlanLength } from "@/lib/practice/plan";
import { PRACTICE_BLOCK_LABELS, type PracticeBlock } from "@/types/practice";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from "@/components/ui/primitives";

export type PlanPreview = {
  title: string;
  blocks: { block: PracticeBlock; duration: number; name: string; objective: string }[];
};

/** Goal and length in, the whole plan shown before it starts. */
export function SessionBuilder({
  goals,
  recommended,
  initialGoal,
  previews,
  bands,
}: {
  goals: GoalId[];
  recommended: GoalId;
  initialGoal: GoalId;
  /** Keyed `${minutes}:${goal}`, built on the server. */
  previews: Record<string, PlanPreview>;
  /** Today's band per goal, earned from the last test. */
  bands: Partial<Record<GoalId, string>>;
}) {
  const [state, formAction, pending] = useActionState(createPracticeSessionAction, IDLE);
  const [goal, setGoal] = useState<GoalId>(initialGoal);
  const [minutes, setMinutes] = useState<PlanLength>(30);
  const preview = previews[`${minutes}:${goal}`];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="scheduled_for" value={today} />
      <Card>
        <CardHeader>
          <CardTitle>What are you working on?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <fieldset>
            <legend className="dsp mb-2 text-[9px] tracking-[0.15em] text-fg-subtle">Goal</legend>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {goals.map((id) => (
                <label key={id} className="relative">
                  <input
                    type="radio"
                    name="goal"
                    value={id}
                    checked={goal === id}
                    onChange={() => setGoal(id)}
                    className="peer sr-only"
                  />
                  <span className="flex h-full cursor-pointer flex-col rounded-xl border border-border-strong bg-surface-2 px-3 py-2.5 text-[13px] font-medium transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                    {GOAL_SHORT[id]}
                    <span className="mt-0.5 text-[10.5px] font-normal text-fg-subtle">
                      {id === recommended ? "Costing you most" : bands[id] ?? "Made putts"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="dsp mb-2 text-[9px] tracking-[0.15em] text-fg-subtle">Time</legend>
            <div className="grid grid-cols-3 gap-1.5">
              {PLAN_LENGTHS.map((length) => (
                <label key={length}>
                  <input
                    type="radio"
                    name="minutes"
                    value={length}
                    checked={minutes === length}
                    onChange={() => setMinutes(length)}
                    className="peer sr-only"
                  />
                  <span className="block cursor-pointer rounded-xl border border-border-strong bg-surface-2 py-2.5 text-center text-[13px] font-medium transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:ring-2 peer-focus-visible:ring-accent">
                    {length} min
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3">
            <CardTitle>{preview.title.replace(/^./, (c) => c.toUpperCase())}</CardTitle>
            <Badge tone="neutral">{preview.blocks.length} blocks</Badge>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2.5">
              {preview.blocks.map((block, index) => (
                <li key={index} className="flex gap-3">
                  <span
                    className={cn(
                      "tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                      block.block === "skill" ? "bg-accent text-white" : "bg-surface-2 text-fg-muted",
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">
                      {PRACTICE_BLOCK_LABELS[block.block]}
                      {block.block === "skill" ? " · test" : ""}
                      <span className="tabular font-normal text-fg-subtle"> · {block.duration} min</span>
                    </span>
                    <span className="block text-[12px] text-fg-muted">
                      {block.name} — {block.objective}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <Field label="Location (optional)">
        <Input name="location" maxLength={90} placeholder="Range or practice green" />
      </Field>
      {state.message ? (
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Start {minutes}-minute plan
      </Button>
    </form>
  );
}
