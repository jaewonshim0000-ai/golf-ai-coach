"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteSwingSessionAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { Button } from "@/components/ui/primitives";

/** Two-step delete: the video, its measurements and its findings all go. */
export function DeleteSwingButton({ swingSessionId }: { swingSessionId: string }) {
  const [state, formAction, pending] = useActionState(deleteSwingSessionAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 className="h-3.5 w-3.5" /> Delete swing
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="swing_session_id" value={swingSessionId} />
      <span className="text-xs text-fg-muted">
        Delete this video and everything measured from it?
      </span>
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
