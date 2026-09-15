/** Core golf vocabulary. Every other module derives its unions from here. */

export const LIES = [
  "tee",
  "fairway",
  "first_cut",
  "rough",
  "deep_rough",
  "fairway_bunker",
  "greenside_bunker",
  "fringe",
  "green",
  "recovery",
  "hazard",
  "out_of_bounds",
  "holed",
] as const;
export type Lie = (typeof LIES)[number];

/** Lies a ball can start a shot from (holed/OB/hazard are terminal or re-drop states). */
export const PLAYABLE_LIES = LIES.filter(
  (l) => l !== "holed" && l !== "out_of_bounds" && l !== "hazard",
) as readonly Lie[];

export const SHOT_TYPES = [
  "tee",
  "approach",
  "layup",
  "pitch",
  "chip",
  "bunker",
  "putt",
  "recovery",
  "penalty_drop",
] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

export const CLUBS = [
  "driver",
  "3_wood",
  "5_wood",
  "2_hybrid",
  "3_hybrid",
  "4_hybrid",
  "3_iron",
  "4_iron",
  "5_iron",
  "6_iron",
  "7_iron",
  "8_iron",
  "9_iron",
  "pw",
  "gw",
  "sw",
  "lw",
  "putter",
] as const;
export type Club = (typeof CLUBS)[number];

export const CLUB_LABELS: Record<Club, string> = {
  driver: "Driver",
  "3_wood": "3 Wood",
  "5_wood": "5 Wood",
  "2_hybrid": "2 Hybrid",
  "3_hybrid": "3 Hybrid",
  "4_hybrid": "4 Hybrid",
  "3_iron": "3 Iron",
  "4_iron": "4 Iron",
  "5_iron": "5 Iron",
  "6_iron": "6 Iron",
  "7_iron": "7 Iron",
  "8_iron": "8 Iron",
  "9_iron": "9 Iron",
  pw: "Pitching Wedge",
  gw: "Gap Wedge",
  sw: "Sand Wedge",
  lw: "Lob Wedge",
  putter: "Putter",
};

/** Which bag group a club belongs to — used for practice/analysis grouping. */
export const CLUB_GROUPS = {
  driver: ["driver"],
  woods: ["3_wood", "5_wood", "2_hybrid", "3_hybrid", "4_hybrid"],
  long_irons: ["3_iron", "4_iron", "5_iron"],
  mid_irons: ["6_iron", "7_iron", "8_iron"],
  short_irons: ["9_iron", "pw"],
  wedges: ["gw", "sw", "lw"],
  putter: ["putter"],
} as const satisfies Record<string, readonly Club[]>;
export type ClubGroup = keyof typeof CLUB_GROUPS;

export function clubGroup(club: Club): ClubGroup {
  for (const [group, clubs] of Object.entries(CLUB_GROUPS)) {
    if ((clubs as readonly Club[]).includes(club)) return group as ClubGroup;
  }
  return "driver";
}

export const MISS_DIRECTIONS = ["left", "pull", "straight", "push", "right", "short", "long"] as const;
export type MissDirection = (typeof MISS_DIRECTIONS)[number];

/** Coarse left/center/right bucket used by the dispersion analytics. */
export function lateralBucket(miss: MissDirection | null): "left" | "center" | "right" | null {
  if (!miss) return null;
  if (miss === "left" || miss === "pull") return "left";
  if (miss === "right" || miss === "push") return "right";
  if (miss === "straight") return "center";
  return null; // short/long carry no lateral information
}

export const SG_CATEGORIES = ["off_the_tee", "approach", "around_the_green", "putting"] as const;
export type SGCategory = (typeof SG_CATEGORIES)[number];

export const SG_CATEGORY_LABELS: Record<SGCategory, string> = {
  off_the_tee: "Off the Tee",
  approach: "Approach",
  around_the_green: "Around the Green",
  putting: "Putting",
};

export const PENALTY_TYPES = ["none", "water", "out_of_bounds", "unplayable", "lost_ball"] as const;
export type PenaltyType = (typeof PENALTY_TYPES)[number];

export const SWING_PATTERNS = ["draw", "fade", "neutral", "unknown"] as const;
export type SwingPattern = (typeof SWING_PATTERNS)[number];

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced", "competitive"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const DOMINANT_HANDS = ["right", "left"] as const;
export type DominantHand = (typeof DOMINANT_HANDS)[number];

/** Approach distance bands, in yards. `max: null` means "and above". */
export const DISTANCE_BANDS = [
  { id: "0-50", label: "Inside 50", min: 0, max: 50 },
  { id: "50-75", label: "50–75", min: 50, max: 75 },
  { id: "75-100", label: "75–100", min: 75, max: 100 },
  { id: "100-125", label: "100–125", min: 100, max: 125 },
  { id: "125-150", label: "125–150", min: 125, max: 150 },
  { id: "150-175", label: "150–175", min: 150, max: 175 },
  { id: "175-200", label: "175–200", min: 175, max: 200 },
  { id: "200-225", label: "200–225", min: 200, max: 225 },
  { id: "225+", label: "225+", min: 225, max: null },
] as const;
export type DistanceBandId = (typeof DISTANCE_BANDS)[number]["id"];

export function distanceBand(yards: number): (typeof DISTANCE_BANDS)[number] {
  for (const band of DISTANCE_BANDS) {
    if (yards >= band.min && (band.max === null || yards < band.max)) return band;
  }
  return DISTANCE_BANDS[DISTANCE_BANDS.length - 1]!;
}

/** Putting distance buckets, in feet. */
export const PUTT_BANDS = [
  { id: "0-3", label: "0–3 ft", min: 0, max: 3 },
  { id: "3-6", label: "3–6 ft", min: 3, max: 6 },
  { id: "6-10", label: "6–10 ft", min: 6, max: 10 },
  { id: "10-20", label: "10–20 ft", min: 10, max: 20 },
  { id: "20-30", label: "20–30 ft", min: 20, max: 30 },
  { id: "30+", label: "30+ ft", min: 30, max: null },
] as const;

export function puttBand(feet: number): (typeof PUTT_BANDS)[number] {
  for (const band of PUTT_BANDS) {
    if (feet >= band.min && (band.max === null || feet < band.max)) return band;
  }
  return PUTT_BANDS[PUTT_BANDS.length - 1]!;
}

export const CONDITIONS = ["calm", "breezy", "windy", "wet", "cold", "hot"] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Human labels for enum-ish values, so the UI never prints snake_case. */
export function labelize(value: string): string {
  return value
    .split("_")
    .map((w) => (w.length === 0 ? w : w[0]!.toUpperCase() + w.slice(1)))
    .join(" ");
}
