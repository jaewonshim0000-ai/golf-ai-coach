"use server";
import { dispersion, practiceGoal } from "@/lib/practice/goals";
import { cookies } from "next/headers";
import { serverClient } from "@/lib/db/supabase";
import { privateVideoPath } from "@/lib/video-upload";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { Condition, MissDirection } from "@/types/golf";
import type { Goal, PracticeFacility } from "@/types/player";
import type { Club } from "@/types/golf";
import type { PracticeItem } from "@/types/practice";
import { ASK_IDLE, askCoach, type AskState } from "@/lib/ai/ask";
import {
  FRAME_COUNT,
  acceptFindings,
  acceptMeasurements,
  analyzeSwingFrames,
  visionNote,
} from "@/lib/ai/vision";
import { METRICS_BY_ID } from "@/lib/golf/swing-metrics";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import { loadPlayerState } from "@/lib/player-state";
import * as repo from "@/lib/db/repo";
import { resetDemoStore } from "@/lib/db/demo-store";
import type { ActionState } from "@/lib/action-state";
import {
  courseSchema,
  drillAttemptSchema,
  fieldErrors,
  measurementSchema,
  practiceSessionSchema,
  profileSchema,
  roundSchema,
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

export async function createCourseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = courseSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city") || undefined,
    pars: list(formData, "par"),
    yards: list(formData, "yards"),
  });
  if (!parsed.success) return fail(parsed.error);

  try {
    await repo.createCourse({
      user_id: user.id,
      name: parsed.data.name,
      city: parsed.data.city ?? null,
      par: parsed.data.pars.reduce((a, b) => a + b, 0),
      holes: parsed.data.pars.map((par, index) => ({
        hole_number: index + 1,
        par,
        yards: parsed.data.yards[index] ?? 400,
      })),
    });
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/rounds");
  return { ok: true, message: "Course added." };
}

export async function createRoundAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = roundSchema.safeParse({
    course_id: formData.get("course_id"),
    played_on: formData.get("played_on"),
    tees: formData.get("tees") || undefined,
    conditions: list(formData, "conditions"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return fail(parsed.error);

  let roundId: string;
  try {
    const courses = await repo.getCourses(user.id);
    const course = courses.find((c) => c.id === parsed.data.course_id);
    if (!course) return { ok: false, message: "That course no longer exists." };

    const round = await repo.createRound({
      user_id: user.id,
      course_id: course.id,
      course_name: course.name,
      played_on: parsed.data.played_on,
      tees: parsed.data.tees ?? null,
      holes_played: 0,
      score: null,
      conditions: parsed.data.conditions as Condition[],
      notes: parsed.data.notes ?? null,
      status: "in_progress",
    });
    roundId = round.id;
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/rounds");
  redirect(`/rounds/${roundId}/play`);
}

export async function addShotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = shotSchema.safeParse({
    round_id: formData.get("round_id"),
    hole_number: formData.get("hole_number"),
    hole_par: formData.get("hole_par"),
    shot_number: formData.get("shot_number"),
    starting_location: formData.get("starting_location"),
    starting_distance: formData.get("starting_distance"),
    starting_unit: formData.get("starting_unit"),
    club: formData.get("club") || null,
    shot_type: formData.get("shot_type"),
    ending_location: formData.get("ending_location"),
    ending_distance: formData.get("ending_distance"),
    ending_unit: formData.get("ending_unit"),
    penalty_strokes: formData.get("penalty_strokes") ?? 0,
    penalty_type: formData.get("penalty_type") || "none",
    miss_direction: formData.get("miss_direction") || null,
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return fail(parsed.error);

  try {
    const round = await repo.getRound(user.id, parsed.data.round_id);
    if (!round) return { ok: false, message: "Round not found." };
    if (round.status === "complete") return { ok: false, message: "This round is already complete." };
    await repo.addShot({ ...parsed.data, user_id: user.id, intended_target: null, lie: parsed.data.starting_location });
  } catch (error) {
    return asError(error);
  }

  revalidatePath(`/rounds/${parsed.data.round_id}`);
  return { ok: true };
}

export async function deleteShotAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const shotId = String(formData.get("shot_id") ?? "");
  const roundId = String(formData.get("round_id") ?? "");
  if (!shotId) return { ok: false, message: "Missing shot." };
  try {
    await repo.deleteShot(user.id, shotId);
  } catch (error) {
    return asError(error);
  }
  revalidatePath(`/rounds/${roundId}`);
  return { ok: true };
}

export async function finishRoundAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const roundId = String(formData.get("round_id") ?? "");
  try {
    const round = await repo.getRound(user.id, roundId);
    if (!round || round.status === "complete") return { ok: false, message: "This round is unavailable or already complete." };
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

export async function createPracticeSessionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = practiceSessionSchema.safeParse({
    title: formData.get("title"),
    location: formData.get("location") || undefined,
    focus: formData.get("focus"),
    planned_duration: formData.get("planned_duration"),
    energy_level: formData.get("energy_level") || undefined,
    scheduled_for: formData.get("scheduled_for"),
    drill_ids: list(formData, "drill_ids"),
  });
  if (!parsed.success) return fail(parsed.error);

  const unknown = parsed.data.drill_ids.filter((id) => !DRILLS_BY_ID.has(id));
  if (unknown.length > 0) return { ok: false, message: `Unknown drill: ${unknown[0]}` };

  let sessionId: string;
  try {
    const items: Omit<PracticeItem, "id" | "session_id">[] = parsed.data.drill_ids.map(
      (drillId, index) => {
        const drill = DRILLS_BY_ID.get(drillId)!;
        return {
          drill_id: drillId,
          block: "skill",
          order_index: index,
          duration: 10,
          target_reps: 10,
          target_value: drill.success_threshold,
          objective: `${drill.metric_to_track}: aim for ${Math.ceil(drill.success_threshold * 10)} of 10.`,
        };
      },
    );

    const session = await repo.createPracticeSession(
      {
        user_id: user.id,
        title: DRILLS_BY_ID.get(parsed.data.drill_ids[0]!)!.name,
        location: parsed.data.location ?? null,
        focus: DRILLS_BY_ID.get(parsed.data.drill_ids[0]!)!.category,
        planned_duration: 10,
        actual_duration: null,
        energy_level: parsed.data.energy_level ?? null,
        status: "in_progress",
        scheduled_for: parsed.data.scheduled_for,
        completed_at: null,
        reflection: null,
      },
      items,
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
  let offsets: unknown = null;
  try {
    const raw = formData.get("shot_offsets");
    offsets = raw ? JSON.parse(String(raw)) : null;
  } catch {
    return { ok: false, message: "Please enter valid shot estimates." };
  }
  const parsed = drillAttemptSchema.safeParse({
    session_id: formData.get("session_id"),
    practice_item_id: formData.get("practice_item_id") || null,
    drill_id: formData.get("drill_id"),
    attempts: formData.get("attempts"),
    successes: formData.get("successes"),
    shot_offsets: offsets,
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
    const estimates = parsed.data.shot_offsets;
    if (goal?.tolerance != null && (!estimates || estimates.length !== item.target_reps)) {
      return { ok: false, message: `Enter all ${item.target_reps} shot estimates before saving.` };
    }
    if (goal?.id === "chip_accuracy" && estimates?.some((value) => value < 0)) {
      return { ok: false, message: "Distance from the hole cannot be negative." };
    }
    const summary = goal?.tolerance != null && estimates ? dispersion(estimates, goal.tolerance) : null;
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
    if (!practice || practice.items.length === 0 || practice.items.some((item) => !practice.attempts.some((attempt) => attempt.practice_item_id === item.id))) {
      return { ok: false, message: "Save your result before finishing practice." };
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
    return { ok: false, message: visionNote(result.data, 0) };
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

// -------------------------------------------------------------------- misc

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
