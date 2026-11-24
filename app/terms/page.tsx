import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, Section } from "@/components/legal/legal-page";
import { LIMITS } from "@/lib/billing/plans";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of service" };

/* The plan numbers come from lib/billing/plans.ts, so these terms never disagree with the app. */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms are an agreement between you and {LEGAL.company} (&ldquo;we&rdquo;) for your use of Golf AI Coach. By
        creating an account you accept them and our <Link href="/privacy">Privacy policy</Link>.
      </p>

      <Section title="Your account">
        <p>
          You must be at least {LEGAL.minAge} to create an account. Keep your password to yourself; you are responsible for
          what happens under your account. One account is for one person.
        </p>
      </Section>

      <Section title="Free and Premium">
        <ul>
          <li>
            <strong>Free</strong> includes {LIMITS.free.swing} swing analyses and {LIMITS.free.round} rounds a month.
          </li>
          <li>
            <strong>Premium</strong> includes {LIMITS.premium.swing} swing analyses a month, unlimited rounds and the full
            strokes-gained breakdown.
          </li>
          <li>Both plans include a daily number of AI coach answers, shown under Plan in your profile.</li>
          <li>
            Monthly allowances reset on the 1st (UTC) and daily ones at midnight UTC. Deleting a round or swing does not give
            it back.
          </li>
        </ul>
      </Section>

      <Section title="Payment, renewal and cancelling">
        <ul>
          <li>Premium is billed monthly, in advance, at the price shown at checkout, plus any tax that applies.</li>
          <li>
            It renews every month until you cancel. Cancel any time from Profile → Manage billing. You keep Premium until the
            end of the month you paid for, and then return to Free with your data intact.
          </li>
          <li>If a renewal payment fails, Premium stops until the payment goes through.</li>
          <li>Refunds: {LEGAL.refunds}.</li>
          <li>We will tell you at least 30 days before a price change applies to you. You can cancel before it does.</li>
        </ul>
      </Section>

      <Section title="Your content">
        <p>
          Your videos, records and the measurements taken from them stay yours. You give us permission to store and process
          them only to run the app for you, as the <Link href="/privacy">Privacy policy</Link> describes. Upload reference
          clips only if you have the right to use them; we do not check who appears in a clip or who owns it.
        </p>
      </Section>

      <Section title="What the coaching is, and is not">
        <ul>
          <li>
            Swing analysis estimates body positions from ordinary video. Camera angle, lighting, clothing and frame rate
            change the results. Scores and measurements are guides, not certified measurements, and have not been validated
            against lab equipment.
          </li>
          <li>
            Coaching text is written by an AI model or by rules from your own data. It can be wrong. It is not medical
            advice or a substitute for a qualified coach.
          </li>
          <li>Golf and practice carry a risk of injury. Warm up, know your limits, and stop if something hurts.</li>
        </ul>
      </Section>

      <Section title="Fair use">
        <p>
          Don&apos;t misuse the service: no automated access or scraping, no attempts to get around plan limits or read other
          players&apos; data, no attacks on the service, and no unlawful or abusive content. We may suspend or close an
          account that does these things, and will tell you why unless the law forbids it.
        </p>
      </Section>

      <Section title="Ending this agreement">
        <p>
          You can stop at any time: Profile → Delete account removes your data and cancels Premium at once, with no refund
          of the current month unless the refund terms above say otherwise. We may end the service with at least 30
          days&apos; notice, and will give you time to download your data.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          The app is provided as it is. As far as the law allows, we are not liable for indirect losses. Our total liability
          to you is limited to what you paid us in the 12 months before the claim. Nothing here limits rights you have as a
          consumer that the law does not allow us to limit.
        </p>
      </Section>

      <Section title="Changes and law">
        <p>
          If we change these terms in a way that matters, we will tell you in the app or by email at least 30 days before
          they apply. These terms are governed by {LEGAL.jurisdiction}.
        </p>
      </Section>
    </LegalPage>
  );
}
