"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteRoundAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { Button } from "@/components/ui/primitives";

/** Two-step delete. A round is a lot of typing to lose to a stray tap. */
export function DeleteRoundButton({ roundId }: { roundId: string }) {
  const [state, formAction, pending] = useActionState(deleteRoundAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 className="h-3.5 w-3.5" /> Delete round
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="round_id" value={roundId} />
      <span className="text-xs text-fg-muted">Delete this round and every shot in it?</span>
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Yes, delete
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      {state.message ? <span className="text-xs text-bad">{state.message}</span> : null}
    </form>
  );
}
