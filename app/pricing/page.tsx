import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ManageBillingButton, PlanTable, UpgradeButton } from "@/components/billing/plan";
import { ButtonLink, Card, InkCard, RoundButton, ScreenTitle, StatCircle, TopBar } from "@/components/ui/primitives";
import { ASK_PER_DAY, LIMITS, type Plan } from "@/lib/billing/plans";
import { premiumPrice } from "@/lib/billing/stripe";
import * as repo from "@/lib/db/repo";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Golf AI Coach is free to start. Premium adds more swing analyses, unlimited rounds and the full strokes-gained breakdown.",
};

const FAQ: [question: string, answer: string][] = [
  [
    "What counts as a swing analysis?",
    "Each new swing or reference clip you add. Looking at a swing again is free, and deleting one does not give it back.",
  ],
  [
    "When do allowances reset?",
    "Swing analyses and rounds on the 1st of each month, AI coach answers at midnight. Both in UTC.",
  ],
  [
    "Can I cancel?",
    "Any time, from Profile → Manage billing. You keep Premium until the end of the month you paid for, then go back to Free with all your data.",
  ],
  [
    "How do I pay?",
    "By card, through Stripe. Premium is billed monthly in advance, plus any tax that applies. We never see your card number.",
  ],
];

/** The plan's headline numbers as the design's stat circles. */
function Numbers({ plan, tone }: { plan: Plan; tone: "stone" | "white" }) {
  const rounds = LIMITS[plan].round;
  return (
    <div className="grid grid-cols-3 gap-2">
      <StatCircle tone={tone} value={LIMITS[plan].swing} label="Swings a month" />
      <StatCircle tone={tone} value={rounds ?? "∞"} label="Rounds a month" />
      <StatCircle tone={tone} value={ASK_PER_DAY[plan]} label="AI answers a day" />
    </div>
  );
}

const current = "dsp flex h-14 items-center justify-center rounded-full text-[13px]";

export default async function PricingPage() {
  const user = await repo.currentUser();
  const [price, billing] = await Promise.all([premiumPrice(), user ? repo.getBilling(user.id) : null]);
  const plan = billing?.plan ?? null;

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-5 bg-bg px-5 pb-16 pt-4">
      <TopBar
        left={
          <RoundButton href="/" label="Back">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
      />
      <div className="flex flex-col gap-2.5">
        <ScreenTitle>Plans</ScreenTitle>
        <p className="text-[15px] leading-relaxed text-fg-muted">
          Start free. Go Premium when you want more swings, every round and the full strokes-gained picture.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="dsp text-[12px] tracking-[0.1em] text-fg-muted">Free</h2>
            <p className="font-display text-[44px] leading-none">$0</p>
            <p className="text-[13px] text-fg-muted">To try the coach on a few swings and rounds.</p>
          </div>
          <Numbers plan="free" tone="stone" />
          <div className="mt-auto">
            {plan === null ? (
              <ButtonLink href="/signup" variant="secondary" size="lg">Start free</ButtonLink>
            ) : plan === "free" ? (
              <p className={`${current} bg-surface-2 text-fg-muted`}>Your plan</p>
            ) : null}
          </div>
        </Card>

        <InkCard className="flex flex-col gap-5 p-5">
          <div className="flex flex-col gap-1.5">
            <h2 className="dsp text-[12px] tracking-[0.1em] text-gold">Premium</h2>
            <p className="flex items-baseline gap-2">
              <span className="font-display text-[44px] leading-none">{price?.amount ?? "Monthly"}</span>
              {price ? <span className="text-[14px] text-white/70">a {price.interval}</span> : null}
            </p>
            <p className="text-[13px] text-white/70">For players who practise and play every week. Cancel any time.</p>
          </div>
          <Numbers plan="premium" tone="white" />
          <div className="mt-auto flex flex-col gap-2.5">
            {plan === null ? (
              <>
                <ButtonLink href="/signup" size="lg">Get started</ButtonLink>
                <p className="text-center text-[12px] text-white/60">Create your free account, then upgrade from your profile.</p>
              </>
            ) : plan === "free" ? (
              <UpgradeButton size="lg" />
            ) : (
              <>
                <p className={`${current} bg-white/10 text-white/80`}>Your plan</p>
                <ManageBillingButton size="lg" variant="onHeroSolid" />
              </>
            )}
          </div>
        </InkCard>
      </div>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="dsp text-[22px] leading-none">Compare plans</h2>
        <PlanTable />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="dsp text-[22px] leading-none">Questions</h2>
        <dl className="flex flex-col gap-4 text-[15px] leading-relaxed">
          {FAQ.map(([question, answer]) => (
            <div key={question}>
              <dt className="font-semibold">{question}</dt>
              <dd className="text-fg-muted">{answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="border-t border-border pt-4 text-[13px] text-fg-muted">
        Plans are covered by our{" "}
        <Link href="/terms" className="font-semibold text-accent underline underline-offset-2">Terms of service</Link> and{" "}
        <Link href="/privacy" className="font-semibold text-accent underline underline-offset-2">Privacy policy</Link>.
      </p>
    </main>
  );
}
