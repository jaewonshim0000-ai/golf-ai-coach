import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Download } from "lucide-react";

import { saveProfileAction, signOutAction } from "@/app/actions";
import { DeleteAccountButton } from "@/components/auth/delete-account";
import { PlanCard } from "@/components/billing/plan";
import { ProfileForm } from "@/components/forms/profile-form";
import { StatCircle } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";
import { billingConfigured, syncCheckout } from "@/lib/billing/stripe";
import { loadPlayerState } from "@/lib/player-state";
import { labelize } from "@/types/golf";

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
  const [state, billing] = await Promise.all([loadPlayerState(user.id), repo.getBilling(user.id)]);
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
  const course = state.rounds[0]?.course_name;
  const handicap = state.profile?.handicap_index;
  const supabase = repo.mode() === "supabase";

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-4 pt-1">
        <span className="font-display flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-full border-[3px] border-white bg-accent text-[24px] text-white">
          {initials || "You"}
        </span>
        <div className="min-w-0">
          <h1 className="dsp truncate text-[34px] leading-none">{name}</h1>
          <p className="mt-1 truncate text-[13px] text-fg-muted">
            {[state.profile ? `${labelize(state.profile.dominant_hand)}-handed` : null, course].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-3 gap-2 rounded-[28px] bg-ink px-3 py-4 text-white">
        <Link href="/rounds/handicap" className="press">
          <StatCircle value={handicap !== null && handicap !== undefined ? handicap.toFixed(1) : "—"} label="Handicap" tone="accent" size={60} />
        </Link>
        <Link href="/rounds?view=rounds" className="press">
          <StatCircle value={state.rounds.length} label="Rounds" tone="white" size={60} />
        </Link>
        <Link href="/practice/history" className="press">
          <StatCircle value={state.volume.sessions_completed} label="Sessions" tone="white" size={60} />
        </Link>
      </dl>

      <ProfileForm profile={state.profile} action={saveProfileAction} />

      {supabase ? <PlanCard billing={billing} notice={notice} /> : null}

      <ul aria-label="Account" className="overflow-hidden rounded-[22px] bg-surface">
        <li className="border-b border-border">
          <Link href="/api/export" prefetch={false} className="flex min-h-[52px] items-center justify-between gap-3 px-4 text-[16px] font-semibold">
            Download my data
            <Download className="h-[18px] w-[18px] text-fg-muted" />
          </Link>
        </li>
        {supabase ? (
          <>
            <li className="border-b border-border">
              <form action={signOutAction}>
                <button type="submit" className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left text-[16px] font-semibold">
                  <span>
                    Sign out
                    {user.email ? <span className="ml-2 text-[12.5px] font-normal text-fg-subtle">{user.email}</span> : null}
                  </span>
                  <ChevronRight className="h-[18px] w-[18px] text-fg-muted" />
                </button>
              </form>
            </li>
            <li>
              <details className="group">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between px-4 text-[16px] font-semibold text-bad">
                  Delete account
                  <ChevronRight className="h-[18px] w-[18px] transition-transform group-open:rotate-90" />
                </summary>
                <div className="px-4 pb-4">
                  <p className="mb-3 text-[13px] text-fg-muted">Permanently remove your account and saved golf data.</p>
                  <DeleteAccountButton />
                </div>
              </details>
            </li>
          </>
        ) : (
          <li className="flex min-h-[52px] items-center px-4 text-[13px] text-fg-subtle">Demo mode: no account to sign out of.</li>
        )}
      </ul>
      <p className="text-center text-[12px] text-fg-subtle">
        <Link href="/privacy" className="underline underline-offset-2">Privacy policy</Link>
        {" · "}
        <Link href="/terms" className="underline underline-offset-2">Terms of service</Link>
      </p>
    </div>
  );
}
