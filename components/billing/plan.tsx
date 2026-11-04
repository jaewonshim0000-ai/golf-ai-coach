"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { Loader2, Sparkles } from "lucide-react";

import { manageBillingAction, upgradeAction } from "@/app/billing-actions";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Progress } from "@/components/ui/primitives";
import { LIMITS, type Billing, type Metered } from "@/lib/billing/plans";
import { formatDate } from "@/lib/utils";

function Submit({ children, variant }: { children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant={variant} disabled={pending}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </Button>
  );
}

/** Opens Stripe Checkout; a player who already pays lands in the billing portal instead. */
export function UpgradeButton() {
  return (
    <form action={upgradeAction}>
      <Submit><Sparkles className="h-3.5 w-3.5" /> Upgrade to Premium</Submit>
    </form>
  );
}

/** Stands in for a Premium-only section. */
export function UpgradePrompt({ title, message }: { title: string; message: string }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0 flex-1 basis-60">
          <p className="flex items-center gap-2 text-[15px] font-semibold">
            {title} <Badge tone="accent">Premium</Badge>
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{message}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/profile#plan" className="text-[12px] text-accent">See plans</Link>
          <UpgradeButton />
        </div>
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
            Premium gives you {LIMITS.premium.swing} swing analyses a month, unlimited rounds and the full strokes-gained
            breakdown. Free includes {LIMITS.free.swing} swing analyses and {LIMITS.free.round} rounds a month.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {premium ? null : <UpgradeButton />}
          {billing.status ? (
            <form action={manageBillingAction}>
              <Submit variant="secondary">Manage billing</Submit>
            </form>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
