# Golf AI Coach

Golf practice, round tracking, and a private swing-video library. Real player data is stored in Supabase; there is no automatic fallback to a shared demo account.

## Run locally

```sh
npm install
npm run dev
```

Without a database connection, the app shows a setup screen. For disposable sample data during development only, set `ENABLE_DEMO_MODE=true` in `.env.local`. Demo writes remain temporary and shared. Do not enable it for real players.

## Connect real accounts and deploy

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
   - `supabase/seed/seed.sql` (reference drills and swing bands only; safe to re-run).
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the project's connection settings. Use the public anon key, never a service-role key. Keep `ENABLE_DEMO_MODE=false`.
4. In Supabase Authentication URL Configuration, set the Site URL to the deployed app and allow its `/auth/callback` URL. Add `http://localhost:3001/auth/callback` for this local setup. Email/password sign-in and Confirm Email must be enabled.
5. In Supabase Authentication → Emails → SMTP Settings, connect a custom SMTP provider before inviting users. Supabase's built-in mailer only delivers to project-team addresses and is limited to two messages per hour, so it cannot support real account confirmations or password recovery.
6. Add the same environment variables to the existing Vercel project, then rebuild and redeploy. Public environment variables must be present at build time.
7. Create your account, confirm your email, and complete the profile. New accounts start empty. Do **not** run `supabase/seed/demo-player.sql` for real users.

The second migration makes practice creation transactional, adds per-shot estimates, prevents duplicate results, and enforces parent ownership. If upgrading an old database, it keeps the latest duplicate practice result and one existing measurement per metric. Back up an existing production database before applying migrations.

The private `swing-videos` bucket is created by the migrations. Uploads go directly to Storage under the signed-in user's folder, with a 50 MB limit. The database stores the object path; playback uses expiring signed URLs. See the [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [Storage upload reference](https://supabase.com/docs/reference/javascript/storage-from-upload).

## Practice

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

**Measure swing** runs a pose detector over the clip in the browser: `@mediapipe/tasks-vision` (heavy pose model), with the wasm and model fetched from MediaPipe's CDNs on first use and cached. The video never leaves the device, there is no per-use cost, and no API key is needed. Sampling is done in two passes:

1. An even pass (64 to 96 frames) finds the swing.
2. A second pass reads the downswing at up to 120 samples a second, where the body turns several hundred degrees a second.

Each sample is stamped with the video frame actually shown, and repeated frames are skipped. A tracking preview is drawn over a sampled frame, so bad tracking is visible before the numbers are trusted.

The browser sends the detector's two skeletons per frame, plus the video's aspect ratio: the picture landmarks and the "world" 3D guess. The server rebuilds the body from them in `lib/golf/lift.ts`, because the world skeleton alone is pinned between the hips every frame and its depth is noisy and squashed. The rebuild works like this:

- Each bone's in-picture part comes from the picture landmarks (the detector's most accurate output), back-projected through a phone lens. The body moves through the frame as it really did.
- Every bone keeps one length for the whole clip.
- The detector's depth is re-scaled by one gain per clip. The gain is fitted so rigid bones stay rigid as they rotate, with an errors-in-variables correction so noise does not bias it low.
- Depth is blended with the geometric depth a known bone length implies (Taylor 2000). Each source is weighted by the error it carries on that clip, measured from the clip's own jitter.

The rebuilt model is stored on the swing (`swing_sessions.pose_model`, flagged `lifted`), so the numbers are always read off the model the page draws. Moving the phases in the viewer re-measures that stored model; nothing is uploaded again.

`lib/golf/pose.ts` does the measuring:

- The player's axes come from the address pose: vertical from the stance, the target line from the feet, toward the ball from where the toes point.
- Each position is the median over the frames within 50 ms of its phase. Address is averaged over 100 ms into one steady reference.
- A movement (sway, lift, thrust, head) is measured only when its axis lies within about 35° of the picture. Face-on gives sway and lift; down-the-line gives thrust and lift. The rest stay unmeasured rather than read off depth the camera cannot see.

Phases come from the hand path in the picture, with no club detection:

- **Address** is the hands' lowest early position.
- **Top** is their highest before they come back down.
- **Impact** is the bottom of the hand arc, not the first frame "near" address height. Through impact one frame is about 10° of turn at 60 fps.

**Accuracy, checked against a simulated golfer** (`lib/golf/lift.test.ts`, `swing.fixture.ts`). The simulation is a rigid-boned body with a realistic tempo, filmed by a phone at about 2.6 m. The detector is given about 1 cm of picture jitter, 3 cm of depth jitter, depth squashed to 60% and a 5% size error. The results:

- **Perfect detector:** the rebuild is within 3° everywhere.
- **Down the line:** every turn and bend within 7°.
- **Face on:** bends within 4° and turns at the top within 9°. Turns at impact are the weakest, within 18°: the shoulder and hip lines sit 30–40° out of the picture there, where one camera is least certain.
- **Movements the view can see:** within about half an inch.
- **Zoomed (2×) clips:** read as well as main-lens ones.

For the best numbers, film in slow motion (120 or 240 fps): face-on for sway, down-the-line for turns. The club is not tracked.

**One camera cannot see depth.** It is inferred, so the rotations are the softest numbers here. Pose readings are stored as `source = 'pose'` with confidence capped at 0.8; the database enforces it, along with 0.6 for a model's eyeball estimate and no ceiling for a value a person typed. Precedence runs manual > pose > vision: re-measuring never overwrites a number you typed.

If no body is found — too far away, cropped, filmed through a net — it falls back to sending six frames to the model configured by `ANTHROPIC_API_KEY`, which estimates what it can see and writes up to three findings. That path stores `source = 'vision'`, and with no key it says the frames were not read rather than inventing anything. The diagnostic marks each row `pose` or `est.` and says how many came from where.

Trim is stored on the swing itself, so the same clip range plays on every device you sign in from. **Delete swing** removes the stored video, its measurements and its findings; the file is deleted from storage before the row, so a failure never leaves a paid-for file with nothing pointing at it. Demo clips (no database connected) keep the video blob in IndexedDB on the recording device.

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
