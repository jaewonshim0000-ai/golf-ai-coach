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
   - `supabase/seed/seed.sql` (reference drills and swing bands only; safe to re-run).
3. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the project's connection settings. Use the public anon key, never a service-role key. Keep `ENABLE_DEMO_MODE=false`.
4. In Supabase Authentication URL Configuration, set the Site URL to the deployed app and allow its `/auth/callback` URL. Add `http://localhost:3000/auth/callback` for local development. Email/password sign-in must be enabled, and password recovery emails must be enabled for the **Forgot your password?** link to work.
5. Add the same environment variables to the existing Vercel project, then rebuild and redeploy. Public environment variables must be present at build time.
6. Create your account, confirm your email if required, and complete the profile. New accounts start empty. Do **not** run `supabase/seed/demo-player.sql` for real users.

The second migration makes practice creation transactional, adds per-shot estimates, prevents duplicate results, and enforces parent ownership. If upgrading an old database, it keeps the latest duplicate practice result and one existing measurement per metric. Back up an existing production database before applying migrations.

The private `swing-videos` bucket is created by the migrations. Uploads go directly to Storage under the signed-in user's folder, with a 50 MB limit. The database stores the object path; playback uses expiring signed URLs. See the [Supabase SSR guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [Storage upload reference](https://supabase.com/docs/reference/javascript/storage-from-upload).

## Practice

Start practice offers one goal in a dropdown: driver, irons, wedges, chipping, or putting. Each practice is one ten-ball block, about ten minutes, with a target of seven good shots.

- Driver, irons, wedges: enter estimated lateral misses (negative left, positive right, zero on line). The app calculates average absolute miss, directional bias, left-to-right spread, and shots inside the target corridor. Carry distance is not required.
- Chipping: enter each ball's distance from the hole in feet. Finishes within six feet count as good.
- Putting: count makes from ten short putts.

Save the result before finishing. Editing a saved result requires saving it again before completion. Saved attempts feed benchmarks and practice trends. Older multi-block practice records remain readable. The full drill library remains available for reference.

## Swing videos

Use **Upload video** to choose a saved MP4, MOV, or WebM, or **Record video** to open the phone camera. Upload failures are displayed and do not report success. Successful uploads are private to the account and available from other signed-in devices. Browser support for particular video codecs varies; an MP4 export is the fallback for an unplayable clip.

### Reading a swing from video

**Measure swing** runs a pose detector over the clip in the browser, finds the skeleton in 48 frames, and reads the twelve positions off it. The video never leaves the device, there is no per-use cost, and no API key is needed. `@mediapipe/tasks-vision` does the detection; the wasm and the model are fetched from MediaPipe's CDNs on first use and cached by the browser.

`lib/golf/pose.ts` does the measuring, and the shape of it is the point: the detector returns a body in the camera's frame, and golf is described in the player's. So it builds the player's axes out of the address pose — vertical from the stance, the target line from the feet, toward the ball from where the toes point — and measures everything in those. Nothing depends on which way the camera faced, on the library's axis conventions, or on handedness: down-the-line and face-on clips of the same swing give the same numbers, and the test suite checks a left-hander's mirrored swing reads identically.

Phases are found without club detection: the top is where the chest has turned furthest from address, address is the lowest the hands sit before it, and impact is the first frame after the top where the hands come back through address height — first crossing, so the follow-through cannot be mistaken for it.

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

Before inviting players, verify with two test accounts: sign up, finish onboarding with a handicap, save and reopen a practice, create a course and round, log a shot, upload and play a short video, then sign out and confirm the other account cannot see those records. Refresh and sign in on a second device to confirm cloud persistence.
