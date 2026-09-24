"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deletePracticeSessionAction } from "@/app/actions";
import { Button } from "@/components/ui/primitives";
import { IDLE } from "@/lib/action-state";

export function DeletePracticeSessionButton({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(deletePracticeSessionAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 className="h-3.5 w-3.5" /> Delete session
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="session_id" value={sessionId} />
      <span className="text-xs text-fg-muted">Delete this session and its recorded result?</span>
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        Yes, delete
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>
        Cancel
      </Button>
      {state.message ? <span role="alert" className="basis-full text-right text-xs text-bad">{state.message}</span> : null}
    </form>
  );
}
