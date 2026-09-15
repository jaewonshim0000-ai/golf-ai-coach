import type { PracticeMetricTrend, Weakness } from "../../types/analytics";
import type { PlayerProfile, PracticeFacility } from "../../types/player";
import type {
  Drill,
  DrillCategory,
  PlanSession,
  PlanTarget,
  PracticeBlock,
  Skill,
  TrainingPlan,
} from "../../types/practice";
import { DRILLS } from "../seed/drills";

/**
 * The deterministic half of plan generation.
 *
 * This builds the skeleton - which days, which blocks, which drills, which
 * measurable targets - from data alone. The AI layer then writes the rationale
 * and may re-order, but it never invents a drill id or a target number.
 */

/** Blocked-to-random progression. A plan walks this list from left to right. */
const BLOCK_PROGRESSION: PracticeBlock[] = ["technical", "skill", "variable", "pressure"];

const BLOCK_CATEGORIES: Record<PracticeBlock, DrillCategory[]> = {
  warm_up: ["full_swing", "putting"],
  technical: ["contact", "face_control", "transition", "club_path", "tempo", "bunker", "chipping"],
  skill: [
    "distance_control",
    "mid_irons",
    "short_irons",
    "long_irons",
    "wedges",
    "pitching",
    "putting",
    "driver",
    "woods",
    "chipping",
    "bunker",
  ],
  variable: ["random_practice", "approach"],
  pressure: ["pressure_practice"],
  reflection: [],
};

/** Drill categories that need a facility the player may not have. */
const FACILITY_FOR_CATEGORY: Partial<Record<DrillCategory, PracticeFacility>> = {
  putting: "putting_green",
  chipping: "short_game_area",
  pitching: "short_game_area",
  bunker: "bunker",
};

function hasFacility(drill: Drill, facilities: PracticeFacility[]): boolean {
  const needed = FACILITY_FOR_CATEGORY[drill.category];
  if (!needed) return facilities.includes("range") || facilities.length === 0;
  return facilities.includes(needed);
}

function scoreDrill(drill: Drill, skills: Skill[], block: PracticeBlock, profile: PlayerProfile): number {
  let score = 0;
  if (skills.includes(drill.skill_trained)) score += 10;
  if (BLOCK_CATEGORIES[block].includes(drill.category)) score += 6;
  if (drill.difficulty === difficultyFor(profile)) score += 2;
  if (drill.difficulty === "advanced" && profile.experience_level === "beginner") score -= 6;
  if (drill.clubs.some((c) => profile.bag.includes(c))) score += 1;
  return score;
}

function difficultyFor(profile: PlayerProfile): Drill["difficulty"] {
  if (profile.experience_level === "beginner") return "beginner";
  if (profile.experience_level === "competitive") return "advanced";
  return "intermediate";
}

export function selectDrills(
  skills: Skill[],
  block: PracticeBlock,
  profile: PlayerProfile,
  count: number,
  exclude: Set<string> = new Set(),
): Drill[] {
  return DRILLS.filter((d) => !exclude.has(d.id))
    .filter((d) => hasFacility(d, profile.facilities))
    .map((d) => ({ drill: d, score: scoreDrill(d, skills, block, profile) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.drill.name.localeCompare(b.drill.name))
    .slice(0, count)
    .map((x) => x.drill);
}

function warmUpDrill(profile: PlayerProfile, putting: boolean): Drill | undefined {
  const id = putting && profile.facilities.includes("putting_green")
    ? "drill_putting_warmup"
    : "drill_warmup_ladder";
  return DRILLS.find((d) => d.id === id);
}

/** Evenly spread N practice days across a 7-day week. */
export function practiceDays(perWeek: number): number[] {
  const days = Math.max(1, Math.min(7, perWeek));
  const spread: number[] = [];
  for (let i = 0; i < days; i++) {
    spread.push(1 + Math.round((i * 6) / Math.max(1, days - 1 || 1)));
  }
  return [...new Set(spread)].sort((a, b) => a - b);
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type PlanSkeletonInput = {
  profile: PlayerProfile;
  weaknesses: Weakness[];
  practiceTrends?: PracticeMetricTrend[];
  weeks?: number;
  startsOn: string;
  now?: string;
};

export type PlanSkeleton = {
  plan: Omit<TrainingPlan, "rationale"> & { rationale: string };
  sessions: PlanSession[];
};

export function buildPlanSkeleton({
  profile,
  weaknesses,
  practiceTrends = [],
  weeks = 2,
  startsOn,
  now = new Date().toISOString(),
}: PlanSkeletonInput): PlanSkeleton {
  const primary = weaknesses[0] ?? null;
  const secondary = weaknesses[1] ?? null;
  const skills = primary?.related_skills ?? ["centered_contact", "distance_control"];
  const supportSkills = secondary?.related_skills ?? [];

  const days = practiceDays(profile.practice_days_per_week);
  const totalSessions = days.length * weeks;
  const planId = `plan_${startsOn.replace(/-/g, "")}`;

  const sessions: PlanSession[] = [];
  let sessionIndex = 0;

  for (let week = 1; week <= weeks; week++) {
    for (let day = 1; day <= 7; day++) {
      const isPracticeDay = days.includes(day);
      const isFinalDay = week === weeks && day === days[days.length - 1];

      if (!isPracticeDay) {
        sessions.push({
          id: `${planId}_w${week}d${day}`,
          plan_id: planId,
          week,
          day,
          title: "Rest",
          objective: "Recovery. Optional light putting if you want to touch a club.",
          block_emphasis: "reflection",
          duration: 0,
          drill_ids: [],
          is_rest: true,
          session_id: null,
          status: "scheduled",
        });
        continue;
      }

      // Walk the blocked-to-random progression across the whole plan.
      const progress = totalSessions <= 1 ? 1 : sessionIndex / (totalSessions - 1);
      const block =
        isFinalDay
          ? "pressure"
          : (BLOCK_PROGRESSION[
              Math.min(BLOCK_PROGRESSION.length - 1, Math.floor(progress * BLOCK_PROGRESSION.length))
            ] as PracticeBlock);

      const duration = profile.typical_practice_duration;
      const used = new Set<string>();
      const warm = warmUpDrill(profile, primary?.category === "putting");
      if (warm) used.add(warm.id);

      const main = selectDrills(skills, block, profile, 2, used);
      main.forEach((d) => used.add(d.id));
      const support = selectDrills(
        supportSkills.length > 0 ? supportSkills : skills,
        block === "pressure" ? "skill" : "variable",
        profile,
        1,
        used,
      );

      const drillIds = [...(warm ? [warm.id] : []), ...main.map((d) => d.id), ...support.map((d) => d.id)];

      sessions.push({
        id: `${planId}_w${week}d${day}`,
        plan_id: planId,
        week,
        day,
        title: isFinalDay ? "Assessment" : titleForBlock(block, primary?.title ?? "your game"),
        objective: objectiveFor(block, primary, isFinalDay),
        block_emphasis: block,
        duration,
        drill_ids: drillIds,
        is_rest: false,
        session_id: null,
        status: "scheduled",
      });
      sessionIndex += 1;
    }
  }

  const targets = buildTargets(skills, practiceTrends);

  const plan: PlanSkeleton["plan"] = {
    id: planId,
    user_id: profile.user_id,
    title: primary
      ? `${weeks}-week block: ${primary.title}`
      : `${weeks}-week general development block`,
    primary_goal: primary
      ? `Reduce the ${primary.strokes_lost_per_round.toFixed(2)} strokes per round currently lost from ${primary.title.toLowerCase()}.`
      : "Build a baseline across all four scoring categories.",
    rationale: primary
      ? primary.evidence.map((e) => e.statement).join(" ")
      : "Not enough round data yet to target a single area, so this block covers all four categories evenly.",
    weeks,
    starts_on: startsOn,
    ends_on: addDays(startsOn, weeks * 7 - 1),
    status: "active",
    targets,
    generated_by: "rules",
    source_snapshot: now,
    created_at: now,
  };

  return { plan, sessions };
}

function titleForBlock(block: PracticeBlock, focus: string): string {
  switch (block) {
    case "technical":
      return `Technique: ${focus}`;
    case "skill":
      return `Skill build: ${focus}`;
    case "variable":
      return "Random practice";
    case "pressure":
      return "Pressure block";
    default:
      return focus;
  }
}

function objectiveFor(block: PracticeBlock, primary: Weakness | null, isFinal: boolean): string {
  const focus = primary?.related_skills[0]?.replace(/_/g, " ") ?? "strike quality";
  if (isFinal) return `Re-test ${focus} under one-ball conditions and record the result to compare against the start of the block.`;
  switch (block) {
    case "technical":
      return `Blocked repetition on ${focus}. Same club, same target, immediate feedback on every rep.`;
    case "skill":
      return `Move ${focus} from a rehearsal into a measured skill. Same task, scored.`;
    case "variable":
      return `Change club and target on every shot. This is where ${focus} has to survive contact with a real routine.`;
    case "pressure":
      return `One ball, a consequence, a full routine. Test whether ${focus} holds up.`;
    default:
      return `Work on ${focus}.`;
  }
}

/**
 * Targets are measurable and derived from the player's own baseline, never a
 * round number pulled from nowhere. With no baseline we say so rather than
 * inventing a starting point.
 */
export function buildTargets(skills: Skill[], trends: PracticeMetricTrend[]): PlanTarget[] {
  const relevant = trends.filter((t) => skills.includes(t.skill));
  if (relevant.length === 0) {
    return skills.slice(0, 2).map((skill) => {
      const drill = DRILLS.find((d) => d.skill_trained === skill);
      return {
        metric: drill?.metric_to_track ?? "Success rate",
        skill,
        baseline: 0,
        target: drill?.success_threshold ?? 0.7,
        unit: drill?.metric_unit ?? "%",
      };
    });
  }
  return relevant.slice(0, 3).map((trend) => ({
    metric: trend.metric,
    skill: trend.skill,
    baseline: trend.baseline ?? trend.latest ?? 0,
    // Aim for real progress toward the standard, not the standard itself in one block.
    target: Math.min(
      trend.target,
      Math.round(((trend.baseline ?? trend.latest ?? 0) + 0.12) * 100) / 100,
    ),
    unit: trend.unit,
  }));
}

export type PlanProgress = {
  verdict: "on_track" | "ahead" | "stalled" | "regressing";
  completed: number;
  scheduled: number;
  completion_rate: number;
  target_progress: {
    metric: string;
    baseline: number;
    target: number;
    latest: number | null;
    progress: number | null;
  }[];
  /** Deterministic recommendations. The AI turns these into coaching language. */
  signals: string[];
};

/**
 * Deterministic read of how a plan is going. The AI never computes this - it
 * only explains it.
 */
export function evaluatePlanProgress(
  plan: TrainingPlan,
  sessions: PlanSession[],
  trends: PracticeMetricTrend[],
): PlanProgress {
  const real = sessions.filter((s) => !s.is_rest);
  const completed = real.filter((s) => s.status === "complete").length;
  const completionRate = real.length === 0 ? 0 : completed / real.length;

  const targetProgress = plan.targets.map((target) => {
    // Metric first: two targets can train the same skill through different
    // drills, and matching on skill alone would give them the same number.
    const trend =
      trends.find((t) => t.metric === target.metric) ??
      trends.find((t) => t.skill === target.skill);
    const latest = trend?.latest ?? null;
    const span = target.target - target.baseline;
    return {
      metric: target.metric,
      baseline: target.baseline,
      target: target.target,
      latest,
      progress: latest === null || span === 0 ? null : Math.round(((latest - target.baseline) / span) * 100) / 100,
    };
  });

  const measurable = targetProgress.filter((t) => t.progress !== null);
  const meanProgress =
    measurable.length === 0
      ? null
      : measurable.reduce((sum, t) => sum + (t.progress as number), 0) / measurable.length;

  let verdict: PlanProgress["verdict"] = "on_track";
  if (meanProgress === null) verdict = "on_track";
  else if (meanProgress >= 1) verdict = "ahead";
  else if (meanProgress < 0) verdict = "regressing";
  else if (meanProgress < 0.25 && completionRate >= 0.5) verdict = "stalled";

  const signals: string[] = [];
  if (completionRate < 0.5 && real.length >= 4) {
    signals.push("Fewer than half the planned sessions are done, so plan changes would be premature.");
  }
  if (verdict === "ahead") {
    signals.push("Targets met. Reduce blocked technical volume and increase random and pressure work.");
  }
  if (verdict === "stalled") {
    signals.push("Sessions are being completed but the metric has not moved. Swap to the regression drill and simplify the task.");
  }
  if (verdict === "regressing") {
    signals.push("The metric has gone backwards. Drop to the regression drill and re-test before adding difficulty.");
  }
  if (verdict === "on_track" && meanProgress !== null) {
    signals.push(`Roughly ${Math.round(meanProgress * 100)}% of the way to the block target. Keep the current structure.`);
  }

  return {
    verdict,
    completed,
    scheduled: real.length,
    completion_rate: Math.round(completionRate * 100) / 100,
    target_progress: targetProgress,
    signals,
  };
}
