import type { SwingCategory, SwingMeasurement } from "../../types/practice";

/**
 * Swing diagnostic.
 *
 * A 3D-capture diagnostic works the same way everywhere: measure a fixed set
 * of body positions at address, top and impact, compare each against a
 * reference range, and rank whatever falls outside it. This module is that
 * comparison, and nothing else.
 *
 * It does NOT measure anything. There is no pose estimation in this app, so
 * every value here arrives from `SwingMeasurement` rows entered by the player
 * or their coach - which is exactly the row shape a vision pipeline would
 * write. Adding capture later means populating the same table; none of the
 * logic below changes, and the UI says plainly where each number came from.
 *
 * Ranges are general reference bands for an amateur with a neutral pattern,
 * not prescriptions. Plenty of good players sit outside them, which is why a
 * value outside a band is reported as "worth looking at" and never as a fault.
 */

export type SwingPhase = "address" | "top" | "impact";

export type SwingMetric = {
  id: string;
  phase: SwingPhase;
  /** Body segment, so the UI can group without parsing the id. */
  segment: "pelvis" | "chest" | "head";
  label: string;
  unit: "deg" | "in";
  /** Inclusive reference band. */
  min: number;
  max: number;
  /** What the axis means, so a signed number is readable. */
  low: string;
  high: string;
  category: SwingCategory;
  /** Why it matters, in one sentence. */
  matters: string;
};

export const SWING_METRICS: SwingMetric[] = [
  {
    id: "pelvis_bend_address",
    phase: "address",
    segment: "pelvis",
    label: "Pelvis bend",
    unit: "deg",
    min: 18,
    max: 28,
    low: "standing too tall",
    high: "bent over too far",
    category: "setup",
    matters: "Sets how much room the arms have to swing past the body.",
  },
  {
    id: "chest_bend_address",
    phase: "address",
    segment: "chest",
    label: "Chest bend",
    unit: "deg",
    min: 28,
    max: 40,
    low: "upright",
    high: "hunched",
    category: "setup",
    matters: "Governs the plane the chest turns on for the whole swing.",
  },
  {
    id: "pelvis_turn_top",
    phase: "top",
    segment: "pelvis",
    label: "Pelvis turn",
    unit: "deg",
    min: 35,
    max: 50,
    low: "restricted",
    high: "over-rotated",
    category: "backswing",
    matters: "Too little and the backswing runs out of room; too much and there is nothing left to unwind.",
  },
  {
    id: "chest_turn_top",
    phase: "top",
    segment: "chest",
    label: "Chest turn",
    unit: "deg",
    min: 80,
    max: 100,
    low: "short backswing",
    high: "past parallel",
    category: "backswing",
    matters: "The main source of width and speed at the top.",
  },
  {
    id: "pelvis_sway_top",
    phase: "top",
    segment: "pelvis",
    label: "Pelvis sway",
    unit: "in",
    min: -1,
    max: 3,
    low: "moving toward the target",
    high: "sliding away from the target",
    category: "backswing",
    matters: "Lateral drift away from the target moves the low point behind the ball.",
  },
  {
    id: "pelvis_lift_top",
    phase: "top",
    segment: "pelvis",
    label: "Pelvis lift",
    unit: "in",
    min: -1,
    max: 1.5,
    low: "squatting",
    high: "standing up",
    category: "backswing",
    matters: "Vertical movement at the top has to be given back before impact.",
  },
  {
    id: "chest_side_bend_top",
    phase: "top",
    segment: "chest",
    label: "Chest side bend",
    unit: "deg",
    min: 5,
    max: 20,
    low: "level shoulders",
    high: "steep tilt",
    category: "backswing",
    matters: "Controls the attack angle the club can arrive on.",
  },
  {
    id: "pelvis_turn_impact",
    phase: "impact",
    segment: "pelvis",
    label: "Pelvis turn",
    unit: "deg",
    min: 35,
    max: 50,
    low: "stalled",
    high: "spun out",
    category: "impact",
    matters: "An open pelvis at impact is what gives the arms room to pass.",
  },
  {
    id: "chest_turn_impact",
    phase: "impact",
    segment: "chest",
    label: "Chest turn",
    unit: "deg",
    min: 20,
    max: 35,
    low: "closed",
    high: "open",
    category: "impact",
    matters: "Chest direction at impact is closely tied to start line.",
  },
  {
    id: "pelvis_sway_impact",
    phase: "impact",
    segment: "pelvis",
    label: "Pelvis sway",
    unit: "in",
    min: 1.5,
    max: 5,
    low: "hanging back",
    high: "sliding past the ball",
    category: "impact",
    matters: "Pressure has to reach the lead side for the low point to move forward.",
  },
  {
    id: "pelvis_thrust_impact",
    phase: "impact",
    segment: "pelvis",
    label: "Pelvis thrust",
    unit: "in",
    min: -3,
    max: 0,
    low: "backing away from the ball",
    high: "pushing toward the ball",
    category: "impact",
    matters: "Moving toward the ball through impact crowds the hands and shuts the face.",
  },
  {
    id: "head_sway_impact",
    phase: "impact",
    segment: "head",
    label: "Head sway",
    unit: "in",
    min: -2,
    max: 1,
    low: "behind the ball",
    high: "ahead of the ball",
    category: "impact",
    matters: "A head that chases the target usually drags the low point with it.",
  },
];

export const METRICS_BY_ID = new Map(SWING_METRICS.map((metric) => [metric.id, metric]));

export const PHASE_LABELS: Record<SwingPhase, string> = {
  address: "Address",
  top: "Top of backswing",
  impact: "Impact",
};

const CATEGORY_DRILL: Record<string, string> = {
  setup: "drill_toe_up_path",
  backswing: "drill_pump_transition",
  impact: "drill_towel_gate_contact",
};

export type MetricReading = {
  metric: SwingMetric;
  value: number;
  /** How the value sits against the reference band. */
  status: "in_range" | "below" | "above";
  /** Distance outside the band, in the metric's own unit. Zero when in range. */
  deviation: number;
  /**
   * Deviation as a multiple of the band's own width, so a 3-degree miss on a
   * 15-degree band and a 0.6-inch miss on a 3-inch band rank the same.
   */
  severity: number;
  /** 0-1 as recorded. Manual entry is never certain, so this is carried through. */
  confidence: number;
  /** Where the value sits inside the band, 0-1, for drawing a position marker. */
  position: number;
  note: string;
  drillId: string | null;
};

export type SwingDiagnostic = {
  readings: MetricReading[];
  outOfRange: MetricReading[];
  inRange: number;
  measured: number;
  /** Metrics with no value recorded. Named so the UI can ask for them. */
  missing: SwingMetric[];
};

/**
 * Compare recorded measurements against the reference bands.
 *
 * Unknown metric ids are ignored rather than guessed at, and a metric with no
 * measurement is reported as missing rather than defaulted - a diagnostic that
 * silently treats "not measured" as "fine" is worse than no diagnostic.
 */
export function diagnoseSwing(measurements: SwingMeasurement[]): SwingDiagnostic {
  const latest = new Map<string, SwingMeasurement>();
  for (const measurement of measurements) {
    if (METRICS_BY_ID.has(measurement.metric)) latest.set(measurement.metric, measurement);
  }

  const readings: MetricReading[] = [];
  const missing: SwingMetric[] = [];

  for (const metric of SWING_METRICS) {
    const measurement = latest.get(metric.id);
    if (!measurement) {
      missing.push(metric);
      continue;
    }
    readings.push(read(metric, measurement.value, measurement.confidence));
  }

  const outOfRange = readings
    .filter((reading) => reading.status !== "in_range")
    .sort((a, b) => b.severity - a.severity);

  return {
    readings,
    outOfRange,
    inRange: readings.length - outOfRange.length,
    measured: readings.length,
    missing,
  };
}

function read(metric: SwingMetric, value: number, confidence: number): MetricReading {
  const width = metric.max - metric.min;
  const below = value < metric.min;
  const above = value > metric.max;
  const deviation = below ? metric.min - value : above ? value - metric.max : 0;

  return {
    metric,
    value,
    status: below ? "below" : above ? "above" : "in_range",
    deviation: Math.round(deviation * 10) / 10,
    severity: width > 0 ? deviation / width : 0,
    confidence,
    // Clamped so a wild value still draws inside the track rather than escaping it.
    position: Math.max(0, Math.min(1, width > 0 ? (value - metric.min) / width : 0.5)),
    note: below
      ? `${describe(deviation, metric.unit)} under the reference band — ${metric.low}.`
      : above
        ? `${describe(deviation, metric.unit)} over the reference band — ${metric.high}.`
        : "Inside the reference band.",
    drillId: below || above ? (CATEGORY_DRILL[metric.category] ?? null) : null,
  };
}

function describe(deviation: number, unit: SwingMetric["unit"]): string {
  const rounded = Math.round(deviation * 10) / 10;
  return unit === "deg" ? `${rounded}°` : `${rounded} in`;
}

export function formatMetricValue(value: number, unit: SwingMetric["unit"]): string {
  const rounded = Math.round(value * 10) / 10;
  return unit === "deg" ? `${rounded}°` : `${rounded} in`;
}
