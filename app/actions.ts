"use server";
import { dispersion, offsetFor, practiceGoal } from "@/lib/practice/goals";
import { buildPlan } from "@/lib/practice/plan";
import { rankPracticeDrills } from "@/lib/practice/drill-priorities";
import { cookies } from "next/headers";
import { serverClient } from "@/lib/db/supabase";
import { privateVideoPath } from "@/lib/video-upload";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { MissDirection } from "@/types/golf";
import type { Goal, PracticeFacility } from "@/types/player";
import type { Club } from "@/types/golf";
import type { HoleStat } from "@/types/rounds";
import { ASK_IDLE, askCoach, type AskState } from "@/lib/ai/ask";
import {
  FRAME_COUNT,
  acceptFindings,
  acceptMeasurements,
  analyzeSwingFrames,
  visionNote,
} from "@/lib/ai/vision";
import { METRICS_BY_ID } from "@/lib/golf/swing-metrics";
import {
  packFrames,
  unpackFrames,
  type PackedLandmark,
  type PoseFrame,
  type SwingPhases,
} from "@/lib/golf/pose";
import { analyseMotion, motionCriteria, type MotionView } from "@/lib/golf/motion-analysis";
import { holeShots, type HoleRow } from "@/lib/golf/hole-entry";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import { loadPlayerState } from "@/lib/player-state";
import * as repo from "@/lib/db/repo";
import { resetDemoStore } from "@/lib/db/demo-store";
import type { ActionState } from "@/lib/action-state";
import {
  drillAttemptSchema,
  fieldErrors,
  measurementSchema,
  poseModelSchema,
  retimeSchema,
  practiceSessionSchema,
  practicePrioritiesSchema,
  profileSchema,
  holeShotsSchema,
  roundSchema,
  holeSchema,
  shotSchema,
  swingFindingSchema,
  swingSessionSchema,
} from "@/lib/validation/schemas";

/**
 * Server actions. Every one validates its input with Zod before touching the
 * repository, and every one scopes writes to the signed-in user.
 */

async function requireUser() {
  const user = await repo.currentUser();
  if (!user) redirect("/login");
  return user;
}

function list(formData: FormData, key: string): string[] {
  return formData.getAll(key).map(String).filter(Boolean);
}

function fail(error: z.ZodError): ActionState {
  return { ok: false, message: "Please fix the highlighted fields.", errors: fieldErrors(error) };
}

function asError(error: unknown): ActionState {
  return {
    ok: false,
    message: error instanceof Error ? error.message : "Something went wrong. Please try again.",
  };
}

// ------------------------------------------------------------------ profile

export async function saveProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    display_name: formData.get("display_name"),
    handicap_index: formData.get("handicap_index"),
    experience_level: formData.get("experience_level"),
    dominant_hand: formData.get("dominant_hand"),
    typical_score: formData.get("typical_score"),
    average_driver_distance: formData.get("average_driver_distance"),
    swing_pattern: formData.get("swing_pattern"),
    common_miss: formData.get("common_miss") || undefined,
    primary_goal: formData.get("primary_goal"),
    secondary_goals: list(formData, "secondary_goals"),
    practice_days_per_week: formData.get("practice_days_per_week"),
    typical_practice_duration: formData.get("typical_practice_duration"),
    facilities: list(formData, "facilities"),
    bag: list(formData, "bag"),
  });
  if (!parsed.success) return fail(parsed.error);

  try {
    const existing = await repo.getProfile(user.id);
    const now = new Date().toISOString();
    await repo.upsertProfile({
      id: existing?.id ?? `profile_${user.id}`,
      user_id: user.id,
      display_name: parsed.data.display_name,
      handicap_index: parsed.data.handicap_index ?? null,
      experience_level: parsed.data.experience_level,
      dominant_hand: parsed.data.dominant_hand,
      typical_score: parsed.data.typical_score ?? null,
      average_driver_distance: parsed.data.average_driver_distance ?? null,
      swing_pattern: parsed.data.swing_pattern,
      common_miss: (parsed.data.common_miss as MissDirection | undefined) ?? null,
      primary_goal: parsed.data.primary_goal as Goal,
      secondary_goals: parsed.data.secondary_goals as Goal[],
      practice_days_per_week: parsed.data.practice_days_per_week,
      typical_practice_duration: parsed.data.typical_practice_duration,
      facilities: parsed.data.facilities as PracticeFacility[],
      bag: parsed.data.bag as Club[],
      created_at: existing?.created_at ?? now,
      updated_at: now,
    });

    if (parsed.data.handicap_index !== undefined && parsed.data.handicap_index !== existing?.handicap_index) {
      await repo.addHandicapEntry({
        user_id: user.id,
        recorded_on: now.slice(0, 10),
        handicap_index: parsed.data.handicap_index,
      });
    }
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved." };
}

export async function completeOnboardingAction(
  prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const result = await saveProfileAction(prev, formData);
  if (!result.ok) return result;
  redirect("/practice");
}

// ------------------------------------------------------------------- rounds

// A course first typed into a round gets a standard card; each hole's par is
// picked as it is played and kept with the shots.
const DEFAULT_PARS = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4, 5];
const DEFAULT_YARDS = [400, 370, 165, 510, 425, 390, 150, 530, 415, 395, 185, 440, 505, 360, 420, 165, 385, 525];

export async function createRoundAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = roundSchema.safeParse({
    course_name: formData.get("course_name"),
    played_on: formData.get("played_on"),
    round_type: formData.get("round_type"),
  });
  if (!parsed.success) return fail(parsed.error);

  let roundId: string;
  try {
    const name = parsed.data.course_name;
    const courses = await repo.getCourses(user.id);
    const course =
      courses.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
      (await repo.createCourse({
        user_id: user.id,
        name,
        city: null,
        par: DEFAULT_PARS.reduce((a, b) => a + b, 0),
        holes: DEFAULT_PARS.map((par, index) => ({ hole_number: index + 1, par, yards: DEFAULT_YARDS[index]! })),
      }));

    const round = await repo.createRound({
      user_id: user.id,
      course_id: course.id,
      course_name: course.name,
      played_on: parsed.data.played_on,
      round_type: parsed.data.round_type,
      tees: null,
      holes_played: 0,
      score: null,
      hole_scores: null,
      hole_stats: null,
      conditions: [],
      notes: null,
      status: "in_progress",
    });
    roundId = round.id;
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/rounds");
  redirect(`/rounds/${roundId}/play`);
}

/** Save one hole of a shot-tracked round, entered as where each shot started. */
export async function saveHoleShotsAction(input: {
  round_id: string;
  hole_number: number;
  par: number;
  rows: HoleRow[];
}): Promise<ActionState> {
  const user = await requireUser();
  const parsed = holeShotsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the shots." };
  const { round_id, hole_number, par, rows } = parsed.data;

  const shots = holeShots(round_id, hole_number, par, rows);
  for (const shot of shots) {
    const checked = shotSchema.safeParse(shot);
    if (!checked.success) {
      return { ok: false, message: `Shot ${shot.shot_number}: ${checked.error.issues[0]?.message ?? "check it"}.` };
    }
  }

  try {
    const round = await repo.getRound(user.id, round_id);
    if (!round) return { ok: false, message: "Round not found." };
    await repo.replaceHoleShots(
      user.id,
      round_id,
      hole_number,
      shots.map((shot) => ({ ...shot, user_id: user.id })),
    );
  } catch (error) {
    return asError(error);
  }

  revalidatePath(`/rounds/${round_id}`);
  return { ok: true };
}

export type HoleState = ActionState & { hole_stats?: (HoleStat | null)[] };

/**
 * Save one hole of a live scorecard. Each hole is stored as it is played, so a
 * flat phone on the back nine loses nothing, and the round's score is always
 * the sum of the holes that exist.
 */
export async function saveHoleAction(input: {
  round_id: string;
  hole_number: number;
  score: number;
  putts: number | null;
  fairway: "hit" | "left" | "right" | null;
  penalties: number;
}): Promise<HoleState> {
  const user = await requireUser();
  const parsed = holeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the hole." };
  }

  let stats: (HoleStat | null)[];
  try {
    const [round, courses, shots] = await Promise.all([
      repo.getRound(user.id, parsed.data.round_id),
      repo.getCourses(user.id),
      repo.getShots(user.id, parsed.data.round_id),
    ]);
    if (!round) return { ok: false, message: "Round not found." };
    if (shots.length > 0) {
      return { ok: false, message: "This round is shot-tracked. Keep scoring it from the shot tracker." };
    }
    const course = courses.find((item) => item.id === round.course_id);
    const hole = course?.holes[parsed.data.hole_number - 1];
    if (!course || !hole) return { ok: false, message: "That hole is not on this course." };

    stats = course.holes.map(
      (_, index) =>
        round.hole_stats?.[index] ??
        (round.hole_scores?.[index]
          ? { score: round.hole_scores[index]!, putts: null, fairway: null, penalties: 0 }
          : null),
    );
    stats[hole.hole_number - 1] = {
      score: parsed.data.score,
      putts: parsed.data.putts,
      fairway: hole.par >= 4 ? parsed.data.fairway : null,
      penalties: parsed.data.penalties,
    };
    const played = stats.filter((stat): stat is HoleStat => stat !== null);
    await repo.updateRound(user.id, round.id, {
      hole_stats: stats,
      holes_played: played.length,
      score: played.reduce((sum, stat) => sum + stat.score, 0),
      hole_scores: played.length === stats.length ? played.map((stat) => stat.score) : null,
    });
  } catch (error) {
    return asError(error);
  }

  revalidatePath(`/rounds/${parsed.data.round_id}`);
  revalidatePath("/rounds");
  return { ok: true, hole_stats: stats };
}

export async function finishScorecardAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const roundId = String(formData.get("round_id") ?? "");
  try {
    const [round, courses] = await Promise.all([repo.getRound(user.id, roundId), repo.getCourses(user.id)]);
    if (!round) return { ok: false, message: "Round not found." };
    const course = courses.find((item) => item.id === round.course_id);
    const missing = (course?.holes ?? []).filter((_, index) => !round.hole_stats?.[index]);
    if (!course || missing.length > 0) {
      return { ok: false, message: `Score hole ${missing[0]?.hole_number ?? 1} before finishing.` };
    }
    await repo.updateRound(user.id, round.id, { status: "complete" });
  } catch (error) {
    return asError(error);
  }
  revalidatePath("/", "layout");
  redirect(`/rounds/${roundId}`);
}

export async function finishRoundAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const roundId = String(formData.get("round_id") ?? "");
  try {
    const round = await repo.getRound(user.id, roundId);
    // Finishing again after an edit recounts the score.
    if (!round) return { ok: false, message: "This round is unavailable." };
    const shots = await repo.getShots(user.id, roundId);
    if (shots.length === 0) return { ok: false, message: "Log at least one shot before finishing the round." };
    const holes = new Set(shots.map((s) => s.hole_number));
    const strokes = shots.length + shots.reduce((sum, s) => sum + s.penalty_strokes, 0);
    await repo.updateRound(user.id, roundId, {
      status: "complete",
      holes_played: holes.size,
      score: strokes === 0 ? null : strokes,
    });
  } catch (error) {
    return asError(error);
  }
  revalidatePath("/", "layout");
  redirect(`/rounds/${roundId}`);
}

export async function deleteRoundAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await repo.deleteRound(user.id, String(formData.get("round_id") ?? ""));
  } catch (error) {
    return asError(error);
  }
  revalidatePath("/", "layout");
  redirect("/rounds");
}

// ----------------------------------------------------------------- practice

export type PracticePrioritiesState = ActionState & { drillIds?: string[] };

export async function savePracticePrioritiesAction(
  _prev: PracticePrioritiesState,
  formData: FormData,
): Promise<PracticePrioritiesState> {
  const user = await requireUser();
  const parsed = practicePrioritiesSchema.safeParse({ drill_ids: list(formData, "drill_ids") });
  if (!parsed.success) return { ok: false, message: "Choose drills from the practice list." };
  try {
    await repo.savePracticeDrillPriorities(user.id, parsed.data.drill_ids);
  } catch (error) {
    return asError(error);
  }
  revalidatePath("/practice");
  revalidatePath("/practice/start");
  return { ok: true, message: "Your practice priorities are saved.", drillIds: parsed.data.drill_ids };
}

export async function createPracticeSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = practiceSessionSchema.safeParse({
    minutes: formData.get("minutes"),
    goal: formData.get("goal"),
    location: formData.get("location") || undefined,
    energy_level: formData.get("energy_level") || undefined,
    scheduled_for: formData.get("scheduled_for"),
  });
  if (!parsed.success) return fail(parsed.error);

  let sessionId: string;
  try {
    // The band for today's test is the one the last test earned.
    const player = await loadPlayerState(user.id);
    const priorities = rankPracticeDrills(player.drills, player)
      .filter(({ drill }) => player.practiceDrillPriorities.includes(drill.id))
      .map(({ drill }) => drill.id);
    const last = player.drillAttempts
      .filter((attempt) => attempt.drill_id === `drill_${parsed.data.goal}` && attempt.shot_offsets?.length)
      .sort((a, b) => a.completed_at.localeCompare(b.completed_at))
      .at(-1);
    const plan = buildPlan(parsed.data.minutes, parsed.data.goal, last?.shot_offsets, priorities);

    const session = await repo.createPracticeSession(
      {
        user_id: user.id,
        title: plan.title,
        location: parsed.data.location ?? null,
        focus: plan.focus,
        planned_duration: parsed.data.minutes,
        actual_duration: null,
        energy_level: parsed.data.energy_level ?? null,
        status: "in_progress",
        scheduled_for: parsed.data.scheduled_for,
        completed_at: null,
        reflection: null,
      },
      plan.items,
    );
    sessionId = session.id;
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/practice");
  redirect(`/practice/sessions/${sessionId}`);
}

export async function recordAttemptAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  let points: unknown = null;
  try {
    const raw = formData.get("shot_points");
    points = raw ? JSON.parse(String(raw)) : null;
  } catch {
    return { ok: false, message: "Please enter valid shot estimates." };
  }
  const parsed = drillAttemptSchema.safeParse({
    session_id: formData.get("session_id"),
    practice_item_id: formData.get("practice_item_id") || null,
    drill_id: formData.get("drill_id"),
    attempts: formData.get("attempts"),
    successes: formData.get("successes"),
    shot_points: points,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return fail(parsed.error);
  if (!DRILLS_BY_ID.has(parsed.data.drill_id)) {
    return { ok: false, message: "Unknown drill." };
  }

  try {
    const practice = await repo.getPracticeSession(user.id, parsed.data.session_id);
    const item = practice?.items.find((item) => item.id === parsed.data.practice_item_id && item.drill_id === parsed.data.drill_id);
    if (!practice || !item || practice.session.status === "complete") {
      return { ok: false, message: "This practice is unavailable or already complete." };
    }
    const goal = practiceGoal(parsed.data.drill_id);
    if (goal && parsed.data.attempts !== item.target_reps) {
      return { ok: false, message: `This goal uses ${item.target_reps} balls.` };
    }
    // Scored against the band stored with the block, not today's default, so
    // a result means the same thing however far the target has moved since.
    const tolerance = goal ? (item.tolerance ?? goal.tolerance) : null;
    const plotted = parsed.data.shot_points;
    if (goal && tolerance !== null && (!plotted || plotted.length !== item.target_reps)) {
      return { ok: false, message: `Plot all ${item.target_reps} balls before saving.` };
    }
    const estimates =
      goal && tolerance !== null && plotted ? plotted.map((point) => offsetFor(goal, point)) : null;
    const summary = tolerance !== null && estimates ? dispersion(estimates, tolerance) : null;
    const attempts = summary?.count ?? parsed.data.attempts;
    const successes = summary?.successes ?? parsed.data.successes;
    await repo.recordDrillAttempt({
      user_id: user.id,
      session_id: parsed.data.session_id,
      practice_item_id: parsed.data.practice_item_id,
      drill_id: parsed.data.drill_id,
      attempts,
      successes,
      score: Math.round((successes / attempts) * 1000) / 1000,
      raw_value: summary?.averageMiss ?? null,
      shot_offsets: estimates,
      shot_points: plotted,
      notes: parsed.data.notes,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "Result saved." };
}

export async function completeSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const sessionId = String(formData.get("session_id") ?? "");
  const reflection = String(formData.get("reflection") ?? "").trim();
  const duration = Number(formData.get("actual_duration") ?? 0);

  try {
    const practice = await repo.getPracticeSession(user.id, sessionId);
    // The skill block is the test the next plan is built from. The others are
    // worth logging, but a skipped warm-up should not hold the session open.
    const logged = (itemId: string) => practice?.attempts.some((attempt) => attempt.practice_item_id === itemId);
    const tests = practice?.items.filter((item) => item.block === "skill") ?? [];
    if (!practice || practice.attempts.length === 0 || !tests.every((item) => logged(item.id))) {
      return { ok: false, message: "Save your test result before finishing practice." };
    }
    if (practice.session.status === "complete") return { ok: false, message: "Practice is already complete." };
    if (!Number.isFinite(duration) || duration < 1 || duration > 300 || reflection.length > 1000) {
      return { ok: false, message: "Enter 1–300 minutes and a reflection under 1,000 characters." };
    }
    await repo.updatePracticeSession(user.id, sessionId, {
      status: "complete",
      completed_at: new Date().toISOString(),
      actual_duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
      reflection: reflection || null,
    });
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/", "layout");
  redirect(`/practice/sessions/${sessionId}`);
}

export async function deletePracticeSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const sessionId = String(formData.get("session_id") ?? "");
  if (!sessionId) return { ok: false, message: "Missing practice session." };

  try {
    const practice = await repo.getPracticeSession(user.id, sessionId);
    if (!practice) return { ok: false, message: "Practice session not found." };
    await repo.deletePracticeSession(user.id, sessionId);
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/", "layout");
  redirect("/practice");
}

// ------------------------------------------------------------------- swing

export async function createSwingSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = swingSessionSchema.safeParse({
    club: formData.get("club"),
    camera_angle: formData.get("camera_angle"),
    shot_type: formData.get("shot_type"),
    swing_pattern: formData.get("swing_pattern"),
    video_url: formData.get("video_url") || "",
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return fail(parsed.error);

  let created;
  try {
    if (repo.mode() === "supabase") {
      const path = privateVideoPath(parsed.data.video_url ?? "", user.id);
      if (!path) return { ok: false, message: "Upload a video to your account before saving." };
      const sb = serverClient(await cookies())!;
      const { error } = await sb.storage.from("swing-videos").createSignedUrl(path, 60);
      if (error) return { ok: false, message: "The video upload could not be verified. Please try again." };
    }
    created = await repo.createSwingSession({
      user_id: user.id,
      video_url: parsed.data.video_url || null,
      camera_angle: parsed.data.camera_angle,
      club: parsed.data.club,
      shot_type: parsed.data.shot_type,
      swing_pattern: parsed.data.swing_pattern,
      notes: parsed.data.notes ?? null,
      analysis_status: "manual",
      clip_start: null,
      clip_end: null,
    });
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/swing");
  return { ok: true, message: "Swing session added.", id: created.id };
}

export async function addSwingFindingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = swingFindingSchema.safeParse({
    swing_session_id: formData.get("swing_session_id"),
    category: formData.get("category"),
    issue: formData.get("issue"),
    severity: formData.get("severity"),
    confidence: formData.get("confidence"),
    certainty: formData.get("certainty"),
    description: formData.get("description") ?? "",
    why_it_matters: formData.get("why_it_matters") ?? "",
    related_skill: formData.get("related_skill") || null,
    recommended_drill_id: formData.get("recommended_drill_id") || null,
  });
  if (!parsed.success) return fail(parsed.error);

  try {
    const sessions = await repo.getSwingSessions(user.id);
    if (!sessions.some((session) => session.id === parsed.data.swing_session_id)) {
      return { ok: false, message: "Swing not found." };
    }
    await repo.addSwingFinding({
      swing_session_id: parsed.data.swing_session_id,
      user_id: user.id,
      category: parsed.data.category,
      issue: parsed.data.issue,
      severity: parsed.data.severity,
      confidence: parsed.data.confidence,
      certainty: parsed.data.certainty,
      description: parsed.data.description,
      why_it_matters: parsed.data.why_it_matters,
      recommended_drill_id: parsed.data.recommended_drill_id,
      related_skill: parsed.data.related_skill,
      source: "manual",
    });
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/swing");
  return { ok: true, message: "Finding recorded." };
}

export async function deleteSwingFindingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await repo.deleteSwingFinding(user.id, String(formData.get("finding_id") ?? ""));
  } catch (error) {
    return asError(error);
  }
  revalidatePath("/swing");
  return { ok: true };
}

/**
 * Record one swing measurement. Values are entered by a person, so the row is
 * stored with the confidence they chose rather than an assumed certainty.
 */
/** Delete a swing, its video, its measurements and its findings. */
export async function deleteSwingSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const id = String(formData.get("swing_session_id") ?? "");
  if (!id) return { ok: false, message: "Unknown swing." };
  try {
    await repo.deleteSwingSession(user.id, id);
  } catch (error) {
    return asError(error);
  }
  revalidatePath("/", "layout");
  redirect("/swing");
}

/**
 * Save a trim. Both handles are checked here because the values come from a
 * range input the client can set to anything, and the range they describe is
 * what later playback obeys.
 */
const clipSchema = z.object({
  swing_session_id: z.string().min(1).max(80),
  start: z.number().min(0).max(3600),
  end: z.number().min(0).max(3600),
});

export async function saveSwingClipAction(input: {
  swing_session_id: string;
  start: number;
  end: number;
}): Promise<ActionState> {
  const user = await requireUser();
  const parsed = clipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That trim could not be saved." };

  const { start, end } = parsed.data;
  // A trim shorter than this is a mis-drag; clearing it plays the whole clip.
  const clip = end - start >= 0.2 ? { start, end } : null;

  const sessions = await repo.getSwingSessions(user.id);
  if (!sessions.some((session) => session.id === parsed.data.swing_session_id)) {
    return { ok: false, message: "That swing session does not exist." };
  }

  try {
    await repo.saveSwingClip(user.id, parsed.data.swing_session_id, clip);
  } catch (error) {
    return asError(error);
  }
  revalidatePath(`/swing/${parsed.data.swing_session_id}`);
  return { ok: true, message: clip ? "Trim saved." : "Playing the whole clip." };
}

export async function saveMeasurementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = measurementSchema.safeParse({
    swing_session_id: formData.get("swing_session_id"),
    metric: formData.get("metric"),
    value: formData.get("value"),
    confidence: formData.get("confidence"),
  });
  if (!parsed.success) return fail(parsed.error);

  const metric = METRICS_BY_ID.get(parsed.data.metric);
  if (!metric) return { ok: false, message: "Unknown measurement." };

  const sessions = await repo.getSwingSessions(user.id);
  if (!sessions.some((session) => session.id === parsed.data.swing_session_id)) {
    return { ok: false, message: "That swing session does not exist." };
  }

  try {
    await repo.saveSwingMeasurement({
      swing_session_id: parsed.data.swing_session_id,
      phase: metric.phase,
      metric: metric.id,
      value: parsed.data.value,
      unit: metric.unit,
      confidence: parsed.data.confidence,
      source: "manual",
    });
  } catch (error) {
    return asError(error);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

// --------------------------------------------------------------- ask agent

/**
 * Read-only: it searches the signed-in player's own computed data and returns
 * where to look. Nothing here writes, so there is no revalidation to do.
 */
export async function askAction(_prev: AskState, formData: FormData): Promise<AskState> {
  const user = await requireUser();
  const question = String(formData.get("question") ?? "");
  try {
    return await askCoach(question, await loadPlayerState(user.id));
  } catch (error) {
    return {
      ...ASK_IDLE,
      question,
      message: error instanceof Error ? error.message : "Could not search your data.",
    };
  }
}

// ---------------------------------------------------------- swing analysis

/**
 * Frames arrive as base64 JPEG from the browser, so the boundary is checked
 * before anything is spent on a model call: how many, how big, and that the
 * payload really is base64. The session must also belong to the caller - the
 * id is a client-supplied string and nothing downstream re-checks it.
 */
const framesSchema = z.object({
  swing_session_id: z.string().min(1).max(80),
  frames: z
    .array(
      z
        .string()
        .min(100)
        .max(500_000)
        .regex(/^[A-Za-z0-9+/=]+$/, "Frames must be base64."),
    )
    .min(1)
    .max(FRAME_COUNT),
});

export type AnalyzeState = ActionState & {
  measurements?: number;
  findings?: number;
  summary?: string;
  skipped?: number;
};

export async function analyzeSwingAction(input: {
  swing_session_id: string;
  frames: string[];
}): Promise<AnalyzeState> {
  const user = await requireUser();
  const parsed = framesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Those frames could not be read." };

  const total = parsed.data.frames.reduce((sum, frame) => sum + frame.length, 0);
  if (total > 2_500_000) return { ok: false, message: "Those frames are too large to analyse." };

  const sessions = await repo.getSwingSessions(user.id);
  const session = sessions.find((item) => item.id === parsed.data.swing_session_id);
  if (!session) return { ok: false, message: "That swing session does not exist." };

  const result = await analyzeSwingFrames(session, parsed.data.frames);
  if (!result.data.usable) {
    return { ok: false, message: result.note ?? visionNote(result.data, 0) };
  }

  /*
    A hand-entered value outranks an estimate, always. Re-running the analysis
    must never quietly overwrite a number the player or their coach typed in,
    so those metrics are skipped and counted rather than replaced.
  */
  const existing = await repo.getSwingMeasurements(user.id);
  const manual = new Set(
    existing
      .filter((row) => row.swing_session_id === session.id && row.source === "manual")
      .map((row) => row.metric),
  );

  const candidates = acceptMeasurements(result.data, session.id);
  const toSave = candidates.filter((row) => !manual.has(row.metric));

  try {
    // Replace the previous reading rather than adding a second one beside it.
    const findings = await repo.getSwingFindings(user.id);
    for (const finding of findings) {
      if (finding.swing_session_id === session.id && finding.source === "vision") {
        await repo.deleteSwingFinding(user.id, finding.id);
      }
    }
    for (const measurement of toSave) await repo.saveSwingMeasurement(measurement);
    for (const finding of acceptFindings(result.data, session.id, user.id)) {
      await repo.addSwingFinding(finding);
    }
  } catch (error) {
    return asError(error);
  }

  revalidatePath(`/swing/${session.id}`);
  revalidatePath("/swing");
  revalidatePath("/practice");
  return {
    ok: true,
    message: visionNote(result.data, toSave.length),
    measurements: toSave.length,
    findings: result.data.findings.length,
    summary: result.data.summary,
    skipped: candidates.length - toSave.length,
  };
}

/**
 * Store visible joints and analyse projected motion. Inferred depth does not
 * produce capture-style body measurements. Manual measurements stay intact.
 */
export type PoseState = ActionState & {
  measurements?: number;
  skipped?: number;
  /** No swing was found in the skeleton, so there is nothing to keep. */
  noSwing?: boolean;
};

export async function savePoseModelAction(input: {
  swing_session_id: string;
  t: number[];
  frames: PackedLandmark[][];
  imageFrames?: PackedLandmark[][];
  /** The video's width over its height; needed to rebuild from the picture. */
  aspect?: number;
  cameraAngle?: MotionView;
  clip?: [number, number];
  phases?: SwingPhases;
}): Promise<PoseState> {
  const user = await requireUser();
  const parsed = poseModelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That swing model could not be read." };

  const [sessions, profile] = await Promise.all([repo.getSwingSessions(user.id), repo.getProfile(user.id)]);
  const session = sessions.find((item) => item.id === parsed.data.swing_session_id);
  if (!session) return { ok: false, message: "That swing session does not exist." };

  const detected = unpackFrames(parsed.data);
  return storeMotion(user.id, session.id, profile?.dominant_hand ?? "right", detected, {
    aspect: parsed.data.aspect ?? 0,
    view: parsed.data.cameraAngle ?? (session.camera_angle === "face_on" || session.camera_angle === "down_the_line" ? session.camera_angle : "other"),
    clip: parsed.data.clip,
    phases: parsed.data.phases,
  });
}

/**
 * Move the three phases on a stored model and measure it again. The model
 * already on the swing is what gets measured, so nothing is uploaded twice
 * and a rebuilt model keeps the movements it can support.
 */
export async function retimeSwingAction(input: {
  swing_session_id: string;
  phases: SwingPhases;
}): Promise<PoseState> {
  const user = await requireUser();
  const parsed = retimeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Address, top and impact must be three frames in that order." };
  const model = await repo.getSwingModel(user.id, parsed.data.swing_session_id);
  if (!model) return { ok: false, message: "Measure the swing before moving its phases." };
  if (parsed.data.phases.impact >= model.t.length) {
    return { ok: false, message: "Impact is past the end of the clip." };
  }
  if (!model.imageFrames || !model.aspect) return { ok: false, message: "Analyze movement again to track the joints on the original video." };
  return storeMotion(user.id, parsed.data.swing_session_id, model.handedness, unpackFrames(model), {
    aspect: model.aspect,
    view: model.cameraAngle ?? "other",
    clip: model.clip,
    phases: parsed.data.phases,
  });
}

async function storeMotion(
  userId: string,
  sessionId: string,
  handedness: "right" | "left",
  frames: PoseFrame[],
  options: { aspect: number; view: MotionView; phases?: SwingPhases; clip?: [number, number] },
): Promise<PoseState> {
  const analysis = analyseMotion(frames, options.aspect, options.view, handedness, options.phases);
  if (analysis.quality.coverage < 0.65 || frames.length < 8 || (options.phases && !analysis.usable)) {
    return { ok: false, noSwing: true, message: analysis.summary };
  }
  if (!analysis.usable) {
    const previous = await repo.getSwingModel(userId, sessionId);
    if (previous?.motionVersion === 1 && previous.imageFrames && previous.aspect) {
      const previousReport = analyseMotion(unpackFrames(previous), previous.aspect, previous.cameraAngle ?? "other", previous.handedness, previous.phasesConfirmed ? previous.phases : undefined);
      if (previousReport.usable) return { ok: false, noSwing: true, message: `${analysis.summary} Your previous analysis has been kept.` };
    }
  }

  try {
    await repo.saveSwingModel(userId, sessionId, {
      v: 1,
      handedness,
      // Legacy storage requires indices even when timing cannot be resolved.
      // The report and overlay use detected timing, never these placeholders.
      phases: analysis.phases ?? { address: 0, top: Math.floor(frames.length / 2), impact: frames.length - 1 },
      ...packFrames(frames),
      aspect: options.aspect,
      cameraAngle: options.view,
      motionVersion: 1,
      phasesConfirmed: Boolean(options.phases),
      timingStatus: options.phases ? "confirmed" : analysis.phases ? "estimated" : "unresolved",
      clip: options.clip,
    });
    // Retire the old depth-derived readings after a successful replacement.
    await repo.deleteSwingMeasurementsBySource(userId, sessionId, "pose");
  } catch (error) {
    return asError(error);
  }

  revalidatePath(`/swing/${sessionId}`);
  revalidatePath("/swing");
  revalidatePath("/practice");
  return {
    ok: true,
    measurements: analysis.readings.length,
    message: !analysis.phases ? analysis.summary : `Analyzed ${motionCriteria(options.view).filter((criterion) => analysis.readings.some((reading) => reading.id === criterion.id)).length} of 12 video criteria across ${analysis.quality.total} body samples. ${analysis.timing?.topWindow ? "The briefly hidden backswing transition is reported as a range." : "Swing positions were detected automatically."}`,
  };
}

// -------------------------------------------------------------------- misc// -------------------------------------------------------------------- misc

export async function signOutAction(): Promise<void> {
  await repo.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

/**
 * Close the account. The typed confirmation is the guard: this cannot be
 * undone and there is no trash to recover it from.
 */
export async function deleteAccountAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    return { ok: false, message: 'Type "delete" to confirm.' };
  }
  try {
    await repo.deleteAccount(user.id);
    await repo.signOut();
  } catch (error) {
    return asError(error);
  }
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function resetDemoAction(): Promise<void> {
  if (repo.mode() !== "demo") return;
  resetDemoStore();
  revalidatePath("/", "layout");
  redirect("/practice");
}
