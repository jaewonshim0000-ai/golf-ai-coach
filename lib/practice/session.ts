import type { Weakness } from "../../types/analytics";
import type { PlayerProfile, PracticeFacility } from "../../types/player";
import type { Drill, DrillCategory, PracticeBlock, Skill } from "../../types/practice";
import { DRILLS } from "../seed/drills";

/**
 * Today's session.
 *
 * There is no multi-week plan. A plan is a promise about six weeks that the
 * data re-writes after two, and keeping one in sync with the rankings was more
 * machinery than it was worth. What a player actually needs is the next
 * session, built from the weakness that currently costs the most - so that is
 * all this makes, fresh, every time the page loads.
 *
 * Nothing here is persisted. The session is a function of the current data,
 * which means it can never disagree with the priority shown next to it.
 */

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

function difficultyFor(profile: PlayerProfile): Drill["difficulty"] {
  if (profile.experience_level === "beginner") return "beginner";
  if (profile.experience_level === "competitive") return "advanced";
  return "intermediate";
}

function scoreDrill(
  drill: Drill,
  skills: Skill[],
  block: PracticeBlock,
  profile: PlayerProfile,
): number {
  let score = 0;
  if (skills.includes(drill.skill_trained)) score += 10;
  if (BLOCK_CATEGORIES[block].includes(drill.category)) score += 6;
  if (drill.difficulty === difficultyFor(profile)) score += 2;
  if (drill.difficulty === "advanced" && profile.experience_level === "beginner") score -= 6;
  if (drill.clubs.some((c) => profile.bag.includes(c))) score += 1;
  return score;
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

export type SuggestedSession = {
  title: string;
  /** One line, and it names the strokes the session is aimed at. */
  objective: string;
  block: PracticeBlock;
  duration: number;
  drills: Drill[];
  /** The weakness this session exists to attack, if there is one yet. */
  targets: Weakness | null;
};

/**
 * Build the session. Technical work while the skill is still missing its
 * standard, pressure work once it is being met - because drilling technique
 * you have already proved is how practice stops transferring.
 */
export function suggestSession(
  profile: PlayerProfile | null,
  weaknesses: Weakness[],
  meetingTarget: (skill: Skill) => boolean,
): SuggestedSession | null {
  if (!profile) return null;

  const target = weaknesses[0] ?? null;
  const skills = target?.related_skills ?? [];
  const block: PracticeBlock =
    skills.length > 0 && skills.every(meetingTarget) ? "pressure" : "technical";

  const duration = profile.typical_practice_duration || 45;
  const drills = selectDrills(skills, block, profile, 3);
  if (drills.length === 0) return null;

  return {
    title: target ? target.title : "General practice",
    objective: target
      ? `Aimed at the ${target.strokes_lost_per_round.toFixed(2)} strokes a round you are losing here.`
      : "Build a baseline across the bag so the ranking has something to work with.",
    block,
    duration,
    drills,
    targets: target,
  };
}
