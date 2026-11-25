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

/**
 * Ask Coach answers written by the model, per player per UTC day. Past these
 * the answer is rule-based. claim_ai_answer in 0013_ask_limit.sql enforces the
 * same numbers, and migrations.test.ts checks the two agree.
 */
export const ASK_PER_DAY = { free: 5, premium: 50 } as const satisfies Record<Plan, number>;

/** The note under a rule-based answer once the day's model answers are used. */
export function askLimitMessage(plan: Plan): string {
  return plan === "premium"
    ? `You've used today's ${ASK_PER_DAY.premium} AI coach answers; more tomorrow`
    : `You've used today's ${ASK_PER_DAY.free} AI coach answers; Premium has ${ASK_PER_DAY.premium} a day`;
}

const perMonth = (limit: number | null) => (limit === null ? "Unlimited" : `${limit} a month`);

/** What each plan includes, row by row, for the pricing page and the upgrade popup. null: not included. */
export const FEATURES: { label: string; free: string | null; premium: string }[] = [
  { label: "Swing analyses", free: perMonth(LIMITS.free.swing), premium: perMonth(LIMITS.premium.swing) },
  { label: "Rounds", free: perMonth(LIMITS.free.round), premium: perMonth(LIMITS.premium.round) },
  { label: "AI coach answers", free: `${ASK_PER_DAY.free} a day`, premium: `${ASK_PER_DAY.premium} a day` },
  { label: "Strokes-gained breakdown", free: null, premium: "Included" },
  { label: "Practice plans and tests", free: "Unlimited", premium: "Unlimited" },
];

/** Premium's price as Stripe charges it, ready to show: amount "$9.99", interval "month". */
export type Price = { amount: string; interval: string };

/** "$9.99 a month"; before billing is set up there is no price to show. */
export function priceText(price: Price | null): string {
  return price ? `${price.amount} a ${price.interval}` : "Billed monthly";
}

/** Stripe amounts are in the currency's smallest unit: 999 usd is $9.99, 9900 krw is ₩9,900. */
export function formatPrice(unitAmount: number, currency: string): string {
  const code = currency.toUpperCase();
  const digits = new Intl.NumberFormat("en-US", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  const amount = unitAmount / 10 ** digits;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : digits,
  }).format(amount);
}

/** Start of the month the database counts in. */
export function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
