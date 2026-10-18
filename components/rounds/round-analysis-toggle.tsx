"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { setRoundExcludedAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { Button } from "@/components/ui/primitives";

/** A storm, a scramble, a borrowed set: keep the round, leave it out of the numbers. */
export function RoundAnalysisToggle({ roundId, excluded }: { roundId: string; excluded: boolean }) {
  const [state, formAction, pending] = useActionState(setRoundExcludedAction, IDLE);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="round_id" value={roundId} />
      <input type="hidden" name="excluded" value={String(!excluded)} />
      <Button type="submit" variant={excluded ? "secondary" : "ghost"} size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {excluded ? "Count in analysis" : "Leave out of analysis"}
      </Button>
      {state.message ? <span className="text-xs text-bad">{state.message}</span> : null}
    </form>
  );
}
