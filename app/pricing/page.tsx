import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Plus } from "lucide-react";

import { ManageBillingButton, PlanTable, UpgradeButton } from "@/components/billing/plan";
import { ButtonLink, RoundButton, ScreenTitle, Sparkle, TopBar } from "@/components/ui/primitives";
import { ASK_PER_DAY, LIMITS, type Plan } from "@/lib/billing/plans";
import { premiumPrice } from "@/lib/billing/stripe";
import * as repo from "@/lib/db/repo";
import { cn } from "@/lib/utils";

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
function Numbers({ plan }: { plan: Plan }) {
  const premium = plan === "premium";
  const rounds = LIMITS[plan].round;
  const items = [
    { value: LIMITS[plan].swing, label: "swings a month" },
    { value: rounds ?? "∞", label: "rounds a month" },
    { value: ASK_PER_DAY[plan], label: "AI answers a day" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item, index) => (
        <span key={item.label} className="flex flex-col items-center gap-1.5">
          <span
            className={cn(
              "font-display tabular flex h-16 w-16 items-center justify-center rounded-full leading-none",
              item.value === "∞" ? "text-[28px]" : "text-[24px]",
              !premium ? "bg-surface-2" : index === 0 ? "bg-accent text-white" : "bg-white text-[#1e211b]",
            )}
          >
            {item.value}
          </span>
          <span className={cn("text-center text-[11px] font-semibold", premium ? "text-[#c9ccbf]" : "text-fg-muted")}>
            {item.label}
          </span>
        </span>
      ))}
    </div>
  );
}

/** The marker on the plan the player is on. */
function YourPlan({ onInk = false }: { onInk?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[10px] font-bold uppercase tracking-[0.08em]",
        onInk ? "bg-white/10 text-white/85" : "bg-surface-2",
      )}
    >
      Your plan
    </span>
  );
}

export default async function PricingPage() {
  const user = await repo.currentUser();
  const [price, billing] = await Promise.all([premiumPrice(), user ? repo.getBilling(user.id) : null]);
  const plan = billing?.plan ?? null;

  return (
    <main className="mx-auto flex min-h-svh max-w-3xl flex-col gap-4 bg-bg px-5 pb-10 pt-4">
      <TopBar
        left={
          <RoundButton href="/" label="Back">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
      />
      <div className="flex flex-col gap-2.5">
        <ScreenTitle className="text-[52px] leading-[0.95]">Plans</ScreenTitle>
        <p className="text-[15px] leading-normal text-fg-muted">
          Start free. Go Premium when you want more swings, every round and the full strokes-gained picture.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <section aria-labelledby="plan-free" className="flex flex-col gap-4 rounded-[28px] bg-surface p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <h2 id="plan-free" className="text-[12px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
                Free
              </h2>
              <p className="font-display text-[44px] leading-none">$0</p>
              <p className="text-[13px] text-fg-subtle">To try the coach on a few swings and rounds.</p>
            </div>
            {plan === "free" ? <YourPlan /> : null}
          </div>
          <Numbers plan="free" />
          {plan === null ? (
            <ButtonLink href="/signup" variant="secondary" size="lg" className="mt-auto h-[54px]">
              Start free
            </ButtonLink>
          ) : null}
        </section>

        <section
          aria-labelledby="plan-premium"
          className="relative flex flex-col gap-4 overflow-hidden rounded-[28px] bg-ink p-5 text-white shadow-[var(--shadow-ink)]"
        >
          <svg aria-hidden width="160" height="160" viewBox="0 0 160 160" className="absolute -right-10 -top-10 opacity-[0.12]">
            <circle cx="80" cy="80" r="78" fill="none" stroke="#E8C547" strokeWidth="2" />
            <circle cx="80" cy="80" r="52" fill="none" stroke="#E8C547" strokeWidth="2" />
            <circle cx="80" cy="80" r="26" fill="none" stroke="#E8C547" strokeWidth="2" />
          </svg>
          <div className="relative flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <h2 id="plan-premium" className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.12em] text-gold">
                <Sparkle className="h-3 w-3" />
                Premium
              </h2>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-[44px] leading-none">{price?.amount ?? "Monthly"}</span>
                {price ? <span className="text-[14px] text-white/70">a {price.interval}</span> : null}
              </p>
              <p className="text-[13px] text-white/[0.72]">For players who practise and play every week. Cancel any time.</p>
            </div>
            {plan === "premium" ? <YourPlan onInk /> : null}
          </div>
          <Numbers plan="premium" />
          <div className="relative mt-auto flex flex-col gap-2.5">
            {plan === null ? (
              <>
                <ButtonLink href="/signup?plan=premium" variant="gold" size="lg" className="h-[54px]">
                  <Sparkle className="h-3.5 w-3.5" /> Get started
                </ButtonLink>
                <p className="text-center text-[12px] text-white/60">
                  Create your account and set up your profile, and you&apos;ll land back here to upgrade.
                </p>
              </>
            ) : plan === "free" ? (
              <UpgradeButton size="lg" variant="gold" className="h-[54px]" />
            ) : (
              <ManageBillingButton size="lg" variant="onHeroSolid" />
            )}
          </div>
        </section>
      </div>

      <section aria-labelledby="compare" className="flex flex-col gap-2 rounded-[28px] bg-surface p-[18px] shadow-[var(--shadow-card)]">
        <h2 id="compare" className="dsp mb-1 text-[22px] leading-none">
          Compare plans
        </h2>
        <PlanTable />
      </section>

      <section aria-labelledby="faq" className="flex flex-col gap-2">
        <h2 id="faq" className="dsp mb-1 text-[22px] leading-none">
          Questions
        </h2>
        {FAQ.map(([question, answer], index) => (
          <details key={question} open={index === 0} className="group rounded-[22px] bg-surface px-4 py-3.5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-bold [&::-webkit-details-marker]:hidden">
              {question}
              <Plus className="h-4 w-4 shrink-0 transition-transform group-open:rotate-45" strokeWidth={2.4} />
            </summary>
            <p className="mt-2 text-[13.5px] leading-normal text-fg-muted">{answer}</p>
          </details>
        ))}
      </section>

      <p className="border-t border-track pt-3.5 text-[13px] text-fg-subtle">
        Plans are covered by our{" "}
        <Link href="/terms" className="font-bold text-accent underline underline-offset-2">Terms of service</Link> and{" "}
        <Link href="/privacy" className="font-bold text-accent underline underline-offset-2">Privacy policy</Link>.
      </p>
    </main>
  );
}
