"use client";

import { useActionState, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteAccountAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { Button, Field, Input } from "@/components/ui/primitives";

/** Closing the account. Typed confirmation, because there is no undo. */
export function DeleteAccountButton() {
  const [state, formAction, pending] = useActionState(deleteAccountAction, IDLE);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 className="h-3.5 w-3.5" /> Delete account
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-[12px] leading-[1.6] text-fg-muted">
        This deletes your rounds, shots, practices, swing videos and profile, and cannot be undone.
      </p>
      <Field label="Type delete to confirm">
        <Input name="confirm" autoComplete="off" required />
      </Field>
      {state.message ? (
        <p role="alert" className="text-xs text-bad">
          {state.message}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Delete my account
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
