import { LM, unpackFrames, type PoseModel } from "./pose";
import { motionGeometry, type MotionReport } from "./motion-analysis";
import { scoreSwing, type SwingScore, type SwingScoreComponent } from "./swing-score";

/** Coaching heuristic: reconstructed posture 40%, observed body movement
 * 30%, recorded rhythm 30%. Inferred club motion and pressure are excluded. */
export function scoreReconstruction(model: PoseModel, report: MotionReport): SwingScore {
  const result: SwingScore = { total: null, components: [], priorities: [], reviews: [], missing: [], reason: null };
  if (model.reconstructionVersion !== 1 || !report.usable || !report.phases || model.frames.length !== model.t.length) {
    result.reason = "Build a 3D model of one complete swing to get a score and analysis.";
    return result;
  }
  if (report.view === "other" || report.quality.coverage < 0.85 || report.quality.largestGap > 0.12) {
    result.reason = "The 3D replay is ready, but scoring needs a known camera view and continuous, clear body tracking through the swing.";
    return result;
  }
  const frames = unpackFrames(model);
  const geometry = motionGeometry(frames, model.aspect ?? 1, report.view);
  const inclination = (index: number) => {
    const frame = frames[index];
    if (!frame || !geometry.visibleBody(frame) || frame.landmarks.length !== 33) return null;
    const centre = (a: number, b: number) => ({
      x: (frame.landmarks[a]!.x + frame.landmarks[b]!.x) / 2,
      y: (frame.landmarks[a]!.y + frame.landmarks[b]!.y) / 2,
      z: (frame.landmarks[a]!.z + frame.landmarks[b]!.z) / 2,
    });
    const hip = centre(LM.leftHip, LM.rightHip), shoulder = centre(LM.leftShoulder, LM.rightShoulder);
    const vertical = hip.y - shoulder.y;
    if (vertical <= 0.1) return null;
    const value = Math.atan2(Math.hypot(hip.x - shoulder.x, hip.z - shoulder.z), vertical) * 180 / Math.PI;
    return Number.isFinite(value) && value <= 85 ? value : null;
  };
  const setup = inclination(report.phases.address), impact = inclination(report.phases.impact);
  if (setup !== null && impact !== null) {
    const impactTime = model.t[report.phases.impact]!;
    const nearby = model.t.flatMap((time, index) => {
      if (Math.abs(time - impactTime) > 0.035) return [];
      const value = inclination(index);
      return value === null ? [] : [Math.max(0, setup - value)];
    });
    const loss = Math.max(0, setup - impact);
    const grade = (value: number) => Math.round(100 * (1 - Math.min(1, Math.max(0, (value - 10) / 20))));
    const range: [number, number] = [grade(Math.max(loss, ...nearby)), grade(Math.min(loss, ...nearby))];
    result.components.push({ id: "posture_3d", label: "Posture through impact", weight: 40,
      score: grade(loss), ...(range[0] !== range[1] ? { scoreRange: range } : {}),
      value: Math.round(loss * 10) / 10, unit: "°", time: impactTime,
      evidence: `The reconstructed torso is about ${setup.toFixed(0)}° from vertical at setup and ${impact.toFixed(0)}° at estimated impact. ${loss > 10 ? "The model shows a rise toward upright before contact." : "The model retains a similar amount of forward inclination through contact."} Depth is estimated from the recording.`,
      cue: "Rehearse five slow half swings, turning while keeping room for your arms. Let the chest rise naturally after contact.",
      check: "Compare setup and impact in the 3D replay and original video, then check strike location with five half shots.",
      rubric: "Reconstructed torso: no deduction through 10° of inclination loss, linear deduction to 0 at 30°. Weight 40%.",
    });
  } else result.missing.push("The body model could not support a posture comparison at setup and impact.");
  // Camera movement has already withheld displacement readings upstream.
  // Rhythm and relative 3D posture can still be evaluated without them.
  const observed = scoreSwing({ ...report, quality: { ...report.quality, cameraStable: true } }, model.ballSide);
  for (const component of observed.components) {
    if (component.id === "tempo" || (report.quality.cameraStable && component.id === (report.view === "face_on" ? "head" : "hip_depth"))) {
      result.components.push({ ...component, weight: 30, rubric: component.rubric.replace(/Weight: \d+%/, "Weight: 30%") });
    }
  }
  if (!result.components.some((component) => component.id === "head" || component.id === "hip_depth")) {
    result.missing.push(report.quality.cameraStable ? "Head or hip movement could not be scored clearly from this view." : "Body displacement was excluded because the feet, camera or image scale moved.");
  }
  if (!result.components.some((component) => component.id === "tempo")) result.missing.push("Rhythm was excluded because the hands or backswing transition were not clear enough.");
  const weight = result.components.reduce((sum, component) => sum + component.weight, 0);
  if (result.components.length >= 2 && weight >= 70) {
    result.total = Math.round(result.components.reduce((sum, component) => sum + (component.scoreRange?.[0] ?? component.score) * component.weight, 0) / weight);
    if (result.components.some((component) => component.scoreRange)) result.totalRange = [result.total,
      Math.round(result.components.reduce((sum, component) => sum + (component.scoreRange?.[1] ?? component.score) * component.weight, 0) / weight)];
  } else result.reason = "The replay is ready, but this recording supports too few checks for an overall score. Review the supported observations below.";
  const upperScore = (component: SwingScoreComponent) => component.scoreRange?.[1] ?? component.score;
  result.priorities = result.components.filter((component) => upperScore(component) < 85)
    .sort((a, b) => (100 - upperScore(b)) * b.weight - (100 - upperScore(a)) * a.weight).slice(0, 3);
  result.reviews = result.components.filter((component) => component.scoreRange && component.scoreRange[0] < 85 && component.scoreRange[1] >= 85);
  return result;
}
