"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { browserClient } from "@/lib/db/supabase";
import { Button, Field, Input } from "@/components/ui/primitives";

type AuthFailure = Error & { code?: string };

function deliveryMessage(cause: unknown): string {
  const error = cause as AuthFailure;
  if (error?.code === "email_address_not_authorized") {
    return "Email delivery is not configured for this address yet. The app owner needs to connect an SMTP provider in Supabase.";
  }
  if (error?.code === "over_email_send_rate_limit" || error?.code === "email_rate_limit_exceeded") {
    return "The email sending limit has been reached. Wait an hour or ask the app owner to configure custom email delivery.";
  }
  return error instanceof Error ? error.message : "The confirmation email could not be sent.";
}

export function ConfirmationForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const supabase = browserClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const email = String(new FormData(event.currentTarget).get("confirmation_email") ?? "").trim();
    setPending(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (resendError) throw resendError;
      setNotice("If that account is waiting for confirmation, a new email is on its way.");
    } catch (cause) {
      setError(deliveryMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="rounded-xl border border-border bg-surface-2 px-3.5 py-3">
      <summary className="cursor-pointer text-center text-xs font-medium text-accent">
        Didn&apos;t receive a confirmation email?
      </summary>
      <form onSubmit={onSubmit} className="mt-3 space-y-3">
        <Field label="Email">
          <Input name="confirmation_email" type="email" autoComplete="email" required />
        </Field>
        {error ? (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-xs text-bad">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-xs text-good">
            {notice}
          </p>
        ) : null}
        <Button type="submit" variant="secondary" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Resend confirmation
        </Button>
      </form>
    </details>
  );
}
