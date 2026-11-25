"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, Sparkles, X } from "lucide-react";

import { manageBillingAction, upgradeAction } from "@/app/billing-actions";
import { Badge, Button, type ButtonProps, Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui/primitives";
import { ASK_PER_DAY, FEATURES, LIMITS, priceText, type Billing, type Metered, type Price } from "@/lib/billing/plans";
import { cn, formatDate } from "@/lib/utils";

type Size = "sm" | "lg";

function Submit({ children, variant, size = "sm" }: { children: React.ReactNode; variant?: ButtonProps["variant"]; size?: Size }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} variant={variant} disabled={pending}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </Button>
  );
}

/** Opens Stripe Checkout; a player who already pays lands in the billing portal instead. */
export function UpgradeButton({ size }: { size?: Size }) {
  return (
    <form action={upgradeAction}>
      <Submit size={size}><Sparkles className="h-3.5 w-3.5" /> Upgrade to Premium</Submit>
    </form>
  );
}

/** Stripe's customer portal: card, invoices, cancelling. */
export function ManageBillingButton({ size, variant = "secondary" }: { size?: Size; variant?: ButtonProps["variant"] }) {
  return (
    <form action={manageBillingAction}>
      <Submit variant={variant} size={size}>Manage billing</Submit>
    </form>
  );
}

/** Free and Premium side by side, row by row from FEATURES. */
export function PlanTable({ className }: { className?: string }) {
  return (
    <table className={cn("w-full text-left text-[14px]", className)}>
      <thead>
        <tr className="dsp text-[11px] tracking-[0.1em]">
          <th scope="col" className="pb-2.5 font-normal"><span className="sr-only">Feature</span></th>
          <th scope="col" className="w-[27%] pb-2.5 font-normal text-fg-muted">Free</th>
          <th scope="col" className="w-[27%] pb-2.5 font-normal text-accent">Premium</th>
        </tr>
      </thead>
      <tbody>
        {FEATURES.map((feature) => (
          <tr key={feature.label} className="border-t border-border">
            <th scope="row" className="py-3 pr-3 font-semibold leading-snug">{feature.label}</th>
            <td className="py-3 pr-3 leading-snug text-fg-muted">
              {feature.free ?? (
                <>
                  <span aria-hidden>—</span>
                  <span className="sr-only">Not included</span>
                </>
              )}
            </td>
            <td className="py-3 font-semibold leading-snug">{feature.premium}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** What the player reached, in their words: the popup's heading and why. */
export type UpgradeReason = { title: string; message: string };

const UpgradeContext = createContext<(reason: UpgradeReason) => void>(() => window.location.assign("/pricing"));

/** Opens the upgrade popup. Outside an UpgradeProvider it goes to the pricing page instead. */
export const useUpgrade = () => useContext(UpgradeContext);

/**
 * The upgrade popup, once for the whole app: a screen opens it with
 * useUpgrade() when a Free player reaches something that needs Premium. A
 * native <dialog> for the focus trap and Escape, rising from the bottom.
 */
export function UpgradeProvider({ price, children }: { price: Price | null; children: React.ReactNode }) {
  const [reason, setReason] = useState<UpgradeReason | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (reason && !element.open) element.showModal();
    else if (!reason && element.open) element.close();
  }, [reason]);

  return (
    <UpgradeContext.Provider value={setReason}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="upgrade-title"
        onClose={() => setReason(null)}
        /* Clicking the backdrop lands on the dialog itself, never a child. */
        onClick={(event) => {
          if (event.target === dialog.current) setReason(null);
        }}
        className="m-0 mt-auto max-h-[92svh] w-full max-w-none overflow-y-auto rounded-t-[28px] bg-bg p-0 text-fg backdrop:bg-[rgb(20_24_15_/_0.55)] sm:m-auto sm:max-w-[440px] sm:rounded-[28px]"
      >
        <div className="flex flex-col gap-4 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
          <div className="flex items-center justify-between">
            <span className="dsp inline-flex h-9 items-center gap-2 rounded-full bg-ink pl-1 pr-3.5 text-[11px] text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3a3f33] text-gold">
                <Sparkles className="h-3.5 w-3.5" fill="currentColor" />
              </span>
              Premium
            </span>
            <button
              type="button"
              onClick={() => setReason(null)}
              aria-label="Close"
              className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <h2 id="upgrade-title" className="dsp text-[34px] leading-[0.98]">{reason?.title}</h2>
            <p className="text-[14px] leading-relaxed text-fg-muted">{reason?.message}</p>
          </div>
          <div className="rounded-[22px] bg-surface px-4 pb-1 pt-4">
            <PlanTable />
          </div>
          <div className="flex flex-col gap-2.5">
            <UpgradeButton size="lg" />
            <p className="text-center text-[13px] text-fg-muted">{priceText(price)} · cancel any time</p>
          </div>
          <Link
            href="/pricing"
            onClick={() => setReason(null)}
            className="self-center text-[13px] font-semibold text-accent underline underline-offset-2"
          >
            Compare plans
          </Link>
        </div>
      </dialog>
    </UpgradeContext.Provider>
  );
}

/** Opens the popup as the screen appears, for a screen that is itself what the plan has run out of. */
export function OpenUpgrade({ title, message }: UpgradeReason) {
  const upgrade = useUpgrade();
  useEffect(() => upgrade({ title, message }), [upgrade, title, message]);
  return null;
}

/** Stands in for a Premium-only section; its button opens the upgrade popup. */
export function UpgradePrompt({ title, message }: UpgradeReason) {
  const upgrade = useUpgrade();
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0 flex-1 basis-60">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {title} <Badge tone="accent">Premium</Badge>
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{message}</p>
        </div>
        <Button type="button" size="sm" onClick={() => upgrade({ title, message })}>
          <Sparkles className="h-3.5 w-3.5" /> Unlock with Premium
        </Button>
      </CardContent>
    </Card>
  );
}

const METERS: { kind: Metered; label: string }[] = [
  { kind: "swing", label: "Swing analyses" },
  { kind: "round", label: "Rounds" },
];

export function PlanCard({ billing, notice }: { billing: Billing; notice: string | null }) {
  const premium = billing.plan === "premium";
  const end = billing.periodEnd ? formatDate(billing.periodEnd) : null;
  return (
    <Card id="plan" className="scroll-mt-6">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Plan</CardTitle>
        <Badge tone={premium ? "accent" : "neutral"}>{premium ? "Premium" : "Free"}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice ? <p role="status" className="rounded-lg bg-surface-2 p-3 text-sm">{notice}</p> : null}
        {billing.status === "past_due" || billing.status === "unpaid" ? (
          <p role="alert" className="rounded-lg bg-bad-soft p-3 text-sm text-bad">
            Your last payment did not go through. Update your card in billing to get Premium back.
          </p>
        ) : null}
        <div className="space-y-3">
          {METERS.map(({ kind, label }) => {
            const limit = LIMITS[billing.plan][kind];
            const used = billing.used[kind];
            return (
              <div key={kind} className="space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span>{label}</span>
                  <span className="tabular text-fg-muted">
                    {limit === null ? `${used} this month · unlimited` : `${used} of ${limit} this month`}
                  </span>
                </div>
                <Progress
                  value={limit === null ? 0 : used / limit}
                  tone={limit !== null && used >= limit ? "bad" : "accent"}
                  label={`${label} used this month`}
                />
              </div>
            );
          })}
          <p className="text-[11px] text-fg-subtle">Allowances reset on the 1st of each month (UTC).</p>
        </div>
        {premium ? (
          end ? <p className="text-[13px] text-fg-muted">{billing.cancelAtPeriodEnd ? `Premium ends ${end}.` : `Renews ${end}.`}</p> : null
        ) : (
          <p className="text-[13px] leading-relaxed text-fg-muted">
            Premium gives you {LIMITS.premium.swing} swing analyses a month, unlimited rounds, the full strokes-gained
            breakdown and {ASK_PER_DAY.premium} AI coach answers a day.{" "}
            <Link href="/pricing" className="font-semibold text-accent underline underline-offset-2">Compare plans</Link>
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {premium ? null : <UpgradeButton />}
          {billing.status ? <ManageBillingButton /> : null}
        </div>
      </CardContent>
    </Card>
  );
}
