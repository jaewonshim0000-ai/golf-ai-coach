import type { Metadata } from "next";
import Link from "next/link";

import { saveProfileAction, signOutAction } from "@/app/actions";
import { DeleteAccountButton } from "@/components/auth/delete-account";
import { PlanCard } from "@/components/billing/plan";
import { ProfileForm } from "@/components/forms/profile-form";
import * as repo from "@/lib/db/repo";
import { billingConfigured, syncCheckout } from "@/lib/billing/stripe";
import { loadPlayerState } from "@/lib/player-state";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

const NOTICES = new Map([
  ["unavailable", "Billing is not set up yet."],
  ["error", "Could not open Stripe. Please try again."],
]);

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; billing?: string }>;
}) {
  const user = await repo.currentUser();
  if (!user) return null;
  const search = await searchParams;
  const checkout = typeof search.checkout === "string" && /^cs_\w{1,250}$/.test(search.checkout);
  if (checkout && billingConfigured()) {
    // The webhook catches up if this fails.
    await syncCheckout(search.checkout!, user.id).catch((error) => console.error("checkout sync", error));
  }
  const [state, billing, askedToday] = await Promise.all([
    loadPlayerState(user.id),
    repo.getBilling(user.id),
    repo.getAskedToday(user.id),
  ]);
  const notice = checkout
    ? billing.plan === "premium"
      ? "Welcome to Premium."
      : "Payment received. Your plan updates in a moment; refresh to check."
    : (NOTICES.get(search.billing ?? "") ?? null);

  const name = state.profile?.display_name ?? "Profile";
  const initials = name
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const handicap = state.profile?.handicap_index;
  const sessions = state.volume.sessions_completed;
  const subline = [
    handicap !== null && handicap !== undefined ? `HCP ${handicap.toFixed(1)}` : null,
    `${state.rounds.length} round${state.rounds.length === 1 ? "" : "s"}`,
    `${sessions} session${sessions === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const supabase = repo.mode() === "supabase";
  const link = "underline underline-offset-2";

  return (
    <div className="flex flex-col gap-3.5 pt-1">
      <header className="flex items-center gap-3.5">
        <span className="font-display flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full border-4 border-white bg-accent text-[22px] text-white shadow-[0_10px_20px_-12px_rgb(30_33_27_/_0.5)]">
          {initials || "You"}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="dsp truncate text-[32px] leading-none">{name}</h1>
          <p className="truncate text-[13px] text-fg-muted">{subline}</p>
        </div>
      </header>

      {supabase ? <PlanCard billing={billing} askedToday={askedToday} notice={notice} /> : null}

      <ProfileForm profile={state.profile} action={saveProfileAction} />

      <nav aria-label="Account" className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-1 text-[13px] font-semibold">
        <Link href="/api/export" prefetch={false} className={`text-accent ${link}`}>
          Download my data
        </Link>
        <Link href="/privacy" className={`text-accent ${link}`}>
          Privacy
        </Link>
        <Link href="/terms" className={`text-accent ${link}`}>
          Terms
        </Link>
        {supabase ? (
          <form action={signOutAction}>
            <button type="submit" className={`font-semibold text-fg-muted ${link}`}>
              Sign out
            </button>
          </form>
        ) : null}
      </nav>
      {supabase ? (
        <div className="flex flex-col items-center gap-2 text-center text-[12px] text-fg-subtle">
          {user.email ? <p>Signed in as {user.email}</p> : null}
          <details className="group w-full">
            <summary className="cursor-pointer list-none font-semibold text-bad">Delete account</summary>
            <div className="mt-3 flex flex-col items-center gap-3 rounded-[22px] bg-surface p-4">
              <p className="text-[13px] text-fg-muted">Permanently remove your account and saved golf data.</p>
              <DeleteAccountButton />
            </div>
          </details>
        </div>
      ) : (
        <p className="text-center text-[12px] text-fg-subtle">Demo mode: no account to sign out of.</p>
      )}
    </div>
  );
}
