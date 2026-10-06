import type { MotionReading, MotionReport } from "./motion-analysis";

export type SwingScoreComponent = {
  id: string; label: string; score: number; weight: number; value: number; unit: string;
  time: number; evidence: string; cue: string; check: string; rubric: string;
  /** Bounds from observed body positions across an uncertain transition. */
  scoreRange?: [number, number];
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

/** v1 coaching heuristic, not population norms or a prediction of ball flight.
 * Scores describe three visible control checks. Missing evidence is never 100.
 * Use only comparable full-swing recordings from the same camera position.
 */
export function scoreSwing(report: MotionReport, ballSide?: "left" | "right"): SwingScore {
  const result: SwingScore = { total: null, components: [], priorities: [], reviews: [], missing: [], reason: null };
  if (!report.usable || !report.phases) result.reason = "Analyze one complete swing before scoring.";
  else if (report.view === "other") result.reason = "Choose Face on or Down the line and analyze again to use the appropriate scoring checks.";
  else if (report.quality.coverage < 0.85 || !report.quality.cameraStable || report.quality.largestGap > 0.12)
    result.reason = "A score needs a fixed camera, at least 85% visible body tracking, and no sample gaps over 0.12 seconds. Re-record with your whole body visible.";
  if (result.reason) return result;

  const reading = (id: string, unit: MotionReading["unit"], allowRange = false) => report.readings.find((row) =>
    row.id === id && row.unit === unit && Number.isFinite(row.value) &&
    (!row.range || (allowRange && row.range.every(Number.isFinite) && row.range[0] <= row.range[1])));
  const absoluteRange = ([low, high]: [number, number]): [number, number] =>
    [low <= 0 && high >= 0 ? 0 : Math.min(Math.abs(low), Math.abs(high)), Math.max(Math.abs(low), Math.abs(high))];
  const add = (component: Omit<SwingScoreComponent, "score" | "rubric">, amount: number | [number, number], free: number, severe: number) => {
    const grade = (value: number) => Math.round(100 * (1 - Math.min(1, Math.max(0, (value - free) / (severe - free)))));
    const bounds: [number, number] = Array.isArray(amount) ? [grade(amount[1]), grade(amount[0])] : [grade(amount), grade(amount)];
    result.components.push({ ...component, score: bounds[0],
      ...(Array.isArray(amount) ? { scoreRange: bounds } : {}),
      rubric: `No deduction through ${free}${component.unit}; linear deduction to 0 at ${severe}${component.unit}. Weight: ${component.weight}%.`,
    });
  };
  if (report.view === "face_on") {
    const head = reading("head_impact", "% stance");
    if (head) add({ id: "head", label: "Head control at impact", weight: 40, value: Math.abs(head.value), unit: "% stance", time: head.time,
      evidence: `Your head shifted ${Math.abs(head.value)}% of stance width ${head.value < 0 ? "toward the trail foot" : "toward the lead foot"} from setup at estimated impact.`,
      cue: "Try five waist-high swings at half speed. Allow a natural turn while reducing a large sideways lunge; do not try to freeze your head.",
      check: "Film from the same position and compare the head guide at setup and impact. Check strike location as well as the score." }, Math.abs(head.value), 12, 40);
    else result.missing.push("Head control needs a visible head and both ankles at impact in a face-on view.");
    const lift = reading("lift_top", "% body height", true);
    if (lift) add({ id: "height", label: "Height control in the backswing", weight: 30, value: Math.abs(lift.value), unit: "% body height", time: lift.time,
      evidence: lift.range ? `Hip height ranges from ${lift.range[0]}% to ${lift.range[1]}% of visible body height relative to setup across the estimated backswing transition. Negative is lower; positive is higher. The score uses all observed positions in that interval.` :
        `Hip height changed ${Math.abs(lift.value)}% of visible body height ${lift.value < 0 ? "down" : "up"} from setup at the top.`,
      cue: "Make five slow backswings with a comfortable knee bend. Review large rises or dips without forcing the hips to stay motionless.",
      check: lift.range ? "Review the visible hips across the estimated transition, rather than treating one frame as the exact top. Then hit five half shots and check centered contact." :
        "Compare setup and top on the overlay, then hit five half shots and check centered contact." }, lift.range ? absoluteRange(lift.range) : Math.abs(lift.value), 4, 15);
    else result.missing.push("Backswing height was not scored because the hip position could not be measured at or across the top.");
  } else {
    const setup = reading("torso_address", "° in picture"), impact = reading("torso_impact", "° in picture");
    if (setup && impact) {
      const loss = Math.max(0, setup.value - impact.value);
      add({ id: "posture", label: "Posture through impact", weight: 35, value: Math.round(loss * 10) / 10, unit: "°", time: impact.time,
        evidence: `Visible side inclination changed from ${setup.value}° at setup to ${impact.value}° at estimated impact (${loss.toFixed(1)}° closer to upright). Rotation also affects this projection.`,
        cue: "Make five slow half swings while keeping room for your arms. Review whether your chest rises abruptly before impact; allow normal rotation and the rise into the finish.",
        check: "Pause setup and estimated impact from the same camera position. Compare the visible shoulder-to-hip line and check centered contact." }, loss, 10, 30);
    } else result.missing.push("Posture needs the same visible shoulder and hip at setup and impact.");
    const hip = reading("hips_impact", "% body height");
    if (hip && ballSide) {
      const toward = Math.max(0, hip.value * (ballSide === "right" ? 1 : -1));
      add({ id: "hip_depth", label: "Hip space toward the ball", weight: 35, value: Math.round(toward * 10) / 10, unit: "% body height", time: hip.time,
        evidence: `The tracked hip moved ${Math.abs(hip.value)}% of visible body height ${toward > 0 ? "toward" : "away from"} the ball side at estimated impact. This is a projected hip landmark, not the rear edge of the pelvis.`,
        cue: "Rehearse five slow turns without a ball, maintaining space between your hips and the ball line. Confirm the movement visually before trying to change it at speed.",
        check: "Review the green address guide and the tracked hip at impact. Movement toward the ball is a review signal, not a confirmed early-extension diagnosis." }, toward, 3, 12);
    } else result.missing.push(ballSide ? "Hip space needs the same hip visible at setup and impact." : "Select which side of your body the ball appears on, then analyze again to score hip space.");
  }
  const topTime = report.readings.find((row) => row.phase === "top" && Number.isFinite(row.time))?.time;
  if (report.tempo && Number.isFinite(report.tempo.ratio) && report.tempo.ratio > 0 && topTime !== undefined) {
    const tempo = report.tempo;
    const deviation = Math.max(0, 2 - tempo.ratio, tempo.ratio - 4);
    add({ id: "tempo", label: "Backswing / downswing rhythm", weight: 30, value: tempo.ratio, unit: ":1", time: topTime,
      evidence: `Your recorded backswing-to-downswing ratio is ${tempo.ratio}:1.`,
      cue: "Rehearse a smooth count: one-two-three going back, four coming down. Try five half-speed swings with a gradual change of direction.",
      check: "Re-record at a constant playback speed. Compare the rhythm and strike; avoid clips with speed ramps." }, deviation, 0, 2);
    result.components.at(-1)!.rubric = "No deduction for ratios from 2:1 to 4:1; linear deduction to 0 two ratio points outside that window. Weight: 30%.";
  } else result.missing.push(report.timing?.source === "occluded_transition" ?
    "Rhythm was not scored because the hands are hidden around the backswing transition. Body movement can still be scored; a new recording with the hands visible is needed to add rhythm." :
    "Rhythm was not scored because swing timing is not precise enough. A new recording with clear hands and more frames can add this check.");
  const weight = result.components.reduce((sum, item) => sum + item.weight, 0);
  if (result.components.length >= 2 && weight >= 70) {
    result.total = Math.round(result.components.reduce((sum, item) => sum + item.score * item.weight, 0) / weight);
    if (result.components.some((item) => item.scoreRange)) {
      result.totalRange = [result.total, Math.round(result.components.reduce((sum, item) => sum + (item.scoreRange?.[1] ?? item.score) * item.weight, 0) / weight)];
    }
  } else result.reason = `Movement analysis is complete, but only ${result.components.length} of 3 checks could be scored. An overall score needs at least two checks covering 70% of the planned weight. Review the available results below; repeating this recording will not reveal hidden positions.`;
  // Keep supported improvement cues even when an overall score is unavailable.
  // A ranged reading is a priority only if all observed positions score below 85.
  result.priorities = [...result.components].filter((item) => (item.scoreRange?.[1] ?? item.score) < 85)
    .sort((a, b) => (100 - (b.scoreRange?.[1] ?? b.score)) * b.weight - (100 - (a.scoreRange?.[1] ?? a.score)) * a.weight).slice(0, 3);
  result.reviews = result.components.filter((item) => item.scoreRange && item.scoreRange[0] < 85 && item.scoreRange[1] >= 85);
  return result;
}
