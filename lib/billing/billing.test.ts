import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

import { monthStart, planFor, remaining } from "./plans";
import { subscriptionRow } from "./stripe";

const sub = (id: string, status: string, extra: Partial<Stripe.Subscription> = {}) =>
  ({
    id,
    status,
    cancel_at: null,
    cancel_at_period_end: false,
    items: { data: [{ current_period_end: 1_800_000_000 }] },
    ...extra,
  }) as unknown as Stripe.Subscription;

test("billing: Stripe subscriptions map to the plan the app enforces", () => {
  // A newer cancelled subscription must not hide a live one.
  const row = subscriptionRow([sub("sub_new", "canceled"), sub("sub_live", "active")]);
  assert.equal(row.stripe_subscription_id, "sub_live");
  assert.equal(planFor(row.status), "premium");
  assert.equal(row.current_period_end, new Date(1_800_000_000_000).toISOString());
  assert.equal(row.cancel_at_period_end, false);

  // Cancelling in the portal keeps Premium until the period ends.
  const ending = subscriptionRow([sub("sub", "active", { cancel_at: 1_799_000_000 })]);
  assert.equal(ending.cancel_at_period_end, true);
  assert.equal(ending.current_period_end, new Date(1_799_000_000_000).toISOString());

  // No subscription, or a failed payment, is Free.
  assert.deepEqual({ ...subscriptionRow([]), updated_at: null }, {
    stripe_subscription_id: null, status: null, current_period_end: null, cancel_at_period_end: false, updated_at: null,
  });
  assert.equal(planFor("past_due"), "free");
  assert.equal(planFor("trialing"), "premium");

  assert.equal(remaining({ plan: "free", status: null, periodEnd: null, cancelAtPeriodEnd: false, used: { swing: 5, round: 1 } }, "swing"), 0);
  assert.equal(remaining({ plan: "premium", status: "active", periodEnd: null, cancelAtPeriodEnd: false, used: { swing: 5, round: 40 } }, "round"), null);
  assert.equal(monthStart(new Date("2026-11-30T23:59:00Z")), "2026-11-01T00:00:00.000Z");
});
