import type { SGCategory } from "../../types/golf";
import type { Evidence, PracticeMetricTrend, Segment, Weakness } from "../../types/analytics";
import type { PlayerProfile } from "../../types/player";
import type { Skill, SwingFinding } from "../../types/practice";
import { round2 } from "./aggregate";

/**
 * Turns segment performance into a ranked list of development priorities.
 *
 *   priority = strokes lost / round
 *            x confidence      (sample size + consistency + corroboration)
 *            x trainability    (how much practice moves this needle)
 *            x goal relevance  (does the player care about it)
 *            x trend factor    (getting worse ranks above already improving)
 *
 * Sample size gates the CLAIM, not the ranking: a thin segment can still be
 * surfaced, but it is labelled an early signal and never called a weakness.
 */

/** Minimum shots before a segment may be called a confirmed weakness. */
export const MIN_SAMPLE: Record<Segment["kind"], number> = {
  category: 30,
  approach_distance: 12,
  putt_distance: 12,
  club: 12,
  lie: 12,
  shot_type: 15,
  hole_par: 20,
};

/**
 * Not every way of slicing the data is a development area. "Par 4 holes" and
 * "shots from the fairway" are useful on the stats page but restate the
 * category rather than naming something you could go and practise, so they
 * never become weaknesses.
 */
const ACTIONABLE_KINDS: readonly Segment["kind"][] = [
  "category",
  "approach_distance",
  "putt_distance",
  "club",
  "lie",
];

/** Only lies that represent genuine trouble. "From fairway" is just "approach". */
const TROUBLE_LIES = [
  "rough",
  "deep_rough",
  "greenside_bunker",
  "fairway_bunker",
  "recovery",
] as const;

function isActionable(segment: Segment): boolean {
  if (!ACTIONABLE_KINDS.includes(segment.kind)) return false;
  if (segment.kind === "lie") return (TROUBLE_LIES as readonly string[]).includes(segment.key);
  if (segment.kind === "club" && segment.key === "putter") return false;
  return true;
}

/** How much deliberate practice tends to move each area. */
const TRAINABILITY: Record<SGCategory, number> = {
  putting: 1.0,
  around_the_green: 0.95,
  approach: 0.85,
  off_the_tee: 0.7,
};

const CATEGORY_SKILLS: Record<SGCategory, Skill[]> = {
  off_the_tee: ["centered_contact", "face_control", "club_path", "start_line"],
  approach: ["centered_contact", "distance_control", "face_control", "strike_quality"],
  around_the_green: ["chipping_proximity", "pitching_proximity", "strike_quality", "distance_control"],
  putting: ["speed_control", "short_putt_conversion", "lag_putting", "green_reading"],
};

function skillsFor(segment: Segment): Skill[] {
  const base = CATEGORY_SKILLS[segment.category];
  if (segment.kind === "putt_distance") {
    if (segment.key === "0-3" || segment.key === "3-6") return ["short_putt_conversion", "face_control"];
    if (segment.key === "20-30" || segment.key === "30+") return ["lag_putting", "speed_control"];
    return ["speed_control", "green_reading"];
  }
  if (segment.kind === "approach_distance") {
    const min = Number(segment.key.split("-")[0] ?? 0);
    if (min >= 175) return ["strike_quality", "centered_contact", "trajectory_control"];
    if (min >= 100) return ["centered_contact", "distance_control", "face_control"];
    return ["distance_control", "pitching_proximity", "trajectory_control"];
  }
  if (segment.kind === "lie") {
    if (segment.key.includes("bunker")) return ["bunker_technique", "strike_quality"];
    if (segment.key.includes("rough")) return ["strike_quality", "trajectory_control"];
  }
  if (segment.kind === "shot_type") {
    if (segment.key === "chip") return ["chipping_proximity", "strike_quality"];
    if (segment.key === "pitch") return ["pitching_proximity", "distance_control"];
    if (segment.key === "bunker") return ["bunker_technique"];
  }
  return base;
}

const GOAL_SKILL_HINTS: Record<string, SGCategory[]> = {
  improve_driving: ["off_the_tee"],
  improve_approach: ["approach"],
  improve_short_game: ["around_the_green"],
  improve_putting: ["putting"],
  break_100: ["off_the_tee", "approach"],
  break_90: ["approach", "around_the_green"],
  break_80: ["approach", "putting"],
  break_par: ["approach", "putting"],
  improve_consistency: ["approach", "off_the_tee"],
  lower_handicap: ["approach", "putting"],
  tournament_prep: ["approach", "putting", "around_the_green"],
};

function goalRelevance(segment: Segment, profile: PlayerProfile | null): number {
  if (!profile) return 1;
  const goals = [profile.primary_goal, ...profile.secondary_goals];
  let score = 0.85;
  goals.forEach((goal, index) => {
    const categories = GOAL_SKILL_HINTS[goal] ?? [];
    if (categories.includes(segment.category)) score += index === 0 ? 0.3 : 0.12;
  });
  return Math.min(1.35, score);
}

function sampleConfidence(segment: Segment): number {
  const k = MIN_SAMPLE[segment.kind];
  return segment.shots / (segment.shots + k);
}

/** A segment that is consistently bad is more trustworthy than a noisy one. */
function consistencyFactor(segment: Segment): number {
  if (segment.volatility <= 0) return 1;
  const ratio = Math.abs(segment.sg_per_shot) / segment.volatility;
  return 0.75 + Math.min(0.25, ratio * 0.5);
}

function trendLabel(trend: number | null): Weakness["trend_label"] {
  if (trend === null) return "insufficient_data";
  if (trend > 0.04) return "improving";
  if (trend < -0.04) return "declining";
  return "flat";
}

function trendFactor(trend: number | null): number {
  if (trend === null) return 1;
  // Improving areas get de-prioritised; regressing areas get promoted.
  return Math.max(0.6, Math.min(1.4, 1 - trend * 2));
}

function severityOf(lostPerRound: number, sufficient: boolean): Weakness["severity"] {
  if (!sufficient) return "watch";
  if (lostPerRound >= 2) return "critical";
  if (lostPerRound >= 1) return "significant";
  if (lostPerRound >= 0.4) return "moderate";
  return "watch";
}

export type WeaknessInputs = {
  segments: Segment[];
  profile: PlayerProfile | null;
  practiceTrends?: PracticeMetricTrend[];
  swingFindings?: SwingFinding[];
  totalRounds: number;
};

export function identifyWeaknesses({
  segments,
  profile,
  practiceTrends = [],
  swingFindings = [],
  totalRounds,
}: WeaknessInputs): Weakness[] {
  const losing = segments.filter((s) => s.total_sg < 0 && s.shots >= 3 && isActionable(s));

  const weaknesses = losing.map((segment) => {
    const skills = skillsFor(segment);
    const lostPerRound = round2(-segment.sg_per_round);
    const sufficient = segment.shots >= MIN_SAMPLE[segment.kind];

    const practiceEvidence = buildPracticeEvidence(skills, practiceTrends);
    const swingEvidence = buildSwingEvidence(skills, segment.category, swingFindings);

    // Corroboration from another system raises confidence, never above 0.95.
    const corroboration = 1 + (practiceEvidence.length > 0 ? 0.08 : 0) + (swingEvidence.length > 0 ? 0.08 : 0);
    const confidence = Math.min(
      0.95,
      sampleConfidence(segment) * consistencyFactor(segment) * corroboration,
    );

    const trainability = TRAINABILITY[segment.category];
    const relevance = goalRelevance(segment, profile);
    const priority = round2(
      lostPerRound * confidence * trainability * relevance * trendFactor(segment.trend),
    );

    const evidence: Evidence[] = [
      {
        source: "course",
        statement: sufficient
          ? `Losing ${lostPerRound.toFixed(2)} strokes per round from ${segment.label.toLowerCase()} across ${segment.shots} shots in ${segment.rounds} round${segment.rounds === 1 ? "" : "s"}.`
          : `Early signal: ${lostPerRound.toFixed(2)} strokes per round from ${segment.label.toLowerCase()}, but only ${segment.shots} shots recorded (${MIN_SAMPLE[segment.kind]} needed to confirm).`,
        value: lostPerRound,
        unit: "strokes/round",
        sample_size: segment.shots,
      },
      ...practiceEvidence,
      ...swingEvidence,
    ];

    const weakness: Weakness = {
      id: `${segment.kind}:${segment.key}`,
      kind: segment.kind,
      key: segment.key,
      title: segment.label,
      category: segment.category,
      severity: severityOf(lostPerRound, sufficient),
      confidence: round2(confidence),
      sample_size: segment.shots,
      sufficient_sample: sufficient,
      strokes_lost_per_round: lostPerRound,
      strokes_lost_total: round2(-segment.total_sg),
      trend: segment.trend,
      trend_label: trendLabel(segment.trend),
      priority: sufficient ? priority : round2(priority * 0.5),
      trainability,
      goal_relevance: round2(relevance),
      recommended_action: recommendAction(segment, skills, sufficient),
      evidence,
      related_skills: skills,
    };
    return weakness;
  });

  return dedupe(weaknesses, totalRounds).sort((a, b) => b.priority - a.priority);
}

/**
 * When the distance breakdown explains most of a category's loss, the category
 * row is noise. Keep the specific one so the coaching stays actionable.
 * Only the distance decompositions count as children - club and lie segments
 * overlap with them and would double-count.
 */
const DISTANCE_KINDS: readonly Segment["kind"][] = ["approach_distance", "putt_distance"];

function dedupe(weaknesses: Weakness[], _totalRounds: number): Weakness[] {
  const categories = weaknesses.filter((w) => w.kind === "category");
  const drop = new Set<string>();

  for (const parent of categories) {
    const siblings = weaknesses.filter((w) => w.category === parent.category && w.id !== parent.id);

    const explained = siblings
      .filter((w) => DISTANCE_KINDS.includes(w.kind) && w.sufficient_sample)
      .reduce((sum, c) => sum + c.strokes_lost_per_round, 0);
    if (explained >= parent.strokes_lost_per_round * 0.5) {
      drop.add(parent.id);
      continue;
    }

    // A club or lie that accounts for essentially the whole category (every
    // tee shot is a driver, say) restates it. Keep the specific row.
    const restates = siblings.some(
      (w) =>
        (w.kind === "club" || w.kind === "lie") &&
        w.sample_size >= parent.sample_size * 0.85 &&
        w.strokes_lost_per_round >= parent.strokes_lost_per_round * 0.85,
    );
    if (restates) drop.add(parent.id);
  }

  return weaknesses.filter((w) => !drop.has(w.id));
}

function buildPracticeEvidence(skills: Skill[], trends: PracticeMetricTrend[]): Evidence[] {
  return trends
    .filter((t) => skills.includes(t.skill) && t.latest !== null && !t.meeting_target)
    .slice(0, 2)
    .map((t) => ({
      source: "practice" as const,
      statement: `${t.drill_name}: ${t.metric} is ${formatMetric(t.latest!, t.unit)} against a ${formatMetric(t.target, t.unit)} target across ${t.sessions} session${t.sessions === 1 ? "" : "s"}.`,
      value: t.latest,
      unit: t.unit,
      sample_size: t.sessions,
    }));
}

function buildSwingEvidence(
  skills: Skill[],
  category: SGCategory,
  findings: SwingFinding[],
): Evidence[] {
  return findings
    .filter((f) => (f.related_skill && skills.includes(f.related_skill)) || matchesCategory(f, category))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 2)
    .map((f) => ({
      source: "swing" as const,
      statement: `Swing analysis flagged a ${f.certainty} ${f.category.replace("_", " ")} issue: ${f.issue}.`,
      value: f.confidence,
      unit: "confidence",
      sample_size: null,
    }));
}

function matchesCategory(finding: SwingFinding, category: SGCategory): boolean {
  if (category === "putting") return false;
  return ["clubface", "club_path", "transition", "impact", "contact", "sequencing"].includes(
    finding.category,
  );
}

function formatMetric(value: number, unit: string): string {
  if (unit === "%") return `${Math.round(value * 100)}%`;
  return `${round2(value)}${unit ? ` ${unit}` : ""}`;
}

function recommendAction(segment: Segment, skills: Skill[], sufficient: boolean): string {
  const primary = (skills[0] ?? "strike_quality").replace(/_/g, " ");
  if (!sufficient) {
    return `Keep logging shots from ${segment.label.toLowerCase()}. Once there are ${MIN_SAMPLE[segment.kind]} we can tell whether this is a real pattern or variance.`;
  }
  if (segment.trend !== null && segment.trend > 0.04) {
    return `Already trending the right way. Hold the current work on ${primary} and add variability rather than changing the drill.`;
  }
  return `Build the block around ${primary}, then test it under random and pressure conditions before moving on.`;
}

/** The single item the dashboard leads with. Null when there is nothing solid to say. */
export function primaryPriority(weaknesses: Weakness[]): Weakness | null {
  return weaknesses[0] ?? null;
}
