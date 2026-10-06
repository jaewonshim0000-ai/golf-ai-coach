# Golf AI Coach

Golf practice, round tracking, and a private swing-video library. Real player data is stored in Supabase; there is no automatic fallback to a shared demo account.

## Run locally

```sh
npm install
npm run dev
```

Without a database connection, the app shows a setup screen. For disposable sample data during development only, set `ENABLE_DEMO_MODE=true` in `.env.local`. Demo writes remain temporary and shared. Do not enable it for real players.

## Connect real accounts and deploy

Public app: [golf-ai-coach-alpha.vercel.app](https://golf-ai-coach-alpha.vercel.app). The existing Vercel project is connected to this GitHub repository; pushes to `main` create a production deployment. Players use that HTTPS address and their own accounts. The local development server is not needed for the public app.

1. Create or use a Supabase project.
2. In its SQL editor, run these files in order:
   - `supabase/migrations/0001_init.sql` (new projects only).
   - `supabase/migrations/0002_live_practice.sql` (new and existing projects; apply once).
   - `supabase/migrations/0003_swing_vision.sql` (new and existing projects; apply once).
   - `supabase/migrations/0004_swing_clips.sql` (new and existing projects; apply once).
   - `supabase/migrations/0005_delete_account.sql` (new and existing projects; apply once).
   - `supabase/migrations/0006_pose_source.sql` (new and existing projects; apply once).
   - `supabase/migrations/0007_scorecards.sql` (new and existing projects; apply once).
   - `supabase/migrations/0008_swing_model.sql` (new and existing projects; apply once).
   - `supabase/migrations/0009_plans_plots_scorecards.sql` (new and existing projects; apply once).
   - `supabase/migrations/0010_round_type.sql` (new and existing projects; apply once).
   - `supabase/seed/seed.sql` (reference drills and swing bands only; safe to re-run).
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the project's connection settings. Use the public anon key, never a service-role key. Keep `ENABLE_DEMO_MODE=false`.
4. In Supabase Authentication URL Configuration, set the Site URL to `https://golf-ai-coach-alpha.vercel.app` and allow `https://golf-ai-coach-alpha.vercel.app/auth/callback`. Also allow the callback at the local port you use, such as `http://localhost:3001/auth/callback`. Email/password sign-in must be enabled. See [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).
5. Configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) in Supabase before inviting other players. Its default mail service only delivers to project team members, so it does not support general signup confirmations and password recovery. Confirm that both email flows link back to the public app.
6. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `ENABLE_DEMO_MODE=false` to the Vercel Production environment. Optional coaching uses `ANTHROPIC_API_KEY` and `AI_MODEL`. Rebuild after environment changes; public variables must be present at build time. Never put server secrets in `NEXT_PUBLIC_` variables.
7. Create your account, confirm your email if required, and complete the profile. New accounts start empty. Do **not** run `supabase/seed/demo-player.sql` for real users.

The drill-priority and video-overlay updates use the existing schema and Auth metadata; they do not add a database migration. Existing projects that already applied migrations through `0009` can deploy these updates directly.

The second migration makes practice creation transactional, adds per-shot estimates, prevents duplicate results, and enforces parent ownership. If upgrading an old database, it keeps the latest duplicate practice result and one existing measurement per metric. Back up an existing production database before applying migrations.

The private `swing-videos` bucket is created by the migrations. Uploads go directly to Storage under the signed-in user's folder, with a 50 MB limit. The database stores the object path; playback uses expiring signed URLs. See the [Supabase SSR   guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [Storage upload reference](https://supabase.com/docs/reference/javascript/storage-from-upload).

## Practice

The bottom of Practice lists 30 drills, ordered by needs found in the last ten played rounds. Shot-tracked rounds use strokes lost; detailed scorecards can promote driver drills for missed fairways and putting drills for three-putts. Small samples are labeled early signals, and total scores alone never imply a skill weakness. Search or filter the list, select drills, and save priorities. Choices stay with the signed-in account in Auth metadata, so no database migration is needed. Matching saved drills are preferred in 30- and 60-minute work blocks; warm-ups and the goal's ten-ball test retain their structure. Plan previews and created sessions use the same selection rules.

**Start practice** builds a plan from a goal (driver, irons, wedges, chipping or putting; the one costing you most strokes is preselected) and a length:

- **15 min:** warm-up, then the test.
- **30 min:** warm-up, technical drill, test, pressure drill.
- **60 min:** warm-up, technical drill, test, variable practice, pressure drill.

Library drills are chosen per goal from a fixed table in `lib/practice/plan.ts`. The session runs one block at a time with a clock per block, and the blocks stay mounted, so switching blocks never loses unsaved balls.

The **test** is always the goal's ten balls. Full-swing and chipping tests are logged by tapping where each ball finished on a top-down target (or typing the numbers). The runner shows live makes, average miss, spread, and which way the misses lean. Full swings are scored on the sideways miss and chips on distance from the hole. Putts are tapped made or missed.

The test is scored against a **band that moves with you**: the tightest band your last test would still have passed at 7 of 10. Driver runs from 25 to 8 yd, irons 15 to 5, wedges 10 to 3, chips 10 to 3 ft. The band is stored with the block, so old results keep their meaning. Only the test must be logged to finish; skipped blocks are listed as not logged.

## Rounds

New rounds support two logging modes. **Track every shot** records lie, distance, club, result and penalties for strokes-gained analysis. **Live scorecard** is one hole at a time: strokes, putts, penalties and the tee shot (left, fairway, right on par 4s and 5s). It starts at par with two putts, and each hole is saved as soon as you tap Save, so a dead phone loses nothing. A running total, the score to par and a front/back card stay on screen.

**Your numbers** on Play combines both kinds of round:

- fairways, greens in regulation, putts and three-putts per round
- scrambling (par or better after a missed green)
- penalties per round
- average score by par, and a birdie / par / bogey / double mix
- trends per round for fairways, greens, putts and scrambling

A scorecard hole's green in regulation is worked out from score minus putts. Scorecard rounds do not get strokes gained, since that needs shots, and are never charged a handicap baseline gap.

## Swing videos

Use **Upload video** to choose a saved MP4, MOV, or WebM, or **Record video** to open the phone camera. Upload failures are displayed and do not report success. Successful uploads are private to the account and available from other signed-in devices. Browser support for particular video codecs varies; an MP4 export is the fallback for an unplayable clip.

### Reading a swing from video

After **Analyze movement**, the swing page shows an **overall swing score out of 100**, component scores and up to three improvement priorities. Each priority includes the visible evidence, a short practice cue, a way to check the change, and a button that pauses the video at the relevant position.

The score is a version 1 coaching heuristic of visible control, not a validated technique grade, handicap estimate or prediction of ball flight. Face-on checks use head displacement at estimated impact (40%), hip-height change at the top (30%) and rhythm (30%). Down-the-line checks use loss of visible torso inclination at estimated impact (35%), hip movement toward the selected ball side (35%) and rhythm (30%). Broad thresholds and the weighted formula are shown under **How the score is calculated**. Tracking confidence does not contribute points. A score requires at least 85% visible body coverage, a stable camera, sample gaps no larger than 0.12 seconds, and at least two checks covering 70% of the planned weight. Missing checks are excluded and a partial score is labeled. When the hands briefly hide the top but the hips stay visible, the observed hip-height interval is retained and produces lower and upper score bounds; rhythm remains excluded if timing is uncertain. A range that spans the improvement threshold is shown as a position to review, rather than a definite fix. Scores are recomputed from saved joint samples on page load, so this correction does not require another video analysis. Compare only full swings recorded at a constant speed from the same view and camera position. Validate these thresholds against coach-reviewed clips before treating them as a general swing-quality scale.

**Down-the-line recording:** put the camera behind the hands at address, at hand height, looking parallel to the target line. Keep it level and fixed, with the feet, head and full swing in frame. Good light and 60 fps or higher help. Select **Down the line**, identify whether the ball appears to screen left or right of the body, and analyze again. This selection handles mirrored recordings and is stored in the existing motion-model JSON; no new database migration is needed.

The down-the-line detector accepts a visible shoulder–hip–ankle chain even when the far body side is hidden. Measurements use one consistent side and one head landmark throughout the clip; they do not switch to an occluded joint or infer its position. The overlay adds setup hip and torso guides. This view has nine criteria; shoulder-line tilt is omitted because the shoulders overlap. Hip landmarks move with pelvic rotation and are not a rear-pelvis boundary, so movement toward the ball is a review signal rather than a confirmed early-extension diagnosis. Body tracking alone cannot establish club path, shaft plane or clubface angle. A future club-analysis layer would need visible shaft/clubhead/ball landmarks and camera calibration, with face-on and down-the-line clips linked for complementary observations.

**Analyze movement** runs the MediaPipe heavy pose detector on decoded video frames in the browser. Each frame is detected independently in IMAGE mode: seeking backwards for a dense downswing pass cannot carry tracking state from the finish into the backswing. GPU inference falls back to CPU if initialization fails. The detector chooses the same visible body when multiple people appear.

The primary output is now a synchronized **2D body overlay on the original video**, with shoulders, hips, joints, an address guide and a short hand trail. Low-visibility joints, isolated body jumps and gaps are not filled in. Up to 128 unique samples, their unrounded decoded timestamps and high-precision normalized image coordinates are stored in the existing `swing_sessions.pose_model` JSON column. Projected x/y/visibility data is stored as compact JSON text within that column and expanded on read; inferred world coordinates are omitted from new models. This fits the existing 256 KB constraint without reducing coordinate precision or requiring a new migration.

`lib/golf/motion-analysis.ts` uses image x/y corrected for video aspect ratio. The face-on checklist analyzes 12 video criteria: torso inclination and shoulder-line tilt at address, top and impact, plus horizontal hip/head displacement and vertical hip movement at top and impact. Down-the-line has nine criteria, omitting shoulder-line tilt. Fixed-camera face-on footage scales lateral movement to stance width; other views use visible body height and screen direction. Each reading explains the change relative to the player's setup. Original capture-style reference bands appear only with actual coach measurements in the optional measurement panel. Camera/stance movement or changing scale withholds displacement. These observations do not establish a swing fault, pressure transfer or professional-template conformity.

Address, top and impact are detected automatically from a complete hand arc. A small reversal cannot lock the wrong top. An occlusion of up to 0.4 seconds can bracket an estimated backswing transition only when visible hands rise before it, descend after it and complete the downswing into follow-through, with continuous body tracking. Visible body readings then show min/max ranges across that interval, and tempo is omitted if timing is uncertain. Hidden hand coordinates are never interpolated or drawn. Longer occlusions, missing body frames and incomplete swings remain unresolved with a specific recording instruction; there is no timing review panel. Previously saved manual timing remains compatible. Contact is a hand-path estimate, not detected ball contact. Durations are recorded-video time and can be stretched by slow-motion recording. Changing the trim requires a fresh analysis; old unresolved models are reanalyzed from saved observed joints when the page loads.

A single camera cannot reliably establish exact 3D hip/chest rotation, clubface angle, clubhead speed or foot pressure. The app no longer derives capture-style inch/rotation scores or automatic fault labels from inferred depth, and it no longer falls back to guessing numeric measurements from six stills when body tracking fails. Earlier automated scores are hidden from the swing detail page; hand-entered measurements and notes remain available. The video is processed locally; this analysis sends joint coordinates to the player's existing account storage, not frames to an external vision model.

## Your account

**Forgot your password?** on the sign-in page emails a reset link; it needs password recovery enabled in Supabase Authentication. The request step says the same thing whether or not the address is registered.

**Delete account** on the profile screen removes the auth user, which cascades through every table, after deleting that account's folder from the video bucket. It is a typed confirmation and cannot be undone. `0005_delete_account.sql` adds the function; it reads `auth.uid()` from the caller's own token rather than taking an id, so it can only ever delete the caller.

## Coaching

Strokes gained, practice scores, trends, and weakness ranking are computed from player data. Without `ANTHROPIC_API_KEY`, the rule-based coach still works. An optional model adds explanations; model output is validated before display.

## Verification

```sh
npm test
npm run typecheck
npm run build
```

Tests cover golf calculations, practice scoring, input validation, upload limits, what the app will accept from the vision model, and the actual SQL migrations and reference seed in PGlite, including transaction rollback, isolation between users, and the estimate-confidence ceiling. Supabase Auth, email delivery, and hosted Storage must also be checked against the connected project.

Before inviting players, verify with two test accounts: sign up, finish onboarding with a handicap, save and reopen a practice, create both a 9-hole and 18-hole course, save a score-only round, log a shot-tracked round, upload and play a short video, then sign out and confirm the other account cannot see those records. Refresh and sign in on a second device to confirm cloud persistence.
