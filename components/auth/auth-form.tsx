"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { browserClient } from "@/lib/db/supabase";
import { LEGAL } from "@/lib/legal";
import { ActionBar, Button, Field, GroupLabel, Input, barButton, chip } from "@/components/ui/primitives";

/** Sign in and Create account as the two chips at the top of the sheet. */
export function AuthTabs({ active }: { active: "login" | "signup" }) {
  return (
    <nav aria-label="Account" className="flex gap-2">
      <Link href="/login" aria-current={active === "login" ? "page" : undefined} className={chip(active === "login", "flex-1")}>
        Sign in
      </Link>
      <Link href="/signup" aria-current={active === "signup" ? "page" : undefined} className={chip(active === "signup", "flex-1")}>
        Create account
      </Link>
    </nav>
  );
}

/**
 * Email + password auth against Supabase. Only rendered when Supabase is
 * configured - in demo mode the page shows the demo entry point instead.
 */
export function AuthForm({
  mode,
  initialError = null,
  wantsPremium = false,
}: {
  mode: "login" | "signup";
  initialError?: string | null;
  /** Came from Premium on the pricing page: onboarding sends them back there. */
  wantsPremium?: boolean;
}) {
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
            // When they agreed, kept with the account.
            data: { name, terms_accepted_at: new Date().toISOString(), ...(wantsPremium ? { wants_premium: true } : {}) },
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
    <form id={`auth-${mode}`} onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === "signup" ? (
        <Field label="Name">
          <Input name="name" autoComplete="name" required maxLength={80} />
        </Field>
      ) : null}

      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </Field>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="password">
            <GroupLabel>Password</GroupLabel>
          </label>
          {mode === "login" ? (
            <Link href="/reset" className="text-[13px] font-bold text-accent underline underline-offset-2">
              Forgot?
            </Link>
          ) : null}
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={8}
          placeholder="At least 8 characters"
        />
      </div>

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

      {mode === "signup" ? (
        <label className="flex items-start gap-2.5 text-[13px] leading-snug text-fg-muted">
          <input type="checkbox" name="terms" required className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--c-accent)]" />
          <span>
            I&apos;m {LEGAL.minAge} or older and agree to the{" "}
            <Link href="/terms" className="font-bold text-accent underline underline-offset-2">Terms</Link> and the{" "}
            <Link href="/privacy" className="font-bold text-accent underline underline-offset-2">Privacy policy</Link>.
          </span>
        </label>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-2xl bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-2xl bg-good-soft px-3.5 py-2.5 text-[13px] text-accent-strong">
          {notice}
        </p>
      ) : null}

      <ActionBar className="[--bar-fade:var(--c-surface)] md:[&>*]:flex-1">
        <Button type="submit" className={barButton} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "signup" ? "Create account" : "Sign in"}
        </Button>
      </ActionBar>
    </form>
  );
}
