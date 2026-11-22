"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { createTestSessionAction, savePracticePrioritiesAction, type PracticePrioritiesState } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { testObjective, type PracticeTest } from "@/lib/practice/tests";
import { ActionBar, Button, GroupLabel, Input, barButton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** The goal card on the drill detail screen; its text follows the band being chosen. */
function GoalCard({ badge, text }: { badge: string; text: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[22px] bg-ink px-4 py-3.5 text-white">
      <span className="font-display tabular flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-accent text-[20px]">
        {badge}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="dsp text-[11px] tracking-[0.1em] text-gold">The goal</span>
        <span className="text-[15px] font-semibold leading-snug">{text}</span>
      </div>
    </div>
  );
}

/**
 * The bottom of the drill detail screen: the goal, the band to score against,
 * where, and Start. The history and steps sit between them on the page.
 */
export function TestSetup({
  test,
  badge,
  children,
}: {
  test: PracticeTest;
  /** What the goal circle says, e.g. 7/10. */
  badge: string;
  /** The history and how-to sections, shown under the goal. */
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(createTestSessionAction, IDLE);
  const [tolerance, setTolerance] = useState(String(test.defaultTolerance ?? ""));
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="drill_id" value={test.id} />
      <input type="hidden" name="scheduled_for" value={date} />
      <GoalCard badge={badge} text={testObjective(test, tolerance ? Number(tolerance) : null)} />
      {children}
      {test.defaultTolerance !== undefined ? (
        <label className="flex flex-col gap-2">
          <GroupLabel>
            {test.kind === "line" ? "Allowed miss either side (yd)" : test.kind === "landing" ? "Landing radius (ft)" : "Finishing radius (ft)"}
          </GroupLabel>
          <Input name="tolerance" type="number" inputMode="decimal" min="0.1" max="300" step="0.1" value={tolerance} onChange={(event) => setTolerance(event.target.value)} required />
          <span className={cn("text-[12px]", state.errors?.tolerance ? "text-bad" : "text-fg-subtle")}>
            {state.errors?.tolerance ?? "Choose your band before starting. It stays with the saved result."}
          </span>
        </label>
      ) : null}
      <label className="flex flex-col gap-2">
        <GroupLabel>Location (optional)</GroupLabel>
        <Input name="location" maxLength={90} placeholder="Range or practice green" />
        {state.errors?.location ? <span className="text-[12px] text-bad">{state.errors.location}</span> : null}
      </label>
      {state.message ? <p role="status" className="text-[13px] text-bad">{state.message}</p> : null}
      <ActionBar className="[--bar-fade:var(--c-surface)]">
        <Button type="submit" disabled={pending} className={barButton}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
              <path d="M7 4.5v15l12.5-7.5z" fill="currentColor" />
            </svg>
          )}
          Start drill
        </Button>
      </ActionBar>
    </form>
  );
}

/** The bookmark on the drill hero: add or remove the drill from your priorities. */
export function PriorityToggle({ drillId, priorities }: { drillId: string; priorities: string[] }) {
  const [state, formAction, pending] = useActionState<PracticePrioritiesState, FormData>(savePracticePrioritiesAction, IDLE);
  const current = state.drillIds ?? priorities;
  const on = current.includes(drillId);
  const next = on ? current.filter((id) => id !== drillId) : [...current, drillId];
  return (
    <form action={formAction}>
      {next.map((id) => (
        <input key={id} type="hidden" name="drill_ids" value={id} />
      ))}
      <button
        type="submit"
        disabled={pending}
        aria-pressed={on}
        aria-label={on ? "Remove from my priorities" : "Add to my priorities"}
        className={cn(
          "press flex h-11 w-11 items-center justify-center rounded-full",
          on ? "bg-accent text-white" : "bg-white/90 text-[#1e211b]",
        )}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={on ? 0 : 2} strokeLinejoin="round" aria-hidden>
            <path d="M6 3h12v18l-6-4-6 4z" />
          </svg>
        )}
      </button>
    </form>
  );
}
