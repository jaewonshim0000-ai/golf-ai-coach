import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { HandicapEntry, PlayerProfile, User } from "../../types/player";
import type { Course, Round, Shot } from "../../types/rounds";
import type {
  Drill,
  DrillAttempt,
  PracticeItem,
  PracticeSession,
  SwingFinding,
  SwingMeasurement,
  SwingSession,
} from "../../types/practice";
import { DRILLS } from "../seed/drills";
import { serverClient, supabaseConfigured } from "./supabase";
import { DEMO_USER_ID, newId, store } from "./demo-store";

/**
 * Single data-access layer.
 *
 * Every page and server action goes through here. Each function has the same
 * shape: use Supabase when it is configured, otherwise the in-memory demo
 * store. No page ever knows which one it got.
 *
 * Row-level security means the Supabase branch never needs to filter by user
 * itself for reads - but it does anyway, so a misconfigured policy fails
 * closed rather than leaking.
 */

export type Mode = "demo" | "supabase";

export function mode(): Mode {
  return supabaseConfigured() ? "supabase" : "demo";
}

async function client(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured()) return null;
  const cookieStore = await cookies();
  return serverClient(cookieStore);
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return (result.data ?? []) as T;
}

// ------------------------------------------------------------------- auth

export type SessionUser = { id: string; email: string; name: string | null };

export async function currentUser(): Promise<SessionUser | null> {
  const sb = await client();
  if (!sb) {
    const demo = store().user;
    return { id: demo.id, email: demo.email, name: demo.name };
  }
  const { data } = await sb.auth.getUser();
  if (!data.user) return null;
  return {
    id: data.user.id,
    email: data.user.email ?? "",
    name: (data.user.user_metadata?.name as string | undefined) ?? null,
  };
}

export async function signOut(): Promise<void> {
  const sb = await client();
  await sb?.auth.signOut();
}

// --------------------------------------------------------------- profile

export async function getProfile(userId: string): Promise<PlayerProfile | null> {
  const sb = await client();
  if (!sb) return store().profile;
  const { data, error } = await sb
    .from("player_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getProfile: ${error.message}`);
  return (data as PlayerProfile | null) ?? null;
}

export async function upsertProfile(profile: PlayerProfile): Promise<PlayerProfile> {
  const sb = await client();
  const next = { ...profile, updated_at: new Date().toISOString() };
  if (!sb) {
    store().profile = next;
    return next;
  }
  const { data, error } = await sb
    .from("player_profiles")
    .upsert(next, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw new Error(`upsertProfile: ${error.message}`);
  return data as PlayerProfile;
}

export async function getHandicapHistory(userId: string): Promise<HandicapEntry[]> {
  const sb = await client();
  if (!sb) return store().handicapHistory;
  return unwrap(
    await sb.from("handicap_entries").select("*").eq("user_id", userId).order("recorded_on"),
    "getHandicapHistory",
  );
}

export async function addHandicapEntry(entry: Omit<HandicapEntry, "id">): Promise<void> {
  const sb = await client();
  if (!sb) {
    store().handicapHistory.push({ ...entry, id: newId("hcp") });
    return;
  }
  const { error } = await sb.from("handicap_entries").insert(entry);
  if (error) throw new Error(`addHandicapEntry: ${error.message}`);
}

// --------------------------------------------------------------- drills

/** Drills are reference data shipped with the app and mirrored into Postgres. */
export function getDrills(): Drill[] {
  return DRILLS;
}

// --------------------------------------------------------------- courses

export async function getCourses(userId: string): Promise<Course[]> {
  const sb = await client();
  if (!sb) return store().courses;
  return unwrap(
    await sb.from("courses").select("*").or(`user_id.is.null,user_id.eq.${userId}`).order("name"),
    "getCourses",
  );
}

export async function createCourse(course: Omit<Course, "id" | "created_at">): Promise<Course> {
  const sb = await client();
  const row: Course = { ...course, id: newId("course"), created_at: new Date().toISOString() };
  if (!sb) {
    store().courses.push(row);
    return row;
  }
  const { data, error } = await sb.from("courses").insert(row).select().single();
  if (error) throw new Error(`createCourse: ${error.message}`);
  return data as Course;
}

// ---------------------------------------------------------------- rounds

export async function getRounds(userId: string): Promise<Round[]> {
  const sb = await client();
  if (!sb) {
    return [...store().rounds].sort((a, b) => b.played_on.localeCompare(a.played_on));
  }
  return unwrap(
    await sb.from("rounds").select("*").eq("user_id", userId).order("played_on", { ascending: false }),
    "getRounds",
  );
}

export async function getRound(userId: string, roundId: string): Promise<Round | null> {
  const sb = await client();
  if (!sb) return store().rounds.find((r) => r.id === roundId) ?? null;
  const { data, error } = await sb
    .from("rounds")
    .select("*")
    .eq("user_id", userId)
    .eq("id", roundId)
    .maybeSingle();
  if (error) throw new Error(`getRound: ${error.message}`);
  return (data as Round | null) ?? null;
}

export async function createRound(round: Omit<Round, "id" | "created_at">): Promise<Round> {
  const sb = await client();
  const row: Round = { ...round, id: newId("round"), created_at: new Date().toISOString() };
  if (!sb) {
    store().rounds.push(row);
    return row;
  }
  const { data, error } = await sb.from("rounds").insert(row).select().single();
  if (error) throw new Error(`createRound: ${error.message}`);
  return data as Round;
}

export async function updateRound(
  userId: string,
  roundId: string,
  patch: Partial<Round>,
): Promise<void> {
  const sb = await client();
  if (!sb) {
    const rounds = store().rounds;
    const index = rounds.findIndex((r) => r.id === roundId);
    if (index >= 0) rounds[index] = { ...rounds[index]!, ...patch };
    return;
  }
  const { error } = await sb.from("rounds").update(patch).eq("id", roundId).eq("user_id", userId);
  if (error) throw new Error(`updateRound: ${error.message}`);
}

export async function deleteRound(userId: string, roundId: string): Promise<void> {
  const sb = await client();
  if (!sb) {
    const s = store();
    s.rounds = s.rounds.filter((r) => r.id !== roundId);
    s.shots = s.shots.filter((x) => x.round_id !== roundId);
    return;
  }
  const { error } = await sb.from("rounds").delete().eq("id", roundId).eq("user_id", userId);
  if (error) throw new Error(`deleteRound: ${error.message}`);
}

// ----------------------------------------------------------------- shots

export async function getShots(userId: string, roundId?: string): Promise<Shot[]> {
  const sb = await client();
  if (!sb) {
    const shots = roundId ? store().shots.filter((s) => s.round_id === roundId) : store().shots;
    return [...shots].sort(
      (a, b) => a.hole_number - b.hole_number || a.shot_number - b.shot_number,
    );
  }
  let query = sb.from("shots").select("*").eq("user_id", userId);
  if (roundId) query = query.eq("round_id", roundId);
  return unwrap(await query.order("hole_number").order("shot_number"), "getShots");
}

export async function addShot(shot: Omit<Shot, "id" | "created_at">): Promise<Shot> {
  const sb = await client();
  const row: Shot = { ...shot, id: newId("shot"), created_at: new Date().toISOString() };
  if (!sb) {
    store().shots.push(row);
    return row;
  }
  const { data, error } = await sb.from("shots").insert(row).select().single();
  if (error) throw new Error(`addShot: ${error.message}`);
  return data as Shot;
}

export async function deleteShot(userId: string, shotId: string): Promise<void> {
  const sb = await client();
  if (!sb) {
    const s = store();
    s.shots = s.shots.filter((x) => x.id !== shotId);
    return;
  }
  const { error } = await sb.from("shots").delete().eq("id", shotId).eq("user_id", userId);
  if (error) throw new Error(`deleteShot: ${error.message}`);
}

// -------------------------------------------------------------- practice

export async function getPracticeSessions(userId: string): Promise<PracticeSession[]> {
  const sb = await client();
  if (!sb) {
    return [...store().practiceSessions].sort((a, b) =>
      b.scheduled_for.localeCompare(a.scheduled_for),
    );
  }
  return unwrap(
    await sb
      .from("practice_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("scheduled_for", { ascending: false }),
    "getPracticeSessions",
  );
}

export async function getPracticeSession(
  userId: string,
  sessionId: string,
): Promise<{ session: PracticeSession; items: PracticeItem[]; attempts: DrillAttempt[] } | null> {
  const sb = await client();
  if (!sb) {
    const s = store();
    const session = s.practiceSessions.find((x) => x.id === sessionId);
    if (!session) return null;
    return {
      session,
      items: s.practiceItems
        .filter((i) => i.session_id === sessionId)
        .sort((a, b) => a.order_index - b.order_index),
      attempts: s.drillAttempts.filter((a) => a.session_id === sessionId),
    };
  }
  const { data: session, error } = await sb
    .from("practice_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getPracticeSession: ${error.message}`);
  if (!session) return null;
  const items = unwrap(
    await sb.from("practice_items").select("*").eq("session_id", sessionId).order("order_index"),
    "getPracticeSession.items",
  ) as PracticeItem[];
  const attempts = unwrap(
    await sb.from("drill_attempts").select("*").eq("session_id", sessionId),
    "getPracticeSession.attempts",
  ) as DrillAttempt[];
  return { session: session as PracticeSession, items, attempts };
}

export async function createPracticeSession(
  session: Omit<PracticeSession, "id" | "created_at">,
  items: Omit<PracticeItem, "id" | "session_id">[],
): Promise<PracticeSession> {
  const sb = await client();
  const row: PracticeSession = {
    ...session,
    id: newId("practice"),
    created_at: new Date().toISOString(),
  };
  const itemRows: PracticeItem[] = items.map((item, index) => ({
    ...item,
    id: `${row.id}_item_${index}`,
    session_id: row.id,
  }));

  if (!sb) {
    store().practiceSessions.push(row);
    store().practiceItems.push(...itemRows);
    return row;
  }
  const { data, error } = await sb.from("practice_sessions").insert(row).select().single();
  if (error) throw new Error(`createPracticeSession: ${error.message}`);
  if (itemRows.length > 0) {
    const { error: itemError } = await sb.from("practice_items").insert(itemRows);
    if (itemError) throw new Error(`createPracticeSession.items: ${itemError.message}`);
  }
  return data as PracticeSession;
}

export async function updatePracticeSession(
  userId: string,
  sessionId: string,
  patch: Partial<PracticeSession>,
): Promise<void> {
  const sb = await client();
  if (!sb) {
    const sessions = store().practiceSessions;
    const index = sessions.findIndex((s) => s.id === sessionId);
    if (index >= 0) sessions[index] = { ...sessions[index]!, ...patch };
    return;
  }
  const { error } = await sb
    .from("practice_sessions")
    .update(patch)
    .eq("id", sessionId)
    .eq("user_id", userId);
  if (error) throw new Error(`updatePracticeSession: ${error.message}`);
}

export async function getDrillAttempts(userId: string): Promise<DrillAttempt[]> {
  const sb = await client();
  if (!sb) {
    return [...store().drillAttempts].sort((a, b) => a.completed_at.localeCompare(b.completed_at));
  }
  return unwrap(
    await sb.from("drill_attempts").select("*").eq("user_id", userId).order("completed_at"),
    "getDrillAttempts",
  );
}

export async function recordDrillAttempt(
  attempt: Omit<DrillAttempt, "id">,
): Promise<DrillAttempt> {
  const sb = await client();
  const row: DrillAttempt = { ...attempt, id: newId("attempt") };
  if (!sb) {
    const s = store();
    // One result per drill per session: re-recording replaces rather than stacks.
    s.drillAttempts = s.drillAttempts.filter(
      (a) => !(a.session_id === row.session_id && a.drill_id === row.drill_id),
    );
    s.drillAttempts.push(row);
    return row;
  }
  await sb
    .from("drill_attempts")
    .delete()
    .eq("session_id", row.session_id)
    .eq("drill_id", row.drill_id)
    .eq("user_id", row.user_id);
  const { data, error } = await sb.from("drill_attempts").insert(row).select().single();
  if (error) throw new Error(`recordDrillAttempt: ${error.message}`);
  return data as DrillAttempt;
}

// ----------------------------------------------------------------- swing

export async function getSwingSessions(userId: string): Promise<SwingSession[]> {
  const sb = await client();
  if (!sb) {
    return [...store().swingSessions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return unwrap(
    await sb
      .from("swing_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    "getSwingSessions",
  );
}

export async function getSwingFindings(userId: string): Promise<SwingFinding[]> {
  const sb = await client();
  if (!sb) {
    return [...store().swingFindings].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  return unwrap(
    await sb
      .from("swing_findings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    "getSwingFindings",
  );
}

export async function createSwingSession(
  session: Omit<SwingSession, "id" | "created_at">,
): Promise<SwingSession> {
  const sb = await client();
  const row: SwingSession = { ...session, id: newId("swing"), created_at: new Date().toISOString() };
  if (!sb) {
    store().swingSessions.unshift(row);
    return row;
  }
  const { data, error } = await sb.from("swing_sessions").insert(row).select().single();
  if (error) throw new Error(`createSwingSession: ${error.message}`);
  return data as SwingSession;
}

export async function addSwingFinding(
  finding: Omit<SwingFinding, "id" | "created_at">,
): Promise<void> {
  const sb = await client();
  const row: SwingFinding = {
    ...finding,
    id: newId("finding"),
    created_at: new Date().toISOString(),
  };
  if (!sb) {
    store().swingFindings.unshift(row);
    return;
  }
  const { error } = await sb.from("swing_findings").insert(row);
  if (error) throw new Error(`addSwingFinding: ${error.message}`);
}

export async function deleteSwingFinding(userId: string, findingId: string): Promise<void> {
  const sb = await client();
  if (!sb) {
    const s = store();
    s.swingFindings = s.swingFindings.filter((f) => f.id !== findingId);
    return;
  }
  const { error } = await sb
    .from("swing_findings")
    .delete()
    .eq("id", findingId)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteSwingFinding: ${error.message}`);
}

export { DEMO_USER_ID };

export async function getSwingMeasurements(userId: string): Promise<SwingMeasurement[]> {
  const sb = await client();
  if (!sb) return [...store().swingMeasurements];
  const sessions = await getSwingSessions(userId);
  if (sessions.length === 0) return [];
  return unwrap(
    await sb
      .from("swing_measurements")
      .select("*")
      .in(
        "swing_session_id",
        sessions.map((session) => session.id),
      ),
    "getSwingMeasurements",
  );
}

/**
 * One row per metric per session. Re-measuring replaces the previous value
 * rather than appending, so the diagnostic reads the current swing and not an
 * average of every attempt to measure it.
 */
export async function saveSwingMeasurement(
  measurement: Omit<SwingMeasurement, "id">,
): Promise<void> {
  const sb = await client();
  const row: SwingMeasurement = { ...measurement, id: newId("measure") };
  if (!sb) {
    const s = store();
    s.swingMeasurements = s.swingMeasurements.filter(
      (m) => !(m.swing_session_id === row.swing_session_id && m.metric === row.metric),
    );
    s.swingMeasurements.push(row);
    return;
  }
  await sb
    .from("swing_measurements")
    .delete()
    .eq("swing_session_id", row.swing_session_id)
    .eq("metric", row.metric);
  const { error } = await sb.from("swing_measurements").insert(row);
  if (error) throw new Error(`saveSwingMeasurement: ${error.message}`);
}
