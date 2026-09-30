"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { browserClient } from "@/lib/db/supabase";
import { Button, Field, Input } from "@/components/ui/primitives";

/**
 * Email + password auth against Supabase. Only rendered when Supabase is
 * configured - in demo mode the page shows the demo entry point instead.
 */
export function AuthForm({ mode, initialError = null }: { mode: "login" | "signup"; initialError?: string | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
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
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const passwordConfirmation = String(data.get("password_confirmation") ?? "");
    const name = String(data.get("name") ?? "").trim();

    if (mode === "signup" && password !== passwordConfirmation) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    try {
      if (mode === "signup") {
        const { data: result, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (signUpError) throw signUpError;
        if (!result.session) {
          setNotice("Check your inbox and spam folder to confirm your email, then sign in. You can resend it from the sign-in page.");
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      router.push("/practice");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "signup" ? (
        <Field label="Name">
          <Input name="name" autoComplete="name" required maxLength={80} />
        </Field>
      ) : null}

      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>

      <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
        <Input
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={8}
        />
      </Field>

      {mode === "signup" ? (
        <Field label="Confirm password">
          <Input
            name="password_confirmation"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
          {notice}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {mode === "signup" ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}
