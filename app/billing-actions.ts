"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import * as repo from "@/lib/db/repo";
import { planFor } from "@/lib/billing/plans";
import { billingConfigured, customerFor, stripe } from "@/lib/billing/stripe";

/** Where Stripe sends the player back to: the address they are using now. */
async function origin(): Promise<string> {
  const h = await headers();
  return h.get("origin") ?? `https://${h.get("host")}`;
}

/**
 * Stripe-hosted pages for the signed-in player: checkout to upgrade, or the
 * customer portal to change card, see invoices or cancel. A player who already
 * has Premium is sent to the portal, so a second click never buys twice.
 */
async function billingPage(want: "upgrade" | "manage"): Promise<never> {
  const user = await repo.currentUser();
  if (!user) redirect("/login");
  if (repo.mode() !== "supabase" || !billingConfigured()) redirect("/profile?billing=unavailable#plan");

  let url: string | null;
  try {
    const customer = await customerFor(user);
    const base = await origin();
    url =
      want === "manage" || planFor(customer.status) === "premium"
        ? (await stripe().billingPortal.sessions.create({ customer: customer.id, return_url: `${base}/profile#plan` })).url
        : (
            await stripe().checkout.sessions.create({
              mode: "subscription",
              customer: customer.id,
              client_reference_id: user.id,
              line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
              allow_promotion_codes: true,
              success_url: `${base}/profile?checkout={CHECKOUT_SESSION_ID}#plan`,
              cancel_url: `${base}/profile#plan`,
            })
          ).url;
  } catch (error) {
    console.error("billing", error);
    url = null;
  }
  redirect(url ?? "/profile?billing=error#plan");
}

export async function upgradeAction(): Promise<void> {
  await billingPage("upgrade");
}

export async function manageBillingAction(): Promise<void> {
  await billingPage("manage");
}
