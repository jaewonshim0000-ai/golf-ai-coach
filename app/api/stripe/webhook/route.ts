import type Stripe from "stripe";

import { stripe, syncCustomer } from "@/lib/billing/stripe";

/** The events that can change a player's plan. Add these in the Stripe webhook settings. */
const EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

/**
 * Stripe calls this; there is no signed-in player. The signature is the only
 * proof the request came from Stripe, so nothing is read before it checks out.
 * A failed sync returns 500 and Stripe retries it.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Webhook not configured", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await request.text(), signature, secret);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (EVENTS.has(event.type)) {
    const { customer } = event.data.object as { customer?: string | { id: string } | null };
    const id = typeof customer === "string" ? customer : customer?.id;
    if (id) await syncCustomer(id);
  }
  return Response.json({ received: true });
}
