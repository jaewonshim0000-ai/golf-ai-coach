import type { Metadata } from "next";
import { Download } from "lucide-react";

import { saveProfileAction, signOutAction } from "@/app/actions";
import { DeleteAccountButton } from "@/components/auth/delete-account";
import { PlanCard } from "@/components/billing/plan";
import { ProfileForm } from "@/components/forms/profile-form";
import { TrendLine } from "@/components/charts";
import {
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  HeroPill,
  PageHero,
  Stat,
} from "@/components/ui/primitives";
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
  const [state, billing] = await Promise.all([loadPlayerState(user.id), repo.getBilling(user.id)]);
  const notice = checkout
    ? billing.plan === "premium"
      ? "Welcome to Premium."
      : "Payment received. Your plan updates in a moment; refresh to check."
    : (NOTICES.get(search.billing ?? "") ?? null);

  const handicapPoints = state.handicapHistory.map((entry) => ({
    date: entry.recorded_on,
    label: "Handicap index",
    value: entry.handicap_index,
  }));

  return (
    <div className="space-y-5">
      <PageHero
        art="plain"
        size="sm"
        eyebrow="Your profile"
        title={state.profile?.display_name ?? "Profile"}
        description="Your details, goals and practice preferences."
        pills={
          state.profile?.handicap_index !== null && state.profile?.handicap_index !== undefined ? (
            <HeroPill tone="solid">HCP {state.profile.handicap_index.toFixed(1)}</HeroPill>
          ) : null
        }
        topLeft={
          <ButtonLink href="/practice" variant="onHero" size="sm" className="md:hidden">
            Close
          </ButtonLink>
        }
      />

      <ProfileForm profile={state.profile} action={saveProfileAction} />

      <Card>
        <CardHeader>
          <CardTitle>Your progress</CardTitle>
          <CardDescription>{state.rounds.length} rounds · {state.volume.sessions_completed} completed practices</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-surface-2 p-4">
          <Stat
            label="Handicap"
            value={state.profile?.handicap_index ?? "—"}
            sub={`${state.rounds.length} rounds`}
          />
          <Stat
            label="Rounds"
            value={state.rounds.length}
            sub="logged"
          />
          <Stat
            label="Practice"
            value={state.volume.sessions_completed}
            sub={`${state.volume.total_minutes} min`}
          />
        </div>

      {handicapPoints.length > 1 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-fg-muted">Handicap trend</p>
          <TrendLine points={handicapPoints} height={170} invert />
        </div>
      ) : null}
        </CardContent>
      </Card>

      {repo.mode() === "supabase" ? <PlanCard billing={billing} notice={notice} /> : null}

      {repo.mode() === "supabase" ? (
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs text-fg-muted">Signed in as</p><p className="mt-1 break-all text-sm font-medium">{user.email}</p></div>
              <form action={signOutAction}><Button type="submit" variant="secondary" size="sm">Sign out</Button></form>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 p-3.5">
              <div>
                <p className="text-sm font-medium">Your data</p>
                <p className="mt-0.5 text-xs text-fg-muted">Download a copy of your profile and golf records.</p>
              </div>
              <ButtonLink href="/api/export" variant="secondary" size="sm" prefetch={false}>
                <Download className="h-3.5 w-3.5" /> Download data
              </ButtonLink>
            </div>
            <details className="border-t border-border pt-3">
              <summary className="min-h-10 cursor-pointer py-2 text-xs font-medium text-bad">Delete account</summary>
              <p className="mb-3 text-xs text-fg-muted">Permanently remove your account and saved golf data.</p>
              <DeleteAccountButton />
            </details>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
