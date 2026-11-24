import * as repo from "@/lib/db/repo";

export const dynamic = "force-dynamic";

export async function GET() {
  if (repo.mode() !== "supabase") {
    return Response.json(
      { error: "Data export is available for signed-in accounts." },
      { status: 409 },
    );
  }

  const user = await repo.currentUser();
  if (!user) return Response.json({ error: "Sign in to export your data." }, { status: 401 });

  const [profile, handicapHistory, courses, rounds, shots, extras, drillAttempts, swingSessions, swingFindings, swingMeasurements] = await Promise.all([
    repo.getProfile(user.id),
    repo.getHandicapHistory(user.id),
    repo.getCourses(user.id),
    repo.getRounds(user.id),
    repo.getShots(user.id),
    repo.getExportExtras(user.id),
    repo.getDrillAttempts(user.id),
    repo.getSwingSessions(user.id),
    repo.getSwingFindings(user.id),
    repo.getSwingMeasurements(user.id),
  ]);

  // Same shape as version 1: each session with its blocks and results.
  const practice = extras.practice
    .sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for))
    .map(({ practice_items: items, ...session }) => ({
      session,
      items: items.sort((a, b) => a.order_index - b.order_index),
      attempts: drillAttempts.filter((attempt) => attempt.session_id === session.id),
    }));
  const usedCourseIds = new Set(rounds.map((round) => round.course_id));
  const exportedAt = new Date().toISOString();
  const payload = {
    format: "golf-ai-coach-export",
    version: 2,
    exported_at: exportedAt,
    account: user,
    profile,
    handicap_history: handicapHistory,
    courses: courses.filter((course) => course.user_id === user.id || usedCourseIds.has(course.id)),
    rounds,
    shots,
    practice,
    drill_attempts: drillAttempts,
    swing_sessions: swingSessions,
    swing_findings: swingFindings,
    swing_measurements: swingMeasurements,
    swing_analyses: extras.swingAnalyses,
    subscription: extras.subscription,
    usage_events: extras.usage,
    notes: [
      "Swing video files are not embedded in this JSON export.",
      "Private video object paths remain listed in swing_sessions so records can be matched.",
      "swing_analyses holds each recording's view, timing, setup marks and reference details. The body-point tracks measured from the videos are not included because of their size.",
      "Card and invoice details are kept by Stripe and are available from Manage billing.",
    ],
  };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="golf-ai-coach-${exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
