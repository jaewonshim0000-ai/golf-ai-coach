import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, Section } from "@/components/legal/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy" };

/*
  Written from what the app actually stores and sends (see
  docs/commercial-readiness.md, "Blockers" 1). Change it when that changes:
  a new table, a new processor, or a new kind of data sent to the model.
*/
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        Golf AI Coach is run by {LEGAL.company}, {LEGAL.address} (&ldquo;we&rdquo;). This policy explains what we keep about
        you, why, who helps us run the service, and what you can do about it.
      </p>

      <Section title="What we keep">
        <ul>
          <li>
            <strong>Your account:</strong> email address, name and password. Our database provider stores the password as a
            one-way hash, so we never see it.
          </li>
          <li>
            <strong>Your golf profile:</strong> handicap and its history, experience, typical score, common miss, swing
            pattern, driver distance, goals, practice time and places, dominant hand and the clubs in your bag.
          </li>
          <li>
            <strong>Your golf records:</strong> courses you add, rounds, scorecards and individual shots, practice sessions,
            drill and test results, and the practice priorities you save.
          </li>
          <li>
            <strong>Your swing videos:</strong> the clips you record or upload, in private storage that only your account can
            read.
          </li>
          <li>
            <strong>What we measure from your videos:</strong> body-point positions (where your joints are in each frame) and
            the timing, setup marks and scores worked out from them. This tracking runs in your own browser. Only the
            measured points are uploaded, not extra copies of the video.
          </li>
          <li>
            <strong>Reference clips</strong> you add, with the name and source you give them.
          </li>
          <li>
            <strong>Your plan:</strong> whether you are on Free or Premium, renewal dates, and how many rounds, swing
            analyses and AI coach answers you have used. Card details are held by Stripe, not by us.
          </li>
        </ul>
        <p>
          We use this data only to run the app for you: to show your records, measure your swing, rank what to practise and
          apply your plan&apos;s allowances. We do not sell it, and we do not use it for advertising.
        </p>
      </Section>

      <Section title="Who helps us run it">
        <ul>
          <li>
            <strong>Supabase</strong> hosts the database, sign-in and video storage, in {LEGAL.dataRegion}.
          </li>
          <li>
            <strong>Vercel</strong> hosts the app and its servers.
          </li>
          <li>
            <strong>Stripe</strong> takes Premium payments and holds your card and invoices.
          </li>
          <li>
            <strong>Anthropic</strong> writes coaching text. To do that it receives your golf profile, the statistics we
            computed from your rounds, practice and swings, and any question you ask the coach. It never receives your
            videos or frames from them. Anthropic does not train its models on this data.
          </li>
          <li>
            <strong>Google and jsDelivr</strong> serve the body-tracking model and the code that runs it in your browser.
            Your browser downloads these files from them, so they see your IP address. Your video is never sent to them.
          </li>
          <li>
            <strong>Sentry</strong>, when switched on, receives error reports (what failed, on which page, in which browser)
            so we can fix problems. We set it not to collect your name or email.
          </li>
        </ul>
      </Section>

      <Section title="Cookies and storage on your device">
        <p>
          We use only the cookies needed to keep you signed in. There are no advertising or tracking cookies. In demo mode,
          clips can be kept in your browser&apos;s own storage.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          We keep your data while you have an account. When you delete your account, we delete your records and videos
          straight away and cancel any subscription. Database backups can hold a copy for up to {LEGAL.backupDays} days
          after that. Stripe keeps payment records for as long as tax and accounting law requires.
        </p>
      </Section>

      <Section title="Your choices and rights">
        <ul>
          <li>
            <strong>See and take your data:</strong> Profile → Download my data gives you a JSON file of your records. It
            includes your video file paths, not the files themselves. Write to us for copies of your videos or the full
            body-point tracks.
          </li>
          <li>
            <strong>Correct it:</strong> edit your profile, rounds and practice in the app.
          </li>
          <li>
            <strong>Delete it:</strong> Profile → Delete account removes everything at once. You can also delete single
            rounds, practices and swings.
          </li>
          <li>
            <strong>Object or complain:</strong> write to <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>. You can
            also complain to your local data-protection authority.
          </li>
        </ul>
      </Section>

      <Section title="Children">
        <p>
          Golf AI Coach is not for anyone under {LEGAL.minAge}. If you believe a younger person has an account, tell us and
          we will delete it.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Every record is tied to your account and protected by database rules, so other players cannot read it. Videos sit
          in a private bucket and play through links that expire. All traffic uses HTTPS. No system is perfectly secure. If
          a breach affects you, we will tell you as the law requires.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we change this policy in a way that matters, we will tell you in the app or by email before it applies. The
          date at the top shows the current version. Use of the app is also covered by our{" "}
          <Link href="/terms">Terms of service</Link>.
        </p>
      </Section>
    </LegalPage>
  );
}
