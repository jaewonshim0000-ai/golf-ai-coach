import Stripe from "stripe";
import { unstable_cache } from "next/cache";
import { createClient } from "@supabase/supabase-js";

import { formatPrice, planFor, type Price } from "./plans";

/**
 * Server-only Stripe wiring. The service-role key is used for one table,
 * public.subscriptions, which players can read but never write. Never import
 * this from a client component.
 */

export function billingConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_ID &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
}

let client: Stripe | undefined;
export function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Billing is not set up.");
  return (client ??= new Stripe(key));
}

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Read from Stripe so the price shown is always the one checkout charges. Throws so a failure is not cached. */
const cachedPrice = unstable_cache(
  async (id: string): Promise<Price | null> => {
    const price = await stripe().prices.retrieve(id);
    if (price.unit_amount === null) return null;
    return { amount: formatPrice(price.unit_amount, price.currency), interval: price.recurring?.interval ?? "month" };
  },
  ["premium-price"],
  { revalidate: 3600 },
);

/** Premium's price, cached for an hour; null when billing is not set up or Stripe cannot be reached. */
export async function premiumPrice(): Promise<Price | null> {
  if (!billingConfigured()) return null;
  return cachedPrice(process.env.STRIPE_PRICE_ID!).catch((error) => {
    console.error("premiumPrice", error);
    return null;
  });
}

/** The fields the app keeps from a customer's subscriptions (newest first, as Stripe lists them). */
export function subscriptionRow(subscriptions: Stripe.Subscription[]) {
  // A cancelled old subscription must not hide a live one.
  const sub = subscriptions.find((s) => planFor(s.status) === "premium") ?? subscriptions[0];
  const end = sub?.cancel_at ?? sub?.items.data[0]?.current_period_end ?? null;
  return {
    stripe_subscription_id: sub?.id ?? null,
    status: sub?.status ?? null,
    current_period_end: end === null ? null : new Date(end * 1000).toISOString(),
    cancel_at_period_end: Boolean(sub && (sub.cancel_at_period_end || sub.cancel_at)),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Copy a customer's current subscription from Stripe. Webhooks can arrive
 * late or out of order, so this always reads Stripe rather than the event.
 */
export async function syncCustomer(customerId: string): Promise<void> {
  const db = admin();
  const { data: row, error } = await db.from("subscriptions").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
  if (error) throw new Error(`syncCustomer: ${error.message}`);
  if (!row) return; // Not created by this app, or the account was deleted.
  const { data } = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 10 });
  const { error: writeError } = await db.from("subscriptions").update(subscriptionRow(data)).eq("stripe_customer_id", customerId);
  if (writeError) throw new Error(`syncCustomer: ${writeError.message}`);
}

/** Checkout returns before its webhook may land; sync now so the plan shows at once. */
export async function syncCheckout(sessionId: string, userId: string): Promise<void> {
  const session = await stripe().checkout.sessions.retrieve(sessionId);
  if (session.client_reference_id === userId && typeof session.customer === "string") {
    await syncCustomer(session.customer);
  }
}

/** The player's Stripe customer, created on their first checkout. */
export async function customerFor(user: { id: string; email: string }): Promise<{ id: string; status: string | null }> {
  const db = admin();
  const { data, error } = await db.from("subscriptions").select("stripe_customer_id,status").eq("user_id", user.id).maybeSingle();
  if (error) throw new Error(`customerFor: ${error.message}`);
  if (data) return { id: data.stripe_customer_id, status: data.status };
  // Stripe replays the same customer for this key for 24 h, so a double click cannot make two.
  const customer = await stripe().customers.create(
    { email: user.email || undefined, metadata: { user_id: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  const { error: insertError } = await db
    .from("subscriptions")
    .upsert({ user_id: user.id, stripe_customer_id: customer.id }, { onConflict: "user_id", ignoreDuplicates: true });
  if (insertError) throw new Error(`customerFor: ${insertError.message}`);
  return { id: customer.id, status: null };
}

/** Stop billing before an account is deleted. Deleting the customer cancels its subscriptions at once. */
export async function deleteCustomer(userId: string): Promise<void> {
  if (!billingConfigured()) return;
  const { data, error } = await admin().from("subscriptions").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`deleteCustomer: ${error.message}`);
  if (!data) return;
  try {
    await stripe().customers.del(data.stripe_customer_id);
  } catch (cause) {
    // Already removed in the Stripe dashboard: nothing left to bill.
    if ((cause as { code?: string }).code !== "resource_missing") throw cause;
  }
}
