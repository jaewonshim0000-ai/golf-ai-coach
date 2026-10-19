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
   - `supabase/migrations/0011_practice_tests.sql` (new and existing projects; apply once).
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

The visible library contains the 30 supplied practice tests: ten for the range, ten for chipping, and ten for putting. Search by name or distance and filter by area. Every test can be started directly from the library or the priorities list. Older drill IDs remain available internally so existing sessions and results still open.

Range tests cover line and dispersion at 50–100, 100–150, 150–200 and 200–250 yards, plus driver carry and fairway accuracy. Dispersion diameter is the maximum two-dimensional distance between any two plotted finishes; driver carry averages all ten measurements and excludes roll. Both display actual yards rather than a fabricated success percentage.

Chipping includes short, medium, long, short-sided, rough, bunker, high-lob, mixed-distance and landing-spot tests. Choose the finishing or landing radius in feet before starting; it stays with the session. Landing-spot scoring uses the first landing, not the final rollout. The up-and-down challenge uses ten different lies and counts hole-outs in two strokes or fewer.

Putting includes the supplied distance bands, two lag tests with a configurable finishing radius, a tee start-line gate, random distances and the 3–5–7–9 ft spiral. The gate counts clean passes regardless of whether the putt is holed. The spiral returns to 3 ft after a miss, finishes only after four consecutive makes, and saves the ordered outcomes, total putts and restarts. Players can save an incomplete run when they stop. A run supports up to 500 putts; after that, save it and start another.

For an existing live database, apply `0011_practice_tests.sql` and rerun `supabase/seed/seed.sql` before deploying these tests. The migration extends the numeric sample array for longer spiral runs; the reference seed adds the new IDs without deleting old drills or player data. Regenerate reference data without changing the demo player with `npm run seed:sql -- --reference-only`.

The bottom of Practice orders these 30 tests by needs found in the last ten played rounds. Shot-tracked rounds use strokes lost; detailed scorecards can promote driver accuracy for missed fairways and lag putting for three-putts. Small samples are labeled early signals, and total scores alone never imply a skill weakness. Save priorities to prefer matching tests in 30- and 60-minute work blocks. Choices stay with the signed-in account in Auth metadata. The guided plans retain their warm-ups and adaptive ten-ball goal test, using legacy support exercises if a longer plan exhausts the available distinct tests for that goal. Plan previews and created sessions use the same selection rules, and the new ten-ball tests always retain ten balls regardless of block duration.

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

Use **Upload video** to choose a saved MP4, MOV, or WebM, or **Record in app** to film without leaving the app. Upload failures are displayed and do not report success. Successful uploads are private to the account and available from other signed-in devices. Browser support for particular video codecs varies; an MP4 export is the fallback for an unplayable clip.

### Slow motion and in-app recording

Uploads are expected to be slow motion from the phone's camera app (Slo-mo). Slow motion uses a shorter exposure and more frames, so the hands and club blur less through the downswing. When a file is chosen, **Playback speed** asks how it was filmed: 240 fps (8× slower), 120 fps (4× slower) or real speed. The choice is remembered on the device and starts at 240 fps. The swing page has the same setting; changing it reviews the clip again. Start recording a second or two before the swing, so that the phone's normal-speed lead-in is over before the takeaway. Keep slow-motion clips to about 3–4 seconds; the upload limit is 50 MB, and longer slow-motion clips go over it.

Tracked frame times are stored in real swing seconds (video time ÷ speed), so every timing rule and the tempo apply to the swing itself. Seeking, overlays and the timing editor convert back to video time. A downswing outside about 0.15–0.6 s adds a recording note asking the player to check the playback speed.

**Record in app** opens the rear camera inside the app, with a dashed frame and a live check that the whole body is in view with room above the head for the club. Recording starts after a 5-second countdown with beeps, stops on its own after 12 seconds, and can be reviewed or retaken before saving. It asks the browser for its fastest frame rate and shows the rate it got, usually 30–60 fps. Phone browsers do not give web apps the camera's 120/240 fps slow-motion mode, so in-app clips are real speed and true slow motion still comes from the camera app. Where the browser cannot record (no camera access or not over HTTPS), the button opens the phone's camera app instead. No migration is required.

### Automatic 2D swing analysis

Choose face on (facing the golfer's chest) or down the line (behind the golfer) when adding a recording. Keep the phone fixed, with the whole body visible and setup through follow-through included. Saving starts tracking automatically. The recording's view can be corrected beside the player. Analysis shows only **Biggest problem**, a single plain-language issue, and **How to fix it**, a numbered procedure matched to that issue. Timing tables, measurement reports, scores, comparisons, and extra coach notes are omitted from the analysis. Older recordings and saved data remain available.

The open-source [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker) heavy model runs on decoded video frames in a background worker. It retains GPU-to-CPU and foreground fallbacks, cancellation, actual decoded timestamps, person continuity, and the strict budget of 128 inferences including failed detections. New reviews upload and store only image x/y/visibility and sample times in the existing `pose_model` column. Inferred world coordinates are not reconstructed, displayed, stored, or used to calculate these observations. Existing saved image tracks can be reviewed without rebuilding the 3D model. No migration is required.

The 2D report identifies setup, top and estimated contact from the observed hand path. Short hand occlusions produce a bounded transition interval and ranges for visible body readings. Contact is a hand-path estimate, not ball-impact detection. Projected posture and shoulder tilt are measured independently of displacement. A consistently planted ankle screens displacement stability; projected shin length is excluded because normal knee flexion and rotation change it. This is a conservative screen, not camera-motion compensation or a calibrated accuracy certification. Individual readings are omitted when required joints are hidden. A recording with uncertain displacement or timing still saves its observed tracks and supported results. An optional timing editor lets the player correct phase positions on the original video; confirmed positions persist across reloads.

### Check your setup

The pose model sees the body, not the club, and it can pick up a second person in the frame. Once a review exists, **Check your setup** shows the setup frame paused with the tracked outline. The player confirms the outline is on them; if it is not, the step points to recording again or adjusting the timing (there is no joint dragging). The player then taps the grip and the clubhead, and face on may also tap the ball. The taps are stored as fractions of the picture with the frame time inside the existing `pose_model` JSON, validated with zod to 0–1, so no migration is needed. A new review, a trim change or moving the setup frame clears them, the same way stale observations are dropped.

Down the line, a dashed blue plane line from the clubhead through the marked hands stays on the replay. Setup marks remain available beside the video; they do not add another section to the analysis. These are picture guides from the player's own taps, and camera height and position change them. Nothing here is sent to Claude.

The original video shows a faint setup outline, head/nose and hip reference guides, and a visible hand trail by default. Half-speed replay covers setup through estimated contact and early follow-through; a slow-motion clip replays at its own speed. Internally, the existing view-specific coaching checks rank supported issues by weighted deduction. Only the highest-ranked issue is shown, with exercises for sideways head movement, backswing height, projected posture, supported hip space, or rhythm. Each supported check is considered independently: a missing check or a gap elsewhere does not discard readable positions, and camera movement still withholds displacement. Uncertain ranges never become definite faults. When timing needs correction, the two sections explain the specific missing detail and offer Adjust swing timing for the existing recording. Readable checks showing no fault get a separate Swing review state, even when another check is missing. Recording advice appears only when the missing evidence requires it.

A procedure for the selected issue appears immediately. When configured, Claude chooses between maintained rehearsal and half-shot procedures for that same issue. A strict selection schema prevents additional faults, measurements, or invented instructions. Both face-on and down-the-line recordings use this flow. There is a 12-second API timeout without retries; the immediate procedure remains usable on failure. Identical requests share a bounded process cache isolated by player and session, with the full recording evidence, trim, timing, view, club, and AI model in the fingerprint. Video frames and raw joint arrays are not sent to Claude.

Shortening a recording is optional and collapsed. A saved clip change automatically starts a new review and prevents stale observations on the detail page. Existing 3D code remains for compatibility and research tests but is no longer connected to the player-facing swing flow. No migration is required.

**Validation:** this implementation has not established real-world measurement accuracy or coaching outcomes. Evaluate camera screening, false acceptance/rejection rates, visible coordinate error, setup/timing error, metric error, and failure behavior against coach-labelled face-on and down-the-line videos across body types, clothing, light, frame rates, slow-motion exports, and occlusion. Fixture tests verify software behavior, not validated biomechanics. Do not infer clubface, ball flight, pressure transfer, or precise body rotation from these overlays.

## Your account

### Swing comparison references

Open **Swing → Reference library → Add reference** to upload a professional, coach, or personal clip you have permission to use. The existing private upload and pose-tracking flow analyzes it; save the golfer's name, reference type, handedness and optional source credit after tracking. A saved recording can also become a reference. References belong to the signed-in account and are stored as validated metadata in the existing `pose_model` JSON. No migration, additional paid service, or new model download is required. Reanalysis and timing edits preserve reference attribution; removing a reference keeps its underlying video and tracks.

Opening a user swing automatically selects a ready reference with the same club and camera view, preferring professional/coach references and similar observed torso-to-leg proportions. The reference picker can override that choice. Stale trims, self-comparison and unavailable references are excluded. Uncertain timing or incompatible camera geometry produces a specific completion message while the original swing analysis remains available. Reference labels are supplied by the uploader; the app does not independently verify professional status.

**Compare with a reference** shows two videos with a shared slider, position buttons and synchronized playback. Piecewise time mapping aligns setup, top and estimated contact, with a bounded observed follow-through window; real swing times are converted to each clip's own slow-motion video time. Face-on replay orientation can be mirrored to align lead/trail sides without changing anatomical measurements. Private signed video URLs refresh during long sessions, and device-local demo clips retain their existing device-only behavior.

The comparison reads actual detected positions in both recordings. Movement is expressed relative to each golfer's setup and stance/body scale; the system does not compare raw pixels or emit a similarity/quality percentage. Conservative, unvalidated tolerances screen head movement, backswing height, projected posture, supported hip space and timing. A comparison correction requires both a supported concern in the user's recording and a meaningful excess over the reference. Uncertain height intervals use the user's smallest supported excursion and the reference's largest, preventing a guessed top from becoming a correction. Missing reference evidence cannot erase a supported user observation. AI may select only a maintained procedure for the chosen issue, with full reference evidence in the cache fingerprint.

This is a working reference-comparison system using the existing pose model, not a new model trained on professional footage. It ships without third-party pro videos, GolfDB weights or invented pro coordinates. Upload permitted reference clips to populate the private library. Camera perspective and anatomy still affect comparisons; real-world accuracy and coaching outcomes require evaluation with coach-reviewed recordings.

**Forgot your password?** on the sign-in page emails a reset link; it needs password recovery enabled in Supabase Authentication. The request step says the same thing whether or not the address is registered.

**Delete account** on the profile screen removes the auth user, which cascades through every table, after deleting that account's folder from the video bucket. It is a typed confirmation and cannot be undone. `0005_delete_account.sql` adds the function; it reads `auth.uid()` from the caller's own token rather than taking an id, so it can only ever delete the caller.

## Coaching

Strokes gained, practice scores, trends, and weakness ranking are computed from player data. Without `ANTHROPIC_API_KEY`, the rule-based coach still works. An optional model adds explanations; model output is validated before display.

## Verification

```sh
npm test
npm run typecheck
npm run build
npm run benchmark:swing
```

The retained research benchmark reports legacy reconstruction time and root-relative joint error on reproducible synthetic fixtures in both camera views. These fixtures contain deliberately biased depth; they test regressions, not real-world model accuracy. Pass a JSON reference dataset with `npm run benchmark:swing -- path/to/captures.json`. It must be an array of `{name, aspect, view, detected, truth}` captures using `PoseFrame` arrays, identical timestamps, metres, the MediaPipe 33-joint order and the same camera axes. Each detected frame also needs normalized `imageLandmarks`. Reference visibility must be supplied. The comparison removes hip translation only, retaining scale and rotation error, and uses the same visible joints before and after reconstruction. Video decoding and pose inference time are excluded from this benchmark.

[Sportsbox describes validation against reference motion-capture measurements](https://help.sportsbox.ai/sportsbox-ai-accuracy). This app has not been validated to that standard. A model with stable limbs can still have biased depth; validate reference joint error, phase timing, metric error and failure rate on consented real swings across camera views, frame rates, body types, clothing and occlusion before making accuracy claims. [WHAM](https://github.com/yohanshin/WHAM) is a possible server-side research candidate, but its pipeline needs additional model assets/registration and evaluation; it is not silently added as a production dependency. The current feature continues to use Google’s open-source MediaPipe heavy model.

Tests cover golf calculations, practice scoring, input validation, upload limits, what the app will accept from the vision model, and the actual SQL migrations and reference seed in PGlite, including transaction rollback, isolation between users, and the estimate-confidence ceiling. Supabase Auth, email delivery, and hosted Storage must also be checked against the connected project.

Before inviting players, verify with two test accounts: sign up, finish onboarding with a handicap, save and reopen a practice, create both a 9-hole and 18-hole course, save a score-only round, log a shot-tracked round, upload and play a short video, then sign out and confirm the other account cannot see those records. Refresh and sign in on a second device to confirm cloud persistence.
