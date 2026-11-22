"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";

import { createPracticeSessionAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { GOAL_SHORT, type GoalId } from "@/lib/practice/goals";
import { PLAN_LENGTHS, type PlanLength } from "@/lib/practice/plan";
import { PRACTICE_BLOCK_LABELS, type PracticeBlock } from "@/types/practice";
import { cn } from "@/lib/utils";
import { ActionBar, Badge, Button, GroupLabel, Input, barButton } from "@/components/ui/primitives";

export type PlanPreview = {
  title: string;
  blocks: { block: PracticeBlock; duration: number; name: string; objective: string; prioritized?: boolean }[];
};

/* Short names for the block bar, where a full label would not fit. */
const BLOCK_SHORT: Record<PracticeBlock, string> = {
  warm_up: "Warm-up",
  technical: "Technique",
  skill: "Test",
  variable: "Random",
  pressure: "Pressure",
  reflection: "Reflect",
};

/* The bar's colours run olive, ink, white, then round again. */
const BLOCK_FILL = ["bg-accent text-white", "bg-ink text-white", "bg-surface text-fg"];

/** Goal and length in, the whole plan shown before it starts. */
export function SessionBuilder({
  goals,
  recommended,
  priorityGoal,
  initialGoal,
  initialMinutes,
  previews,
  bands,
  priorityNames,
}: {
  goals: GoalId[];
  recommended: GoalId;
  /** The goal behind the player's #1 priority, if they have one. */
  priorityGoal: GoalId | null;
  initialGoal: GoalId;
  /** Where the length starts: the player's usual session, from their profile. */
  initialMinutes: PlanLength;
  /** Keyed `${minutes}:${goal}`, built on the server. */
  previews: Record<string, PlanPreview>;
  /** Today's band per goal, earned from the last test. */
  bands: Partial<Record<GoalId, string>>;
  priorityNames: string[];
}) {
  const [state, formAction, pending] = useActionState(createPracticeSessionAction, IDLE);
  const [goal, setGoal] = useState<GoalId>(initialGoal);
  const [minutes, setMinutes] = useState<PlanLength>(initialMinutes);
  const preview = previews[`${minutes}:${goal}`];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const total = preview?.blocks.reduce((sum, block) => sum + block.duration, 0) ?? minutes;

  // Your priority first, then the suggested focus, then the rest.
  const ordered = [...goals].sort(
    (a, b) =>
      Number(b === priorityGoal) - Number(a === priorityGoal) || Number(b === recommended) - Number(a === recommended),
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="scheduled_for" value={today} />

      <fieldset className="flex flex-col gap-2">
        <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">What are you working on?</legend>
        {ordered.map((id) => {
          const checked = goal === id;
          const eyebrow =
            id === priorityGoal ? "Your priority" : id === recommended ? "Suggested focus" : bands[id] ?? "Made putts";
          return (
            <label
              key={id}
              className={cn(
                "press-lg flex cursor-pointer items-center gap-3 rounded-[22px] px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
                checked ? "bg-ink text-white" : "bg-surface",
              )}
            >
              <input
                type="radio"
                name="goal"
                value={id}
                checked={checked}
                onChange={() => setGoal(id)}
                className="sr-only"
              />
              <span
                className={cn(
                  "h-[22px] w-[22px] shrink-0 rounded-full border-2",
                  checked ? "border-white bg-accent" : "border-[#a9ad9f]",
                )}
                aria-hidden
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn("dsp text-[11px] tracking-[0.1em]", checked ? "text-gold" : "text-fg-subtle")}>
                  {eyebrow}
                </span>
                <span className="text-[15px] font-semibold">{GOAL_SHORT[id]}</span>
              </span>
            </label>
          );
        })}
      </fieldset>

      <fieldset>
        <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">Time</legend>
        <div role="radiogroup" aria-label="Session length" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${PLAN_LENGTHS.length}, minmax(0, 1fr))` }}>
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
              <span
                className={cn(
                  "press font-display flex h-11 cursor-pointer items-center justify-center rounded-full text-[16px] peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                  minutes === length ? "bg-accent text-white" : "border-[1.5px] border-fg",
                )}
              >
                {length}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <GroupLabel>Location (optional)</GroupLabel>
        <Input name="location" maxLength={90} placeholder="Range or practice green" className="tabular-nums" />
      </label>

      {preview ? (
        <div className="flex flex-col gap-2">
          <GroupLabel>
            Your {preview.blocks.length} blocks · {total} min
          </GroupLabel>
          <div
            role="img"
            aria-label={preview.blocks.map((block) => `${PRACTICE_BLOCK_LABELS[block.block]} ${block.duration} minutes`).join(", ")}
            className="flex h-9 gap-1"
          >
            {preview.blocks.map((block, index) => (
              <div
                key={index}
                className={cn(
                  "flex min-w-0 items-center overflow-hidden whitespace-nowrap rounded-md pl-2.5 text-[11px] font-bold uppercase first:rounded-l-full first:pl-3 last:rounded-r-full",
                  BLOCK_FILL[index % BLOCK_FILL.length],
                )}
                style={{ flex: block.duration }}
              >
                <span className="truncate">
                  {BLOCK_SHORT[block.block]} {block.duration}
                </span>
              </div>
            ))}
          </div>
          <ol className="mt-1 flex flex-col gap-1.5">
            {preview.blocks.map((block, index) => (
              <li key={index} className="flex gap-2.5 text-[13px] leading-snug text-fg-muted">
                <span className="font-display tabular w-4 shrink-0 text-fg">{index + 1}</span>
                <span className="min-w-0">
                  <span className="font-semibold text-fg">{block.name}</span> — {block.objective}
                  {block.prioritized ? (
                    <Badge tone="accent" className="ml-1.5 align-middle">
                      Your priority
                    </Badge>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
          {priorityNames.length > 0 ? (
            <p className="text-[12px] leading-relaxed text-fg-subtle">
              Your saved drills are preferred in matching blocks: {priorityNames.slice(0, 3).join(", ")}
              {priorityNames.length > 3 ? ` and ${priorityNames.length - 3} more` : ""}.
            </p>
          ) : null}
        </div>
      ) : null}

      {state.message ? (
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      ) : null}

      <ActionBar>
        <Button type="submit" disabled={pending} className={barButton}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Start {minutes}-min session
        </Button>
      </ActionBar>
    </form>
  );
}
