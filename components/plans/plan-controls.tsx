"use client";

import { useActionState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";

import { adaptPlanAction, generatePlanAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { cn } from "@/lib/utils";
import { Button, Select } from "@/components/ui/primitives";

export function GeneratePlanForm({ hasPlan }: { hasPlan: boolean }) {
  const [state, formAction, pending] = useActionState(generatePlanAction, IDLE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Select name="weeks" defaultValue="2" className="w-auto" aria-label="Plan length">
        <option value="1">1 week</option>
        <option value="2">2 weeks</option>
        <option value="4">4 weeks</option>
        <option value="6">6 weeks</option>
      </Select>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {hasPlan ? "Generate a new plan" : "Build my plan"}
      </Button>
      {state.message ? (
        <span className={cn("text-xs", state.ok ? "text-good" : "text-bad")}>{state.message}</span>
      ) : null}
    </form>
  );
}

export function AdaptPlanForm() {
  const [state, formAction, pending] = useActionState(adaptPlanAction, IDLE);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Re-evaluate the plan
      </Button>
      {state.message ? (
        <span className={cn("text-xs", state.ok ? "text-good" : "text-bad")}>{state.message}</span>
      ) : null}
    </form>
  );
}
