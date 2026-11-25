"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";

import { createPracticeSessionAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { GOAL_SHORT, type GoalId } from "@/lib/practice/goals";
import { PLAN_LENGTHS, type PlanLength } from "@/lib/practice/plan";
import type { PracticeBlock } from "@/types/practice";
import { cn } from "@/lib/utils";
import { BlockBar } from "@/components/practice/block-bar";
import { ActionBar, Badge, Button, GroupLabel, Input, barButton } from "@/components/ui/primitives";

export type PlanPreview = {
  title: string;
  blocks: { block: PracticeBlock; duration: number; name: string; objective: string; prioritized?: boolean }[];
};

/** Goal and length in, the whole plan shown before it starts. */
export function SessionBuilder({
  goals,
  recommended,
  priorityGoal,
  priorityLost,
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
  /** Strokes a round the #1 priority costs, shown beside it. */
  priorityLost: number | null;
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
                checked ? "bg-ink text-white shadow-[0_14px_26px_-18px_rgb(30_33_27_/_0.7)]" : "bg-surface",
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
              {id === priorityGoal && priorityLost !== null ? (
                <span className={cn("font-display tabular shrink-0 text-[16px]", checked ? "text-[#f2b59b]" : "text-bad")}>
                  −{priorityLost.toFixed(1)}
                </span>
              ) : null}
            </label>
          );
        })}
      </fieldset>

      <fieldset>
        <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">Time · from your profile</legend>
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
                  "press font-display flex h-12 cursor-pointer items-center justify-center rounded-full text-[17px] uppercase peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
                  minutes === length ? "bg-accent text-white" : "border-[1.5px] border-fg",
                )}
              >
                {length} min
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {preview ? (
        <section aria-labelledby="blocks" className="flex flex-col gap-2.5 rounded-[24px] bg-surface p-3.5 shadow-[var(--shadow-card)]">
          <h2 id="blocks" className="text-[12px] font-bold uppercase tracking-[0.1em] text-fg-muted">
            Your {preview.blocks.length} blocks · {total} min
          </h2>
          <BlockBar blocks={preview.blocks} minutes legend className="h-[34px]" />
          <ol className="mt-1 flex flex-col gap-1.5 border-t border-border pt-3">
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
        </section>
      ) : null}

      <label className="flex flex-col gap-2">
        <GroupLabel>Location (optional)</GroupLabel>
        <Input name="location" maxLength={90} placeholder="Range or practice green" className="tabular-nums" />
      </label>

      {state.message ? (
        <p role="alert" className="text-sm text-bad">
          {state.message}
        </p>
      ) : null}

      <ActionBar>
        <Button type="submit" disabled={pending} className={cn(barButton, "shadow-[var(--shadow-accent)]")}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
              <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
            </svg>
          )}
          Start {minutes}-min session
        </Button>
      </ActionBar>
    </form>
  );
}
