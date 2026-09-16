"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { Condition, MissDirection } from "@/types/golf";
import type { Goal, PracticeFacility } from "@/types/player";
import type { Club } from "@/types/golf";
import type { PracticeItem } from "@/types/practice";
import { adaptPracticePlan, generatePracticePlan } from "@/lib/ai/practice-plan";
import { ASK_IDLE, askCoach, type AskState } from "@/lib/ai/ask";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import { loadPlayerState } from "@/lib/player-state";
import * as repo from "@/lib/db/repo";
import { resetDemoStore } from "@/lib/db/demo-store";
import type { ActionState } from "@/lib/action-state";
import {
  courseSchema,
  drillAttemptSchema,
  fieldErrors,
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
  redirect("/dashboard");
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
    const shots = await repo.getShots(user.id, roundId);
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
    plan_session_id: formData.get("plan_session_id") || null,
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
          block: index === 0 ? "warm_up" : index === 1 ? "technical" : index === 2 ? "skill" : "variable",
          order_index: index,
          duration: drill.recommended_duration,
          target_reps: drill.recommended_reps,
          target_value: drill.success_threshold,
          objective: `${drill.metric_to_track} at or above ${Math.round(drill.success_threshold * 100)}%.`,
        };
      },
    );

    const session = await repo.createPracticeSession(
      {
        user_id: user.id,
        plan_session_id: parsed.data.plan_session_id,
        title: parsed.data.title,
        location: parsed.data.location ?? null,
        focus: parsed.data.focus,
        planned_duration: parsed.data.planned_duration,
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

    if (parsed.data.plan_session_id) {
      await repo.updatePlanSession(parsed.data.plan_session_id, { session_id: session.id });
    }
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
  const parsed = drillAttemptSchema.safeParse({
    session_id: formData.get("session_id"),
    practice_item_id: formData.get("practice_item_id") || null,
    drill_id: formData.get("drill_id"),
    attempts: formData.get("attempts"),
    successes: formData.get("successes"),
    notes: formData.get("notes") || null,
  });
  if (!parsed.success) return fail(parsed.error);
  if (!DRILLS_BY_ID.has(parsed.data.drill_id)) {
    return { ok: false, message: "Unknown drill." };
  }

  try {
    await repo.recordDrillAttempt({
      user_id: user.id,
      session_id: parsed.data.session_id,
      practice_item_id: parsed.data.practice_item_id,
      drill_id: parsed.data.drill_id,
      attempts: parsed.data.attempts,
      successes: parsed.data.successes,
      score: Math.round((parsed.data.successes / parsed.data.attempts) * 1000) / 1000,
      raw_value: null,
      notes: parsed.data.notes,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    return asError(error);
  }

  revalidatePath(`/practice/sessions/${parsed.data.session_id}`);
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
    await repo.updatePracticeSession(user.id, sessionId, {
      status: "complete",
      completed_at: new Date().toISOString(),
      actual_duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null,
      reflection: reflection || null,
    });

    const bundle = await repo.getPracticeSession(user.id, sessionId);
    const planSessionId = bundle?.session.plan_session_id;
    if (planSessionId) {
      await repo.updatePlanSession(planSessionId, { status: "complete" });
    }
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/", "layout");
  redirect(`/practice/sessions/${sessionId}`);
}

// -------------------------------------------------------------------- plan

export async function generatePlanAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const weeks = Math.min(8, Math.max(1, Number(formData.get("weeks") ?? 2)));

  try {
    const state = await loadPlayerState(user.id);
    if (!state.profile || !state.context) {
      return { ok: false, message: "Set up your golf profile first." };
    }

    const result = await generatePracticePlan({
      profile: state.profile,
      weaknesses: state.weaknesses,
      practiceTrends: state.practiceTrends,
      context: state.context,
      weeks,
      startsOn: new Date().toISOString().slice(0, 10),
    });

    await repo.savePlan(user.id, result.data.plan, result.data.sessions);
    revalidatePath("/", "layout");
    return {
      ok: true,
      message:
        result.source === "ai"
          ? "New plan generated by your AI coach."
          : "New plan generated by the rule-based coach.",
    };
  } catch (error) {
    return asError(error);
  }
}

export async function adaptPlanAction(_prev: ActionState): Promise<ActionState> {
  const user = await requireUser();
  try {
    const state = await loadPlayerState(user.id);
    if (!state.plan || !state.context) {
      return { ok: false, message: "There is no active plan to adapt." };
    }

    const result = await adaptPracticePlan({
      plan: state.plan.plan,
      sessions: state.plan.sessions,
      practiceTrends: state.practiceTrends,
      context: state.context,
      trigger: "Manual re-evaluation",
    });

    await repo.addPlanAdaptation({
      plan_id: state.plan.plan.id,
      created_at: new Date().toISOString(),
      trigger: "Manual re-evaluation",
      verdict: result.data.verdict,
      summary: result.data.summary,
      changes: result.data.changes,
    });

    revalidatePath("/plans");
    return { ok: true, message: "Plan re-evaluated." };
  } catch (error) {
    return asError(error);
  }
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

  try {
    await repo.createSwingSession({
      user_id: user.id,
      video_url: parsed.data.video_url || null,
      camera_angle: parsed.data.camera_angle,
      club: parsed.data.club,
      shot_type: parsed.data.shot_type,
      swing_pattern: parsed.data.swing_pattern,
      notes: parsed.data.notes ?? null,
      analysis_status: "manual",
    });
  } catch (error) {
    return asError(error);
  }

  revalidatePath("/swing");
  return { ok: true, message: "Swing session added." };
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

// -------------------------------------------------------------------- misc

export async function signOutAction(): Promise<void> {
  await repo.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function resetDemoAction(): Promise<void> {
  if (repo.mode() !== "demo") return;
  resetDemoStore();
  revalidatePath("/", "layout");
  redirect("/dashboard");
}
