# Golf AI Coach

> Your golf coach that actually learns your game.

A persistent golf intelligence system. It combines three data sources — **course performance**, **practice results** and **swing measurements** — into a single ranked development priority, builds today's session against it, and re-ranks every time new results arrive.

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
| Collect golf data | `app/(app)/rounds/[id]/play`, `app/(app)/train` |
| Normalise + score | `lib/golf/strokes-gained` |
| Analyse performance | `lib/analytics/aggregate.ts` |
| Identify weaknesses | `lib/analytics/weaknesses.ts` |
| Cross-reference systems | `lib/analytics/weaknesses.ts` (evidence), `lib/ai/context.ts` |
| Determine priority | `lib/analytics/weaknesses.ts` (priority score) |
| Build today's session | `lib/practice/session.ts` |
| Track training | `app/(app)/train/sessions/[id]` |
| Measure improvement | `lib/analytics/practice-progress.ts` |
| Update priority | `lib/player-state.ts` (recomputed on every request) |

To see it close, open the dashboard, note the evidence behind the current priority, complete today's session with a result above its target, and reload: the evidence, the plan verdict and the coaching language all change.

---

## Architecture

```
app/
  (auth)/           sign in, sign up
  (app)/            home, rounds, train - behind auth + an onboarded profile
  onboarding/       four-step profile builder
  actions.ts        every server action, each Zod-validated
components/
  ui/               the design system (no component library, no chart library)
  charts/           bars and sparklines drawn in CSS and inline SVG
  ask/              the find-it agent (a native <dialog>)
  dashboard/ practice/ rounds/ swing/ stats/ forms/
lib/
  golf/             expected strokes, strokes-gained engine, baselines, swing metrics
  analytics/        aggregation, segments, weakness ranking, practice progress
  practice/         today's session, drill benchmarks
  ai/               provider abstraction, coaching context, prompts, schemas, ask
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

## The look

Warm paper, one deep-green accent, condensed uppercase display type, and a
single near-black card per screen for the thing that matters most. Everything
comes from the tokens at the top of `app/globals.css`, so changing the palette
is one block, and light and dark are the same components.

Two consequences worth knowing:

- **Every page opens with a full-bleed hero.** `PageHero` in
  `components/ui/primitives.tsx` cancels the layout padding with a negative
  margin so the artwork reaches the edges. The artwork is layered CSS
  gradients, not photographs — pass `image="/some-course.jpg"` to any hero and
  the photo takes over, with the gradient staying as the fallback behind it.
- **There is no charting dependency.** Strokes gained is drawn as diverging
  bars either side of a centre line, trends as SVG sparklines, and the value is
  always printed next to the bar rather than hidden behind a hover tooltip,
  which does not exist on a phone. `components/charts/index.tsx` is a server
  component: none of it ships JavaScript.

---

## Finding things

The **Ask** button on every screen opens a search over the player's own data.
Retrieval is deterministic (`lib/ai/ask.ts`): every scored segment, ranked
weakness, logged round, drill, tracked practice metric and screen is indexed
with the number already computed for it and the URL that shows it. A question
is matched against that index, and each result deep-links into the filtered
view — "150–175 yd approach" opens `/stats?category=approach&distance=150-175`,
which is the same 44 shots and the same −2.36 a round the answer quoted.

Three things the matching has to get right, each with a test:

- **Common words must not win.** "Shots" is in nearly every label, "150" is in
  one. Scoring is weighted by inverse document frequency, so rarity decides,
  and it tunes itself to the player's own data instead of needing a
  hand-maintained list of golf stop words.
- **Superlatives are a ranking, not a name.** "Where am I losing the most
  shots?" cannot be answered by word overlap, so it routes to the weakness
  list, which is already sorted by cost.
- **A named kind wins.** "Find a bunker drill" returns the drill, not the
  bunker statistic that shares the word.

The model's only job is choosing among what was retrieved and writing a
sentence about it. It cannot introduce a result — any id it returns that was
not retrieved is dropped — and it cannot introduce a number, because every
figure rendered comes from the index entry rather than from the reply. With no
API key the rule-based answer states the same facts in plainer language.

---

## Three screens

**Home** is the current priority, today's session and the last round. The
evidence behind the priority sits in a `<details>` rather than on the surface:
it is what makes the ranking trustworthy, and it is four lines of prose on a
screen that should read at a glance.

**Rounds** is every round plus the full strokes-gained breakdown, filterable.
The breakdowns live here because this is where the shots come from.

**Train** is today's session, drill benchmarks, the ranked development areas
and the swing diagnostic.

There is no training-plan feature. A plan is a promise about six weeks that the
data rewrites after two, and keeping one in sync with the rankings was more
machinery than it was worth. `lib/practice/session.ts` builds the next session
instead, fresh on every request, from whatever currently costs the most — so it
can never disagree with the priority shown next to it.

---

## Comparing against your own level

Strokes gained is computed against the PGA Tour expected-strokes tables,
because that is the only baseline the shot-level maths knows about. That is the
right place to compute it and the wrong place to read it: an 11-handicap is not
trying to beat the Tour, and "−10.7 a round" answers a question nobody asked.

`lib/golf/baselines.ts` rebases the display. Rebasing is subtraction, not a
second engine — if a 10-handicap averages −4.3 a round on approach, this
player's approach against a 10-handicap is their Tour figure minus that. The
same player reads −10.7 against the Tour and **+0.3 against a 10-handicap, with
approach at −1.19 as the one real leak**. The shot-level calculation and every
test of it are untouched.

The gaps are rounded approximations of published strokes-gained-by-handicap
figures, held to one decimal on purpose: accurate enough to answer "am I ahead
of my level?", not precise enough to pretend to be more.

---

## Swing diagnostic

`lib/golf/swing-metrics.ts` compares twelve body positions at address, top and
impact against reference bands and ranks whatever falls outside, by deviation
relative to each band's own width.

**It does not measure anything.** There is no pose estimation in this app, so
every value arrives from a `swing_measurements` row entered by the player or
their coach — which is exactly the row shape a vision pipeline would write. The
screen says so in a banner rather than in a footnote. Adding capture later
means populating the same table; none of the comparison logic changes.

A metric with no measurement is reported as **missing**, never defaulted — a
diagnostic that silently treats "not measured" as "fine" is worse than no
diagnostic.

---

## Drill benchmarks

A drill standard is stored as a rate, which is right for comparing across
sessions and wrong for saying to someone holding a putter. So the rate is the
source of truth and the count is the presentation: *"Make at least 6 of 10."*

The count rounds **up** — a 60% standard over 9 balls is 6, not 5 — because
rounding down quietly hands out a standard nobody set. Beat it and the app says
by how much, comparing on the rate so a 7-of-8 cannot claim the same margin as
a 7-of-10.

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

70 tests covering the parts where a silent error would be worst:

- **Strokes gained** — normal shots, penalties, out of bounds, putts, holed shots, bunker saves, par-3 tee shots, greenside classification, category sums, incomplete and empty rounds.
- **Analytics** — distance-band boundaries, per-round division, trend sample floors, weakness ranking, sample-size gating, confidence caps, cross-system corroboration.
- **Practice** — baseline vs latest, stalled and regressing detection, refusal to classify under three sessions.
- **Baselines** — rebasing is subtraction, categories still sum to the total, a Tour deficit can become a gain against a weaker level, an unknown id falls back to Tour.
- **Benchmarks** — the standard rounds up, the best attempt wins over the latest, a short attempt cannot inflate the margin.
- **Swing diagnostic** — an unmeasured metric is missing rather than fine, an unknown metric is ignored rather than given a band, ranking is by deviation relative to band width.
- **AI schemas** — malformed output is rejected, invented drill ids are dropped, invented skills are discarded, the rule-based coach never fabricates a number.
- **Ask agent** — generic words do not outrank specific ones, superlatives resolve to the ranked weakness list, a named kind wins, invented result ids are dropped.

---

## Not built in V1, and architected for

Pose estimation, club and ball tracking, swing-phase segmentation, launch monitors, GPS and live shot detection, wearables, course maps.

The seams already exist: `SwingFeatureExtractor` in `lib/ai/swing-analysis.ts` (currently `NoVisionExtractor`, which reports itself honestly), the `swing_measurements` table, and `ReferenceSwing.features`. Adding a pipeline means implementing one interface — the coaching layer does not change.
