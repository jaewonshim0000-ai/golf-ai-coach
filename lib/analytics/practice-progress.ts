import type { PracticeMetricTrend, TrendPoint } from "../../types/analytics";
import type { Drill, DrillAttempt, PracticeSession, Skill } from "../../types/practice";
import { round2 } from "./aggregate";

/**
 * Practice volume and practice improvement are different questions.
 * `practiceVolume` answers "did I show up"; `practiceTrends` answers
 * "did anything actually get better". The dashboard shows both, separately.
 */

export function practiceTrends(attempts: DrillAttempt[], drills: Drill[]): PracticeMetricTrend[] {
  const byDrill = new Map<string, DrillAttempt[]>();
  for (const attempt of attempts) {
    const list = byDrill.get(attempt.drill_id) ?? [];
    list.push(attempt);
    byDrill.set(attempt.drill_id, list);
  }

  const drillById = new Map(drills.map((d) => [d.id, d]));
  const trends: PracticeMetricTrend[] = [];

  for (const [drillId, drillAttempts] of byDrill) {
    const drill = drillById.get(drillId);
    if (!drill) continue;

    const ordered = [...drillAttempts].sort((a, b) => a.completed_at.localeCompare(b.completed_at));
    const points: TrendPoint[] = ordered.map((a) => ({
      date: a.completed_at.slice(0, 10),
      label: drill.name,
      value: round2(a.score),
    }));

    const latest = points.length > 0 ? points[points.length - 1]!.value : null;
    // Baseline is the first session, or the mean of the first two when we have
    // enough data, so one fluke opening session does not define progress.
    const baseline =
      points.length === 0
        ? null
        : points.length < 3
          ? points[0]!.value
          : round2((points[0]!.value + points[1]!.value) / 2);

    trends.push({
      skill: drill.skill_trained,
      drill_id: drill.id,
      drill_name: drill.name,
      metric: drill.metric_to_track,
      unit: drill.metric_unit,
      points,
      latest,
      baseline,
      target: drill.success_threshold,
      delta: latest !== null && baseline !== null ? round2(latest - baseline) : null,
      meeting_target: latest !== null && latest >= drill.success_threshold,
      sessions: points.length,
    });
  }

  return trends.sort((a, b) => b.sessions - a.sessions);
}

/** Roll drill-level trends up to the skill level for cross-system matching. */
export function skillTrends(trends: PracticeMetricTrend[]): Map<Skill, PracticeMetricTrend[]> {
  const map = new Map<Skill, PracticeMetricTrend[]>();
  for (const trend of trends) {
    const list = map.get(trend.skill) ?? [];
    list.push(trend);
    map.set(trend.skill, list);
  }
  return map;
}

export type PracticeVolume = {
  sessions_completed: number;
  sessions_planned: number;
  total_minutes: number;
  last_14_days: number;
  streak_weeks: number;
  by_week: TrendPoint[];
};

export function practiceVolume(sessions: PracticeSession[], today = new Date()): PracticeVolume {
  const complete = sessions.filter((s) => s.status === "complete");
  const cutoff = new Date(today.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);

  // Keyed by the Monday of each week, so the chart axis has a real date to
  // format rather than an ISO week string.
  const weeks = new Map<string, { label: string; minutes: number }>();
  for (const session of complete) {
    const source = session.completed_at ?? session.scheduled_for;
    const monday = weekStart(source);
    const entry = weeks.get(monday) ?? { label: isoWeekKey(source), minutes: 0 };
    entry.minutes += session.actual_duration ?? session.planned_duration;
    weeks.set(monday, entry);
  }

  const byWeek: TrendPoint[] = [...weeks.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, entry]) => ({ date, label: entry.label, value: entry.minutes }));

  let streak = 0;
  for (let i = byWeek.length - 1; i >= 0; i--) {
    if ((byWeek[i]?.value ?? 0) > 0) streak += 1;
    else break;
  }

  return {
    sessions_completed: complete.length,
    sessions_planned: sessions.length,
    total_minutes: complete.reduce((sum, s) => sum + (s.actual_duration ?? s.planned_duration), 0),
    last_14_days: complete.filter((s) => (s.completed_at ?? s.scheduled_for).slice(0, 10) >= cutoff)
      .length,
    streak_weeks: streak,
    by_week: byWeek,
  };
}

/** ISO date of the Monday that starts this date's week. */
function weekStart(dateString: string): string {
  const date = new Date(`${dateString.slice(0, 10)}T00:00:00.000Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

function isoWeekKey(dateString: string): string {
  const date = new Date(dateString);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week =
    1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86_400_000 - 3) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type ImprovementSummary = {
  improving: PracticeMetricTrend[];
  flat: PracticeMetricTrend[];
  declining: PracticeMetricTrend[];
  /** Trends with fewer than 3 sessions cannot be classified yet. */
  insufficient: PracticeMetricTrend[];
};

const MEANINGFUL_DELTA = 0.03;

export function improvementSummary(trends: PracticeMetricTrend[]): ImprovementSummary {
  const summary: ImprovementSummary = { improving: [], flat: [], declining: [], insufficient: [] };
  for (const trend of trends) {
    if (trend.sessions < 3 || trend.delta === null) summary.insufficient.push(trend);
    else if (trend.delta > MEANINGFUL_DELTA) summary.improving.push(trend);
    else if (trend.delta < -MEANINGFUL_DELTA) summary.declining.push(trend);
    else summary.flat.push(trend);
  }
  return summary;
}
