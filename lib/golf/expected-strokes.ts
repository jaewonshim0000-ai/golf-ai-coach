import type { Lie } from "../../types/golf";

/**
 * Expected-strokes baseline (PGA Tour averages, Broadie-style).
 *
 * Keyed by lie. Off-green tables are yards-to-hole; the green table is feet.
 * Values are the average number of strokes taken to hole out from that state.
 * Lookups linearly interpolate between anchors and clamp at the ends.
 */

type Table = readonly (readonly [number, number])[];

const TEE: Table = [
  [100, 2.92], [120, 2.99], [140, 2.99], [160, 3.03], [180, 3.05], [200, 3.12],
  [220, 3.17], [240, 3.25], [260, 3.45], [280, 3.65], [300, 3.71], [320, 3.79],
  [340, 3.86], [360, 3.92], [380, 3.96], [400, 3.99], [420, 4.02], [440, 4.08],
  [460, 4.17], [480, 4.28], [500, 4.41], [520, 4.54], [540, 4.65], [560, 4.74],
  [580, 4.79], [600, 4.82],
];

const FAIRWAY: Table = [
  [10, 2.18], [20, 2.40], [30, 2.52], [40, 2.60], [50, 2.66], [60, 2.70],
  [70, 2.72], [80, 2.75], [90, 2.77], [100, 2.80], [120, 2.85], [140, 2.91],
  [160, 2.98], [180, 3.08], [200, 3.19], [220, 3.32], [240, 3.45], [260, 3.58],
  [280, 3.69], [300, 3.78], [320, 3.84], [340, 3.88], [360, 3.95], [380, 4.03],
  [400, 4.11], [420, 4.15], [440, 4.20], [460, 4.29], [480, 4.40], [500, 4.53],
  [520, 4.66], [540, 4.78], [560, 4.86],
];

const ROUGH: Table = [
  [10, 2.34], [20, 2.59], [30, 2.70], [40, 2.78], [50, 2.87], [60, 2.91],
  [70, 2.93], [80, 2.96], [90, 2.99], [100, 3.02], [120, 3.08], [140, 3.15],
  [160, 3.23], [180, 3.33], [200, 3.44], [220, 3.56], [240, 3.69], [260, 3.81],
  [280, 3.91], [300, 4.00], [320, 4.07], [340, 4.13], [360, 4.19], [380, 4.26],
  [400, 4.34], [420, 4.40], [440, 4.47], [460, 4.56], [480, 4.66], [500, 4.78],
];

const SAND: Table = [
  [10, 2.43], [20, 2.53], [30, 2.66], [40, 2.82], [50, 2.92], [60, 3.15],
  [70, 3.21], [80, 3.24], [90, 3.23], [100, 3.23], [120, 3.21], [140, 3.22],
  [160, 3.28], [180, 3.40], [200, 3.55], [220, 3.70], [240, 3.84], [260, 3.93],
  [280, 4.00], [300, 4.04],
];

const RECOVERY: Table = [
  [20, 3.20], [40, 3.40], [60, 3.55], [80, 3.68], [100, 3.80], [120, 3.78],
  [140, 3.80], [160, 3.81], [180, 3.82], [200, 3.87], [220, 3.92], [240, 3.97],
  [260, 4.03], [280, 4.10], [300, 4.20], [320, 4.31], [340, 4.42], [360, 4.53],
  [380, 4.64], [400, 4.74], [420, 4.79], [440, 4.84], [460, 4.88], [480, 4.93],
  [500, 4.98],
];

/** Green table is in FEET, not yards. */
const GREEN: Table = [
  [1, 1.001], [2, 1.009], [3, 1.053], [4, 1.147], [5, 1.256], [6, 1.357],
  [7, 1.443], [8, 1.515], [9, 1.575], [10, 1.626], [11, 1.669], [12, 1.707],
  [13, 1.740], [14, 1.769], [15, 1.794], [16, 1.817], [17, 1.838], [18, 1.857],
  [19, 1.874], [20, 1.890], [21, 1.905], [22, 1.919], [23, 1.932], [24, 1.944],
  [25, 1.955], [30, 2.003], [35, 2.041], [40, 2.073], [45, 2.101], [50, 2.127],
  [60, 2.169], [70, 2.207], [80, 2.245], [90, 2.283], [100, 2.321],
];

const TABLES: Record<string, Table> = {
  tee: TEE,
  fairway: FAIRWAY,
  first_cut: FAIRWAY,
  rough: ROUGH,
  deep_rough: ROUGH,
  fairway_bunker: SAND,
  greenside_bunker: SAND,
  fringe: FAIRWAY,
  green: GREEN,
  recovery: RECOVERY,
};

/**
 * Multipliers applied on top of the shared table for lies that behave worse
 * than their base table. Keeps one table per family instead of six near-copies.
 */
const LIE_PENALTY: Partial<Record<Lie, number>> = {
  first_cut: 1.02,
  deep_rough: 1.06,
  fringe: 0.98,
};

export function interpolate(table: Table, x: number): number {
  const first = table[0]!;
  const last = table[table.length - 1]!;
  if (x <= first[0]) {
    // Below the first anchor, decay linearly toward 1 stroke at zero distance.
    const ratio = first[0] === 0 ? 1 : x / first[0];
    return 1 + (first[1] - 1) * ratio;
  }
  if (x >= last[0]) {
    // Beyond the table, extend using the final slope rather than flat-lining.
    const prev = table[table.length - 2] ?? last;
    const slope = last[0] === prev[0] ? 0 : (last[1] - prev[1]) / (last[0] - prev[0]);
    return last[1] + slope * (x - last[0]);
  }
  for (let i = 1; i < table.length; i++) {
    const hi = table[i]!;
    if (x <= hi[0]) {
      const lo = table[i - 1]!;
      const span = hi[0] - lo[0];
      const t = span === 0 ? 0 : (x - lo[0]) / span;
      return lo[1] + (hi[1] - lo[1]) * t;
    }
  }
  return last[1];
}

export type BallState = {
  lie: Lie;
  /** Distance remaining to the hole. */
  distance: number;
  unit: "yards" | "feet";
};

export const YARDS_PER_FOOT = 1 / 3;

export function toYards(distance: number, unit: "yards" | "feet"): number {
  return unit === "feet" ? distance * YARDS_PER_FOOT : distance;
}

export function toFeet(distance: number, unit: "yards" | "feet"): number {
  return unit === "feet" ? distance : distance * 3;
}

/**
 * Expected strokes to hole out from a ball state.
 * Returns 0 for a holed ball and 1 for a tap-in-length ball on the green.
 */
export function expectedStrokes(state: BallState): number {
  if (state.lie === "holed") return 0;

  // A ball in a hazard or OB is not a playable state. The shot that put it
  // there is scored via its penalty strokes plus the drop position instead.
  if (state.lie === "hazard" || state.lie === "out_of_bounds") {
    throw new Error(
      `expectedStrokes called with terminal lie "${state.lie}" - score the drop position instead`,
    );
  }

  if (state.lie === "green") {
    const feet = toFeet(state.distance, state.unit);
    if (feet <= 0) return 0;
    return interpolate(GREEN, feet);
  }

  const yards = toYards(state.distance, state.unit);
  if (yards <= 0) return 0;
  const table = TABLES[state.lie] ?? FAIRWAY;
  return interpolate(table, yards) * (LIE_PENALTY[state.lie] ?? 1);
}

/** Baseline score for a hole of a given par, from the tee. */
export function expectedStrokesFromTee(par: number, yards: number): number {
  if (par === 3) return expectedStrokes({ lie: "fairway", distance: yards, unit: "yards" });
  return interpolate(TEE, yards);
}

/**
 * ponytail: single PGA-Tour baseline, so every SG number here means
 * "versus tour average". A handicap-relative baseline (expected strokes
 * inflated per category by handicap) is the natural upgrade - add it as a
 * second table keyed by handicap bucket and thread a `baseline` option
 * through computeShotSG. Nothing above this line would need to change.
 */
export const BASELINE_NAME = "PGA Tour average";
