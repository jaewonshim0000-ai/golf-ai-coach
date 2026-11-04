/**
 * What each plan allows per calendar month (UTC); null is unlimited. The
 * database enforces the same numbers in 0012_subscriptions.sql, and
 * migrations.test.ts checks the two agree.
 */
export const LIMITS = {
  free: { swing: 3, round: 4 },
  premium: { swing: 100, round: null },
} as const;

export type Plan = keyof typeof LIMITS;
export type Metered = "swing" | "round";

/** SQLSTATE the usage trigger raises; its message is written for the player. */
export const LIMIT_ERROR = "GC402";

/** Only a paid or trialing subscription unlocks Premium. */
export function planFor(status: string | null | undefined): Plan {
  return status === "active" || status === "trialing" ? "premium" : "free";
}

export type Billing = {
  plan: Plan;
  /** Stripe's subscription status; null before the first checkout. */
  status: string | null;
  /** When the paid period renews, or ends if cancelled. */
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  used: Record<Metered, number>;
};

/** Uses left this month; null when the plan has no cap. */
export function remaining(billing: Billing, kind: Metered): number | null {
  const limit = LIMITS[billing.plan][kind];
  return limit === null ? null : Math.max(0, limit - billing.used[kind]);
}

/** Shown when the allowance is used up; the usage trigger raises the same words. */
export function limitMessage(plan: Plan, kind: Metered): string {
  const limit = LIMITS[plan][kind];
  if (kind === "round") return `You have used your ${limit} free rounds this month. Upgrade to Premium for unlimited rounds.`;
  return plan === "premium"
    ? `You have used all ${limit} swing analyses this month. More arrive on the 1st.`
    : `You have used your ${limit} free swing analyses this month. Upgrade to Premium for ${LIMITS.premium.swing} a month.`;
}

/** Start of the month the database counts in. */
export function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
