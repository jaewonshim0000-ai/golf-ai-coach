# Golf AI Coach

> Your golf coach that actually learns your game.

A persistent golf intelligence system. It combines three data sources — **course performance**, **practice results** and **swing findings** — into a single ranked development priority, generates a training plan against it, and re-evaluates that plan every time new results arrive.

It is deliberately not "a golf app with AI bolted on". Strokes gained, trends, sample sizes and weakness ranking are computed by deterministic code. The model is the reasoning layer on top of those signals, and when there is no model configured the app still works — a rule-based coach reads the same signals and says the same things in plainer language.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. With no environment variables set the app runs in **demo mode**: a fully populated 11.8-handicap player with 8 shot-by-shot rounds, 11 practice sessions, 2 swing sessions and an active training plan. Nothing is stubbed — every number on screen is computed from those shots by the same engine that runs on real data.

Copy `.env.example` to `.env.local` when you want real accounts or a real model.

---

## Deploying

The app needs **no environment variables to run**, so it deploys as-is:

```bash
npm i -g vercel
vercel login
vercel --prod
```

Anyone opening the URL lands on the demo player and can explore the whole
product loop immediately.

One thing to know about demo mode in a serverless environment: the demo store
lives in memory (`lib/db/demo-store.ts`). Reads are always correct and always
identical, because the dataset is regenerated deterministically from a fixed
seed. Writes — recording a drill result, adding a shot — persist within a warm
instance but reset when the platform starts a cold one. That is fine, and
arguably good, for a shared demo: every visitor gets the same clean story.

For a demo where changes must stick, add the two Supabase variables. The
Postgres path, auth and row-level security are already built; setting the
variables is the only step.

---

## The product loop

```
player profile → shots → strokes gained → segments → weaknesses
      ↑                                                   ↓
 updated priority ← measured improvement ← practice results ← training plan
```

Every arrow is implemented:

| Step | Where |
| --- | --- |
| Collect golf data | `app/(app)/rounds/[id]/play`, `app/(app)/practice`, `app/(app)/swing` |
| Normalise + score | `lib/golf/strokes-gained` |
| Analyse performance | `lib/analytics/aggregate.ts` |
| Identify weaknesses | `lib/analytics/weaknesses.ts` |
| Cross-reference systems | `lib/analytics/weaknesses.ts` (evidence), `lib/ai/context.ts` |
| Determine priority | `lib/analytics/weaknesses.ts` (priority score) |
| Generate training plan | `lib/practice/plan-builder.ts` + `lib/ai/practice-plan.ts` |
| Track training | `app/(app)/practice/sessions/[id]` |
| Measure improvement | `lib/analytics/practice-progress.ts` |
| Update priority | `lib/player-state.ts` (recomputed on every request) |

To see it close, open the dashboard, note the evidence behind the current priority, complete today's session with a result above its target, and reload: the evidence, the plan verdict and the coaching language all change.

---

## Architecture

```
app/
  (auth)/           sign in, sign up
  (app)/            the product, behind auth + an onboarded profile
  onboarding/       four-step profile builder
  actions.ts        every server action, each Zod-validated
components/
  ui/               the design system (8 primitives, no component library)
  charts/           Recharts wrappers driven by CSS design tokens
  dashboard/ practice/ rounds/ plans/ swing/ forms/
lib/
  golf/             expected strokes tables, strokes-gained engine
  analytics/        aggregation, segments, weakness ranking, practice progress
  practice/         deterministic plan skeleton + progress evaluation
  ai/               provider abstraction, coaching context, prompts, schemas
  db/               Supabase clients, repository, demo store
  validation/       Zod schemas at the trust boundary
  seed/             45 drills, 3 reference swings, the demo player simulator
types/              golf, player, rounds, practice, analytics
supabase/
  migrations/       schema, indexes, row-level security, storage bucket
  seed/             generated SQL (npm run seed:sql)
```

### Programmatic vs AI

| Deterministic code | The model |
| --- | --- |
| Strokes gained, expected strokes, trends, sample sizes, percentages, scoring, plan calendars, drill selection, target numbers | Interpretation, prioritisation, connecting patterns, explaining why, wording the plan, adapting training |

The model receives a small structured `CoachingContext`, never the database. Every response is validated with Zod; anything malformed falls back to the rule-based coach, and the UI labels which one produced what you are reading.

### Honesty rules baked into the code

- Segments below a minimum sample (`MIN_SAMPLE` in `lib/analytics/weaknesses.ts`) are labelled **early signals**, never weaknesses.
- Confidence is capped at 0.95 and rises only with sample size, consistency and corroboration from another system.
- The AI is instructed — and the rule-based coach is written — to distinguish *observed / likely / possible / uncertain*.
- Empty data produces "not enough data yet", never an invented statistic.
- Swing analysis says plainly that nothing has been machine-measured, because no vision pipeline exists yet.

---

## Strokes gained

`lib/golf/expected-strokes.ts` holds published PGA Tour expected-strokes baselines by lie and distance (feet on the green, yards elsewhere), interpolated between anchors.

```
SG = E(state before) - E(state after) - 1 - penalty strokes
```

Handled: penalties, holed shots, putts, greenside shots, bunkers, par-3 tee shots (scored as approach), out of bounds (forced to at least one penalty stroke), and incomplete rounds. All four categories always sum to the round total — there is a test for that.

Every SG number in the app means *versus Tour average*. A handicap-relative baseline is the natural next step and is flagged in the code with the upgrade path.

---

## Supabase

Demo mode needs nothing. For real accounts:

1. Create a Supabase project.
2. Run `supabase/migrations/0001_init.sql` (SQL editor, or `supabase db push`).
3. Run `supabase/seed/seed.sql` to load the drill library and reference swings.
4. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.

The app switches automatically: with those variables set, `lib/db/repo.ts` talks to Postgres and the sign-in pages become live; without them it uses the in-memory demo store. No page knows which.

Row-level security is on for every table. User-owned tables share one generated policy (`auth.uid() = user_id`); child tables check ownership through their parent; drills and reference swings are read-only reference data; the `swing-videos` storage bucket is private and scoped per user folder.

To load the demo player into a real account, create the account, then:

```bash
psql "<connection-string>" -v demo_user_id=<the-auth-uuid> -f supabase/seed/demo-player.sql
```

Regenerate both SQL files from the TypeScript source with `npm run seed:sql`, so seed data and demo data can never drift.

---

## AI provider

Set `ANTHROPIC_API_KEY` (and optionally `AI_MODEL`, default `claude-sonnet-5`) to enable the model. `lib/ai/provider.ts` is a two-line interface, so swapping providers means adding one class — nothing else in the app imports an SDK.

Without a key, `RulesProvider` runs the deterministic fallback co-located with each AI function. Those fallbacks are real analysis of real signals, not canned text, and the UI shows a "Rule-based coach" badge so you always know which you are reading.

---

## Testing

```bash
npm test        # node:test, no framework
npm run typecheck
npm run build
```

72 tests covering the parts where a silent error would be worst:

- **Strokes gained** — normal shots, penalties, out of bounds, putts, holed shots, bunker saves, par-3 tee shots, greenside classification, category sums, incomplete and empty rounds.
- **Analytics** — distance-band boundaries, per-round division, trend sample floors, weakness ranking, sample-size gating, confidence caps, cross-system corroboration.
- **Practice** — baseline vs latest, stalled and regressing detection, refusal to classify under three sessions.
- **Plans** — every referenced drill exists, facilities are respected, blocks progress technical → pressure, targets are anchored on the player's own baseline, adaptation verdicts.
- **AI schemas** — malformed output is rejected, invented drill ids are dropped, invented skills are discarded, the rule-based coach never fabricates a number.

---

## Not built in V1, and architected for

Pose estimation, club and ball tracking, swing-phase segmentation, launch monitors, GPS and live shot detection, wearables, course maps.

The seams already exist: `SwingFeatureExtractor` in `lib/ai/swing-analysis.ts` (currently `NoVisionExtractor`, which reports itself honestly), the `swing_measurements` table, and `ReferenceSwing.features`. Adding a pipeline means implementing one interface — the coaching layer does not change.
