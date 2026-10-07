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

### Video to 3D swing and analysis

Choose **Build 3D swing** beneath the original video. The page then opens a rotatable **3D replay**, followed by a score and coaching analysis. Original video and 3D replay have separate tabs, with synchronized playback, quarter speed, a timeline, and jumps to address, top and estimated impact. Recording controls and optional manual measurements stay available without a criteria checklist.

The open-source [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) heavy GHUM model runs on decoded frames in the browser and estimates 33 metric 3D joints alongside observed image coordinates. The reconstruction uses those world joints directly, keeps bone lengths consistent across the clip, removes isolated depth spikes and uses observed hip movement for image-plane translation. It does not lift 2D joints using a guessed camera lens. The body mannequin, shoulder/hip guides, address ghost and visible hand trail can be viewed from the recorded camera, side or above. Depth and hidden limbs remain estimates; hidden limbs appear faint. The club, ball and foot pressure are not tracked. One-camera reconstruction is not calibrated motion capture.

The coaching score combines reconstructed torso inclination through impact (40%), supported head control in face-on or hip displacement in down-the-line video (30%), and recorded rhythm (30%). It is a version 1 heuristic, not a validated technique, handicap or ball-flight grade. At least 85% visible body coverage, gaps at most 0.12 seconds, and two supported checks covering 70% of the planned weight are required. Missing checks are excluded and a partial score is labeled beside the result. A moving camera withholds image displacement. If nearby impact frames produce different grades, the app shows a score range and avoids a definite improvement diagnosis when that range crosses the improvement threshold. The default view shows supported observations and practice cues; score details and recording notes are collapsed. Validate the thresholds against coach-reviewed footage before treating them as a general swing-quality scale.

**Recording:** trim to one complete swing from setup through follow-through. Keep the phone fixed and level, with feet, head and hands in frame, in good light. Face-on footage should look directly opposite the setup hands, perpendicular to the target line. Down-the-line footage should look from behind the setup hands, at hand height, parallel to the target line. Choose the camera view before building; the down-the-line ball side is inferred from a clear setup grip, with an optional override for mirrored recordings. Good 60 fps footage improves timing, but a clear 30 fps clip can still support a reconstruction.

The reader detects each frame independently in IMAGE mode, falling back from GPU to CPU if initialization fails. It reserves half of its 128-sample budget for refinement around the observed hand arc, top, downswing and follow-through. Duplicate decoded frames, inconsistent separated wrists and isolated joint spikes are rejected. Address, top and impact require a complete observed hand arc; a brief hand occlusion can bracket an estimated transition when the surrounding movement and body tracking support it. Uncertain timing excludes rhythm. Longer occlusions and incomplete swings retain the replay but may withhold the score. **Adjust swing timing** allows corrections against the original video. Contact remains a hand-path estimate, not detected ball contact; slow-motion recordings change recorded durations.

Saved models retain precise decoded timestamps and image x/y/visibility plus compact millimetre 3D coordinates in the existing `swing_sessions.pose_model` JSON column, within its 256 KB constraint. No migration is required. Legacy 2D models can be rebuilt from their videos. Playback uses actual timestamps rather than assuming uniformly spaced samples; gaps do not produce a continuous body pose. The optional body overlay stays synchronized with the source video and never draws hidden joints. Scoring is recomputed on load. Changing the trim or camera view requires rebuilding the model.

Video processing stays on the device. Only joint coordinates are saved to the player's existing account storage; video frames are not sent to an external vision service. Coach-entered measurements and notes remain available. The app does not infer exact hip/chest rotation, clubface angle, clubhead speed or pressure from a single recording.

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
