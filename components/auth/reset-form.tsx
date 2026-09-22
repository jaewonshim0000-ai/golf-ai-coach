"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { browserClient } from "@/lib/db/supabase";
import { Button, Field, Input } from "@/components/ui/primitives";

/**
 * Password recovery.
 *
 * "request" emails a link; "confirm" is where that link lands, with a recovery
 * session already in the cookie, and sets the new password.
 *
 * The request step says the same thing whether or not the address has an
 * account. Telling a stranger which emails are registered here is not worth
 * the small convenience of a more specific message.
 */
export function ResetForm({ mode }: { mode: "request" | "confirm" }) {
  const router = useRouter();
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

    const data = new FormData(event.currentTarget);
    setPending(true);
    try {
      if (mode === "request") {
        const email = String(data.get("email") ?? "").trim();
        const { error: sendError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset/confirm`,
        });
        if (sendError) throw sendError;
        setNotice("If that address has an account, a reset link is on its way.");
        return;
      }

      const password = String(data.get("password") ?? "");
      const confirm = String(data.get("confirm") ?? "");
      if (password !== confirm) {
        setError("Those passwords do not match.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.push("/practice");
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "That did not work. Request a new link and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "request" ? (
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
      ) : (
        <>
          <Field label="New password" hint="At least 8 characters">
            <Input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>
          <Field label="Repeat it">
            <Input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
            />
          </Field>
        </>
      )}

      {error ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
          {mode === "confirm" ? (
            <>
              {" "}
              <Link href="/reset" className="underline">
                Request a new link
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : null}

      {notice ? (
        <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
          {notice}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {mode === "request" ? "Send reset link" : "Set new password"}
      </Button>
    </form>
  );
}
