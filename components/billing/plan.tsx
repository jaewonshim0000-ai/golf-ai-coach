"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, X } from "lucide-react";

import { manageBillingAction, upgradeAction } from "@/app/billing-actions";
import { Badge, Button, type ButtonProps, Card, CardContent, Sparkle } from "@/components/ui/primitives";
import { ASK_PER_DAY, FEATURES, LIMITS, priceText, type Billing, type Metered, type Price } from "@/lib/billing/plans";
import { cn, formatDate } from "@/lib/utils";

type Size = "sm" | "lg";

function Submit({
  children,
  variant,
  size = "sm",
  className,
}: {
  children: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: Size;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={size} variant={variant} disabled={pending} className={className}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </Button>
  );
}

/** Opens Stripe Checkout; a player who already pays lands in the billing portal instead. */
export function UpgradeButton({ size, variant, className }: { size?: Size; variant?: "primary" | "gold"; className?: string }) {
  return (
    <form action={upgradeAction}>
      <Submit size={size} variant={variant} className={className}>
        <Sparkle className={cn("h-3.5 w-3.5", variant !== "gold" && "text-gold")} /> Upgrade to Premium
      </Submit>
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

/**
 * Free and Premium side by side, row by row from FEATURES. `compact` leaves out
 * the rows both plans share, for the popup.
 */
export function PlanTable({ className, compact = false }: { className?: string; compact?: boolean }) {
  const rows = compact ? FEATURES.filter((feature) => feature.free !== feature.premium) : FEATURES;
  return (
    <table className={cn("w-full text-left text-[13.5px]", className)}>
      <thead>
        <tr className={cn("font-bold uppercase tracking-[0.1em]", compact ? "text-[10px]" : "text-[11px]")}>
          <th scope="col" className="py-2"><span className="sr-only">Feature</span></th>
          <th scope="col" className="w-[26%] py-2 text-fg-subtle">Free</th>
          <th scope="col" className="w-[28%] py-2 text-accent">Premium</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((feature) => (
          <tr key={feature.label} className="border-t border-surface-2">
            <th scope="row" className={cn("pr-2 font-semibold leading-snug", compact ? "py-2.5" : "py-[11px]")}>{feature.label}</th>
            <td className="pr-2 leading-snug text-fg-subtle">
              {feature.free ?? (
                <>
                  <span aria-hidden>—</span>
                  <span className="sr-only">Not included</span>
                </>
              )}
            </td>
            <td className="font-bold leading-snug">{feature.premium}</td>
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
        className="menu-sheet m-0 mt-auto max-h-[92svh] w-full max-w-none overflow-y-auto rounded-t-[30px] bg-bg p-0 text-fg backdrop:bg-[rgb(20_24_15_/_0.55)] sm:m-auto sm:max-w-[440px] sm:rounded-[30px]"
      >
        <div className="flex flex-col gap-3.5 px-5 pb-[calc(1.875rem+env(safe-area-inset-bottom))] pt-3">
          <div className="flex flex-col items-center gap-3">
            <span aria-hidden className="h-[5px] w-10 rounded-full bg-border-strong" />
            <div className="flex items-center justify-between self-stretch">
              <span className="dsp inline-flex h-9 items-center gap-2 rounded-full bg-ink pl-1 pr-3.5 text-[11px] tracking-[0.1em] text-white">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#3a3f33] text-gold">
                  <Sparkle className="h-[13px] w-[13px]" />
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
          </div>
          <div className="flex flex-col gap-2">
            <h2 id="upgrade-title" className="dsp text-[34px] leading-[0.98]">{reason?.title}</h2>
            <p className="text-[14px] leading-normal text-fg-muted">{reason?.message}</p>
          </div>
          <div className="rounded-[22px] bg-surface px-4 py-1.5">
            <PlanTable compact />
          </div>
          <div className="flex flex-col gap-2">
            <UpgradeButton size="lg" className="shadow-[var(--shadow-accent)]" />
            <p className="text-center text-[13px] text-fg-subtle">{priceText(price)} · cancel any time</p>
          </div>
          <Link
            href="/pricing"
            onClick={() => setReason(null)}
            className="self-center text-[13px] font-bold text-accent underline underline-offset-[3px]"
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
          <Sparkle className="h-3.5 w-3.5 text-gold" /> Unlock with Premium
        </Button>
      </CardContent>
    </Card>
  );
}

const METERS: { kind: Metered; label: string }[] = [
  { kind: "swing", label: "Swing analyses" },
  { kind: "round", label: "Rounds" },
];

/** One allowance on the plan card: what is left, and a bar of what is used. */
function Meter({ label, used, limit, gold = false }: { label: string; used: number; limit: number | null; gold?: boolean }) {
  const left = limit === null ? null : Math.max(0, limit - used);
  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex justify-between gap-3 text-[13px]">
        <span className="font-semibold">{label}</span>
        <span className="tabular text-[#c9ccbf]">
          {limit === null ? (
            <>
              <strong className="text-white">{used}</strong> used · unlimited
            </>
          ) : (
            <>
              <strong className="text-white">{left}</strong> of {limit} left
            </>
          )}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={limit ?? undefined}
        className="h-2 overflow-hidden rounded-full bg-[#3a3f33]"
      >
        <span
          className={cn(
            "glide-left block h-full rounded-full",
            left === 0 ? "bg-[#f2b59b]" : gold ? "bg-gold" : "bg-[#a6c266]",
          )}
          style={{ width: `${limit === null ? 0 : Math.min(100, (used / limit) * 100)}%`, animationDelay: "400ms" }}
        />
      </div>
    </div>
  );
}

/** The plan on the dark card: what is left this month, and the way up. */
export function PlanCard({ billing, askedToday, notice }: { billing: Billing; askedToday: number; notice: string | null }) {
  const premium = billing.plan === "premium";
  const end = billing.periodEnd ? formatDate(billing.periodEnd) : null;
  return (
    <section
      id="plan"
      aria-labelledby="plan-title"
      className="scroll-mt-6 flex flex-col gap-3 rounded-[28px] bg-ink p-4 text-white shadow-[0_18px_32px_-20px_rgb(30_33_27_/_0.7)]"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="plan-title" className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#c9ccbf]">
          {premium ? "Premium" : "Free plan"} · this month
        </h2>
        <Link href="/pricing" className="text-[12px] font-bold text-gold underline underline-offset-2">
          Compare plans
        </Link>
      </div>
      {notice ? <p role="status" className="rounded-2xl bg-white/10 px-3.5 py-2.5 text-[13px]">{notice}</p> : null}
      {billing.status === "past_due" || billing.status === "unpaid" ? (
        <p role="alert" className="rounded-2xl bg-[#3a3f33] px-3.5 py-2.5 text-[13px] text-[#f2b59b]">
          Your last payment did not go through. Update your card in billing to get Premium back.
        </p>
      ) : null}
      <div className="flex flex-col gap-2.5">
        {METERS.map(({ kind, label }) => (
          <Meter key={kind} label={label} used={billing.used[kind]} limit={LIMITS[billing.plan][kind]} />
        ))}
        <Meter label="AI coach answers today" used={askedToday} limit={ASK_PER_DAY[billing.plan]} gold />
      </div>
      <p className="text-[11px] text-[#a9ad9f]">
        Allowances reset on the 1st of each month, answers every day (UTC).
        {premium && end ? ` ${billing.cancelAtPeriodEnd ? `Premium ends ${end}.` : `Renews ${end}.`}` : ""}
      </p>
      {premium ? (
        billing.status ? (
          <form action={manageBillingAction}>
            <InkSubmit className="border-[1.5px] border-white/60 bg-transparent">Manage billing</InkSubmit>
          </form>
        ) : null
      ) : (
        <form action={upgradeAction}>
          <InkSubmit className="bg-accent">
            <Sparkle className="h-[13px] w-[13px] text-gold" /> Upgrade to Premium
          </InkSubmit>
        </form>
      )}
    </section>
  );
}

/** The plan card's full-width button. */
function InkSubmit({ className, children }: { className?: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={cn("press dsp flex h-11 w-full items-center justify-center gap-2 rounded-full text-[12px] text-white disabled:opacity-60", className)}
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}
