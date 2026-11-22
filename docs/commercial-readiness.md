# Commercial readiness audit

Audited 2026-11-22 against `main` at `ef595fc` (after PR #27). The question: does every part of Golf AI Coach work as intended for paying players?

**Short answer:** the core app is in good shape. Data isolation, plan limits and secrets are done carefully. Five things stand between it and charging money:

- legal pages
- the landing page's placeholder copy
- a spending cap on the AI coach
- one real Stripe test purchase
- confirmed auth email delivery

None of them is a large code change. Most need a decision or an account setting from you. Five small bugs found on the way are fixed in PRs #28–#32.

## How this was checked

- **Code.** Read every server path: `app/actions.ts`, `app/billing-actions.ts`, `app/api/*`, `app/auth/callback`, `lib/db/repo.ts`, `lib/billing/*`, `lib/ai/*`, the auth forms, and all 12 migrations.
- **Tests.** `npm test` passes, 345 of 345, and `npx tsc --noEmit` is clean, both on `main`. With PRs #28–#32 the count rises to 349.
- **Browser, signed out.** The local dev server ran against the real Supabase project for `/`, `/login`, `/signup`, `/reset`, `/reset/confirm`, `/auth/callback`, the 404 page, the manifest and the API routes, at 390px and 1280px wide.
- **Browser, signed in.** Every app page ran in demo mode at 360px, 390px and 1280px: Practice, Drills, History, Start, Play, New round, Handicap, Strokes gained, Profile, Swing, References, and a round, swing and practice detail page. Claude can't sign in to the real project, so signed-in pages were only seen with demo data.
- **Live row-level security.** Read-only requests to the production Supabase REST and Storage APIs, using the public anon key that every browser already has.
- **Git history.** Scanned for committed Stripe, Anthropic and Supabase service keys. None were found.

## Blockers

### 1. No privacy policy or terms of service

- **Found:** `/privacy` and `/terms` return 404. No page, footer or signup form links to either. Signup asks for no agreement.
- **Why it blocks:** a paid product that stores swing videos and body-pose tracks needs both before taking money. Stripe and the app stores also expect them.
- **What the privacy policy has to cover:**
  - The data kept: email, name, handicap and profile, rounds and shots, practice results, swing videos, and the body tracks measured from them.
  - Who processes it:
    - Supabase: database, auth and video storage.
    - Vercel: hosting.
    - Stripe: billing.
    - Anthropic: coaching text. The player's profile and computed stats are sent in prompts; videos and frames are not.
    - Google and jsDelivr: they serve the MediaPipe model and WebAssembly that run in the browser. No video goes to them.
  - How long data is kept.
  - Deletion and export. Both exist: Profile → **Delete account** and **Download my data**.
  - A minimum age.
- **What the terms have to cover:** renewal, cancellation and refunds for Premium.
- **Checked:** grep of `app/` and `components/`, and requests to both paths.
- **Not verified:** the wording is yours, or a lawyer's. Nothing was drafted.

### 2. The landing page shows placeholder text and claims the app doesn't make

Every signed-out desktop visitor at `/` sees these (`components/landing/desktop-landing.tsx`):

- Two paragraphs of Lorem ipsum, for Swing Lab and Caddie AI.
- Performance claims the app does not measure: "+9 yards avg gain", "−2.3 putts per round", "0.1° slope accuracy" and "240 FPS capture". Uploads are whatever the phone recorded.
- Features the app does not have: a "Green Reader" chapter, a "24/7 on-call caddie" and "1 tap club pick".
- "© Golf AI Coach, Inc.", which names a company.

Unbacked performance claims on a page that sells a subscription are a consumer-protection risk. The fix is new copy, which only you can supply or approve.

- **Checked:** the page text in the browser, and the component source.

### 3. AI spending has no cap

- **What any signed-in account can do:** Ask Coach (`askAction`) calls Anthropic on every question, with no per-player or global limit. Any free signup can script it in a loop.
- **Other model calls:** the round and practice read-outs call the model when the page renders. They are cached only in that server instance's memory: 64 entries for 30 minutes, in `cachedCoach`.
- **No bot check:** signup has no CAPTCHA.
- **What to do:**
  1. **You, now:** set a monthly spend limit on the Anthropic workspace that holds `ANTHROPIC_API_KEY`.
  2. **Code:** a per-player daily cap on model answers, stored in Postgres, with the rule-based answer after the cap. It needs a migration and a number from you, possibly a different one for Free and Premium.
  3. **You:** turn on Supabase Auth CAPTCHA (Turnstile or hCaptcha) for signup.
- **Checked:** code read of `askAction`, `lib/ai/ask.ts`, `lib/ai/provider.ts` and `cachedCoach`.
- **Not verified:** the real tokens per call. The local server ran without an API key.

### 4. Stripe has never completed a purchase, and live mode is not set up

- **What the code does right:**
  - Checkout and the portal are created server-side.
  - The webhook verifies Stripe's signature before reading anything. Locally, an unsigned POST got 400.
  - Plan status is copied from Stripe, not from the event body.
  - Only the service-role key can write `subscriptions`.
  - Limits are enforced by a database trigger, and the trigger's numbers are tested against `lib/billing/plans.ts`.
  - Production has the `subscriptions` and `usage_events` tables, so 0012 is applied.
- **What blocks:** no real test-mode purchase, webhook or cancellation has run (see `README.md`). The local `.env.local` has no Stripe keys, so none could run here.
- **Before charging, in test mode:** buy with `4242 4242 4242 4242`, confirm Profile shows Premium, cancel in **Manage billing**, and confirm it shows "Premium ends …".
- **To switch to live mode:**
  - Create a live product and monthly price, and set `STRIPE_PRICE_ID` to it.
  - Set the live `STRIPE_SECRET_KEY`.
  - Add a live webhook endpoint with the same four events, and set its own `STRIPE_WEBHOOK_SECRET`. Test and live secrets differ.
  - Save the customer portal settings again in live mode.
  - Set the business name, statement descriptor and support email.
  - Decide whether to collect tax. Stripe Tax needs `automatic_tax` on Checkout.
  - Add the terms URL in Stripe if Checkout should ask for agreement.
  - **Clear test rows:** run `delete from public.subscriptions;` once, right before switching, if every row is from test mode. A stored test-mode customer id makes live Checkout fail with "No such customer". The player sees "Could not open Stripe."

### 5. Auth emails may not reach players

- **Why it might block:** Supabase's built-in mailer only delivers to the project's team members (see `README.md`, step 5). Without custom SMTP, new players never get the confirmation email and can't reset a password. The sign-in page already handles the `email_address_not_authorized` error this produces.
- **Not verified:** whether custom SMTP is set up in the Supabase dashboard. If it is, this item is done.
- **What to set up:** the sending domain needs SPF, DKIM and DMARC records so messages don't land in spam. Also confirm that both email templates link to the production domain.

## Should fix

1. **Free players see strokes-gained numbers.** The README says Free has no strokes-gained breakdowns, and `/rounds/insights` and the round page are gated. But Free players still get the numbers in two places:
   - The Practice priority card: "Costing you 1.2 strokes a round".
   - Ask Coach answers, whose segment and round entries show strokes per round.

   This may be intended, as a teaser for Premium. Decide, and the gate can follow.
2. **No error monitoring.** Errors go to `console.error` only, and Vercel keeps runtime logs briefly. A production failure is invisible unless a player reports it. Add Sentry's Next.js SDK, or a service you prefer.
3. **Video storage has no quota.** The Storage policy lets a signed-in player upload any number of 50 MB files to their own folder, straight through the Storage API. The swing meter counts `swing_sessions` rows, not files. A free account can fill the bucket. The fix is a Storage insert policy or trigger that caps files per player, which needs a migration.
4. **Data export is incomplete, and slow for long histories.** `/api/export` leaves out:
   - the swing analyses (`pose_model`: scores, phases, references)
   - the plan and usage history (`subscriptions`, `usage_events`)

   It also reads each practice session in its own three requests, all at once. A player with hundreds of sessions can hit a timeout.
5. **No automatic tests on PRs.** The only check on GitHub is the Vercel build. `npm test` and `tsc` run only when someone remembers. A small GitHub Actions workflow would run both.
6. **Premium ends the moment a payment fails.** `planFor` treats `past_due` as Free. Stripe keeps retrying the card for days, so a player whose renewal failed once loses Premium during the retries. Decide whether to allow a grace period.
7. **Supabase Auth settings to confirm in the dashboard:**
   - Minimum password length of 8. The form asks for 8; Supabase's default is 6, so the API accepts 6.
   - The redirect allow-list includes the reset link's `…/auth/callback?next=/reset/confirm`. Allowing `https://<domain>/auth/callback**` covers it.
   - Email confirmation is on.

## Nice to have

1. **Home-screen icons.** The manifest's only icon is an SVG, and there is no `apple-touch-icon`, so an iPhone home screen shows a page screenshot. Add 192px and 512px PNG icons and an `app/apple-icon.png`. The manifest's `theme_color` (#5c7a2a) also differs from the page's theme colours.
2. **Unknown links return 200.** An unknown round, swing or practice id shows the 404 page with HTTP 200, because the page streams after `loading.tsx`. Next adds `noindex`, so this is cosmetic.
3. **No `robots.txt` or `sitemap.xml`.** They matter only once the landing page should rank.
4. **Server-only guard.** Add `import "server-only"` to `lib/billing/stripe.ts` and `lib/ai/provider.ts`, so an accidental client import fails the build. No client file imports them today.
5. **Dead code that could send video frames to the model.** `analyzeSwingAction` and `lib/ai/vision.ts` are reachable from no screen, and neither is the model path of `lib/ai/coaching.ts`. Deleting them removes a costly path and a privacy question.
6. **A rare double subscription.** A player who pays in one tab and clicks Upgrade in another, before the webhook lands, can start a second subscription.
7. **Old PRs.** PRs #3 and #4 are still open from October.

## Fixed during this audit

| PR | Bug | Test |
|---|---|---|
| #28 | The drill library scrolled sideways on phones: 33px at 360px wide. Two other grids had the same flaw. | Checked in the browser at 360px, 390px and 1280px |
| #29 | Account deletion removed at most 1,000 videos and ignored a failed folder list, leaving files after the account was gone. | 3 unit tests |
| #30 | Any site could frame the app (clickjacking on Delete account and billing). Added `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff` and a referrer policy. | Headers checked with `curl -I`. The browser blocked an iframe. |
| #31 | A failure in the app layout, such as a Supabase blip, showed Next's bare "Application error" page. Added a root error page. | Forced a layout error in the browser: before and after |
| #32 | Ask Coach and the round and practice read-outs had no timeout: up to 10 minutes and 2 retries. Every model call now gets 20 seconds, then its fallback. | 1 unit test |

None of them needs a migration.

## Checked and working

- **Sign-in redirect is safe.** `/auth/callback` keeps `next` on the same origin: `//evil.com` falls back to the app. A missing or bad code returns to `/login?error=auth`.
- **Signed-out visitors are redirected.** App pages go to `/login`. `/setup` sends a configured deployment to the app. Below 768px, `/` shows sign-in; on desktop it shows the landing page, with its 3D scene only on desktop.
- **Row-level security is on everywhere.**
  - All 19 tables have RLS, with owner policies.
  - Child rows (practice items, plan rows, measurements) check the parent's owner.
  - `subscriptions` and `usage_events` are read-only to players.
  - The `swing-videos` bucket is private, and its policy is per-folder.
  - Live, a signed-out caller reads 0 rows from every table and lists nothing in the bucket.
  - PGlite tests run the real migrations and check isolation between two users.
- **Secrets stay on the server.** Only `NEXT_PUBLIC_SUPABASE_*` reaches the browser. The Stripe, webhook, service-role and Anthropic keys are read only in server modules, and no client component imports them. `.env*` is ignored, except `.env.example`.
- **Plan limits are enforced in the database.**
  - The insert trigger takes an advisory lock, so two saves can't share the last slot.
  - Deleting a swing does not give an analysis back.
  - The New round and Add swing screens stop at zero.
  - A video that uploaded before the limit refused its save is removed again.
- **Account deletion.** It cancels Stripe first, then removes the videos, then the auth user, and every table cascades from it. The definer function can only delete the caller.
- **Score calibration is local-only.** `/swing/calibrate` returns 404 outside `next dev`, and its actions refuse to run there.
- **Error and loading states.** There are styled 404, error and loading pages. Server reads retry gateway errors.

## Decisions only you can make

1. **Legal wording.** Who writes the privacy policy and terms? Which company name goes in the copyright line? What is the minimum age?
2. **Landing copy.** Replacement text for the placeholder paragraphs and the unbacked stats.
3. **Pricing.**
   - The Premium price and currency.
   - Whether there is a trial.
   - Tax collection.
   - The refund policy.
   - A grace period after a failed payment.
   - Whether Free players see the strokes-gained headline.
4. **AI limits.** An Anthropic spend limit, and the daily Ask Coach cap per plan.
5. **Stripe live keys.** When to switch, plus the live webhook and portal setup.
6. **Domain.** Stay on `golf-ai-coach-alpha.vercel.app` or move to a custom domain? The domain also sets the Supabase Site URL and redirect URLs, the Stripe webhook URL, and the email sender domain.
7. **Auth email.** Is custom SMTP already set up in Supabase?
8. **Error monitoring.** Which service to use.
9. **Migrations.** None is needed for PRs #28–#32. The AI cap and the storage quota would each need one, run before their deploy.

## Not verified

- **Any signed-in flow on the real Supabase project.** Claude can't type your password. App pages were seen only with demo data. Run the README's two-account checklist before inviting players.
- **Swing recording and analysis end to end on a real clip.** The browser pane was hidden, and that breaks the frame-rate probe. The swing score and its out-of-10 display are covered by unit tests and by PR #26's check.
- **Ask Coach and the read-outs with the real model.** No API key in the preview.
- **Stripe, auth email delivery, and the Supabase Auth dashboard settings.** None was reachable from here.
