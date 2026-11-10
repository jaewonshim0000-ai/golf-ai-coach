import type { MotionReading, MotionReport } from "./motion-analysis";
import { SCORE_RUBRIC, type ScoreCheckId, type ScoreRubric } from "./score-rubric";

export type SwingScoreComponent = {
  id: string; label: string; score: number; weight: number; value: number; unit: string;
  time: number; evidence: string; cue: string; check: string; rubric: string;
  /** Bounds from observed positions or timing around an estimated event. */
  scoreRange?: [number, number];
  /** Nominal timing score helps distinguish a questionable correction from
   * an otherwise ordinary rhythm with a broad sampling interval. */
  estimateScore?: number;
};
export type SwingScore = {
  total: number | null;
  totalRange?: [number, number];
  components: SwingScoreComponent[];
  priorities: SwingScoreComponent[];
  reviews: SwingScoreComponent[];
  missing: string[];
  reason: string | null;
};

/** Players see scores out of 10 with one decimal; the checks score in whole points of 100, which are tenths. */
export const tenPoint = (points: number) => (points / 10).toFixed(1);

/** v1 coaching heuristic, not population norms or a prediction of ball flight.
 * Scores describe three visible control checks. Missing evidence is never 100.
 * Use only comparable full-swing recordings from the same camera position.
 */
export function scoreSwing(report: MotionReport, ballSide?: "left" | "right", rubric: ScoreRubric = SCORE_RUBRIC): SwingScore {
  const result: SwingScore = { total: null, components: [], priorities: [], reviews: [], missing: [], reason: null };
  if (!report.usable || !report.phases) result.reason = "Analyze one complete swing before scoring.";
  else if (report.view === "other") result.reason = "Choose Face on or Down the line and analyze again to use the appropriate scoring checks.";
  else if (report.quality.coverage < 0.85 || !report.quality.cameraStable || report.quality.largestGap > 0.12)
    result.reason = "A score needs a fixed camera, at least 85% visible body tracking, and no sample gaps over 0.12 seconds. Re-record with your whole body visible.";
  if (result.reason) return result;

  Object.assign(result, swingScoreChecks(report, ballSide, rubric));
  const weight = result.components.reduce((sum, item) => sum + item.weight, 0);
  // Any two of the three checks make an overall score; weights come from the calibrated rubric.
  if (result.components.length >= 2) {
    result.total = Math.round(result.components.reduce((sum, item) => sum + item.score * item.weight, 0) / weight);
    if (result.components.some((item) => item.scoreRange)) {
      result.totalRange = [result.total, Math.round(result.components.reduce((sum, item) => sum + (item.scoreRange?.[1] ?? item.score) * item.weight, 0) / weight)];
    }
  } else result.reason = `Movement analysis is complete, but only ${result.components.length} of 3 checks could be scored. An overall score needs at least two.`;
  // Keep supported improvement cues even when an overall score is unavailable.
  // A ranged reading is a priority only if all observed positions score below 85.
  result.priorities = rankPriorities(result.components);
  result.reviews = result.components.filter((item) => item.scoreRange && item.scoreRange[0] < 85 && item.scoreRange[1] >= 85);
  return result;
}

/** Checks below 85 across their whole range, largest weighted deduction first. */
export function rankPriorities(components: SwingScoreComponent[]): SwingScoreComponent[] {
  return components.filter((item) => (item.scoreRange?.[1] ?? item.score) < 85)
    .sort((a, b) => (100 - (b.scoreRange?.[1] ?? b.score)) * b.weight - (100 - (a.scoreRange?.[1] ?? a.score)) * a.weight).slice(0, 3);
}

/** Individual checks use the supported readings and timing supplied by the
 * motion report. A gap elsewhere must not discard a visible body position.
 * Absolute displacement still requires a stable camera. */
export function swingScoreChecks(report: MotionReport, ballSide?: "left" | "right", rubric: ScoreRubric = SCORE_RUBRIC): Pick<SwingScore, "components" | "missing"> {
  const result: Pick<SwingScore, "components" | "missing"> = { components: [], missing: [] };
  if (!report.usable || !report.phases || report.view === "other") return result;

  const reading = (id: string, unit: MotionReading["unit"], allowRange = false) => report.readings.find((row) =>
    row.id === id && row.unit === unit && Number.isFinite(row.value) &&
    (!row.range || (allowRange && row.range.every(Number.isFinite) && row.range[0] <= row.range[1])));
  const absoluteRange = ([low, high]: [number, number]): [number, number] =>
    [low <= 0 && high >= 0 ? 0 : Math.min(Math.abs(low), Math.abs(high)), Math.max(Math.abs(low), Math.abs(high))];
  const add = (component: Omit<SwingScoreComponent, "id" | "score" | "rubric" | "weight"> & { id: ScoreCheckId }, amount: number | [number, number], estimatedAmount?: number) => {
    const { weight, free, severe } = rubric[component.id];
    const grade = (value: number) => Math.round(100 * (1 - Math.min(1, Math.max(0, (value - free) / (severe - free)))));
    const bounds: [number, number] = Array.isArray(amount) ? [grade(amount[1]), grade(amount[0])] : [grade(amount), grade(amount)];
    result.components.push({ ...component, weight, score: bounds[0],
      ...(Array.isArray(amount) ? { scoreRange: bounds } : {}),
      ...(estimatedAmount !== undefined ? { estimateScore: grade(estimatedAmount) } : {}),
      rubric: `No deduction through ${free}${component.unit}; linear deduction to 0 at ${severe}${component.unit}. Weight: ${weight}.`,
    });
  };
  if (report.view === "face_on") {
    const head = reading("head_impact", "% stance", true);
    if (head && report.quality.cameraStable) add({ id: "head", label: "Head control at impact", value: Math.abs(head.value), unit: "% stance", time: head.time,
      evidence: head.range ? `Head shift ranges from ${head.range[0]}% to ${head.range[1]}% of stance width from setup around estimated contact. The check uses all observed positions in that interval.` :
        `Your head shifted ${Math.abs(head.value)}% of stance width ${head.value < 0 ? "toward the trail foot" : "toward the lead foot"} from setup at estimated impact.`,
      cue: "Try five waist-high swings at half speed. Allow a natural turn while reducing a large sideways lunge; do not try to freeze your head.",
      check: "Film from the same position and compare the head guide at setup and impact. Check strike location as well as the score." }, head.range ? absoluteRange(head.range) : Math.abs(head.value));
    else result.missing.push("Head control needs a visible head and both ankles at impact in a face-on view.");
    const lift = reading("lift_top", "% body height", true);
    if (lift && report.quality.cameraStable) add({ id: "height", label: "Height control in the backswing", value: Math.abs(lift.value), unit: "% body height", time: lift.time,
      evidence: lift.range ? `Hip height ranges from ${lift.range[0]}% to ${lift.range[1]}% of visible body height relative to setup across the estimated backswing transition. Negative is lower; positive is higher. The score uses all observed positions in that interval.` :
        `Hip height changed ${Math.abs(lift.value)}% of visible body height ${lift.value < 0 ? "down" : "up"} from setup at the top.`,
      cue: "Make five slow backswings with a comfortable knee bend. Review large rises or dips without forcing the hips to stay motionless.",
      check: lift.range ? "Review the visible hips across the estimated transition, rather than treating one frame as the exact top. Then hit five half shots and check centered contact." :
        "Compare setup and top on the overlay, then hit five half shots and check centered contact." }, lift.range ? absoluteRange(lift.range) : Math.abs(lift.value));
    else result.missing.push("Backswing height was not scored because the hip position could not be measured at or across the top.");
  } else {
    const setup = reading("torso_address", "° in picture", true), impact = reading("torso_impact", "° in picture", true);
    if (setup && impact) {
      const loss = Math.max(0, setup.value - impact.value);
      add({ id: "posture", label: "Posture through impact", value: Math.round(loss * 10) / 10, unit: "°", time: impact.time,
        evidence: impact.range ? `Visible side inclination was ${setup.value}° at setup and ranges from ${impact.range[0]}° to ${impact.range[1]}° around estimated contact. Rotation also affects this projection.` :
          `Visible side inclination changed from ${setup.value}° at setup to ${impact.value}° at estimated impact (${loss.toFixed(1)}° closer to upright). Rotation also affects this projection.`,
        cue: "Make five slow half swings while keeping room for your arms. Review whether your chest rises abruptly before impact; allow normal rotation and the rise into the finish.",
        check: "Pause setup and estimated impact from the same camera position. Compare the visible shoulder-to-hip line and check centered contact." },
      setup.range || impact.range ? [Math.max(0, (setup.range?.[0] ?? setup.value) - (impact.range?.[1] ?? impact.value)),
        Math.max(0, (setup.range?.[1] ?? setup.value) - (impact.range?.[0] ?? impact.value))] : loss);
    } else result.missing.push("Posture needs the same visible shoulder and hip at setup and impact.");
    const hip = reading("hips_impact", "% body height", true);
    if (hip && ballSide && report.quality.cameraStable) {
      const direction = ballSide === "right" ? 1 : -1;
      const toward = Math.max(0, hip.value * direction);
      const range = hip.range?.map((value) => Math.max(0, value * direction)).sort((a, b) => a - b) as [number, number] | undefined;
      add({ id: "hip_depth", label: "Hip space toward the ball", value: Math.round(toward * 10) / 10, unit: "% body height", time: hip.time,
        evidence: range ? `The tracked hip's movement toward the ball ranges from ${range[0]}% to ${range[1]}% of visible body height around estimated contact. This is a projected hip landmark, not the rear edge of the pelvis.` :
          `The tracked hip moved ${Math.abs(hip.value)}% of visible body height ${toward > 0 ? "toward" : "away from"} the ball side at estimated impact. This is a projected hip landmark, not the rear edge of the pelvis.`,
        cue: "Rehearse five slow turns without a ball, maintaining space between your hips and the ball line. Confirm the movement visually before trying to change it at speed.",
        check: "Review the green address guide and the tracked hip at impact. Movement toward the ball is a review signal, not a confirmed early-extension diagnosis." }, range ?? toward);
    } else result.missing.push(ballSide ? "Hip space needs the same hip visible at setup and impact." : "Select which side of your body the ball appears on, then analyze again to score hip space.");
  }
  const topTime = report.readings.find((row) => row.phase === "top" && Number.isFinite(row.time))?.time;
  if (report.tempo && Number.isFinite(report.tempo.ratio) && report.tempo.ratio > 0 && topTime !== undefined) {
    const tempo = report.tempo;
    if (tempo.ratioRange && (!tempo.ratioRange.every((value) => Number.isFinite(value) && value > 0) ||
        tempo.ratioRange[0] > tempo.ratioRange[1])) {
      result.missing.push("Rhythm was not scored because its timing bounds are invalid.");
      return result;
    }
    const deviation = Math.max(0, 2 - tempo.ratio, tempo.ratio - 4);
    const deviationRange: [number, number] | undefined = tempo.ratioRange ? [
      tempo.ratioRange[1] < 2 ? 2 - tempo.ratioRange[1] : tempo.ratioRange[0] > 4 ? tempo.ratioRange[0] - 4 : 0,
      Math.max(0, 2 - tempo.ratioRange[0], tempo.ratioRange[1] - 4),
    ] : undefined;
    add({ id: "tempo", label: "Backswing / downswing rhythm", value: tempo.ratio, unit: ":1", time: topTime,
      evidence: tempo.ratioRange ? `Your recorded backswing-to-downswing ratio is approximately ${tempo.ratio}:1; sample timing permits ${tempo.ratioRange[0].toFixed(1)}:1 to ${tempo.ratioRange[1].toFixed(1)}:1.` :
        `Your recorded backswing-to-downswing ratio is ${tempo.ratio}:1.`,
      cue: "Rehearse a smooth count: one-two-three going back, four coming down. Try five half-speed swings with a gradual change of direction.",
      check: "Re-record at a constant playback speed. Compare the rhythm and strike; avoid clips with speed ramps." }, deviationRange ?? deviation, deviation);
    const { weight, free, severe } = rubric.tempo;
    result.components.at(-1)!.rubric = `No deduction for ratios from ${Math.max(0, 2 - free)}:1 to ${4 + free}:1; linear deduction to 0 at ${Math.max(0, 2 - severe)}:1 and ${4 + severe}:1. Weight: ${weight}.`;
  } else result.missing.push(report.timing?.source === "occluded_transition" ?
    "Rhythm was not scored because the hands are hidden around the backswing transition. Body movement can still be scored; a new recording with the hands visible is needed to add rhythm." :
    "Rhythm was not scored because swing timing is not precise enough. A new recording with clear hands and more frames can add this check.");
  return result;
}
