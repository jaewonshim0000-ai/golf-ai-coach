import { LM, unpackFrames, type PoseModel } from "./pose";
import { motionGeometry, trustworthyFrames, type MotionReport } from "./motion-analysis";
import { swingScoreChecks, type SwingScore, type SwingScoreComponent } from "./swing-score";

/** Coaching heuristic: reconstructed posture 40%, observed body movement
 * 30%, recorded rhythm 30%. Inferred club motion and pressure are excluded. */
export function scoreReconstruction(model: PoseModel, report: MotionReport): SwingScore {
  const result: SwingScore = { total: null, components: [], priorities: [], reviews: [], missing: [], reason: null };
  if (model.reconstructionVersion !== 1 || model.frames.length !== model.t.length) {
    result.reason = "Build a 3D model of one complete swing to get a score and analysis.";
    return result;
  }
  if (!report.phases) {
    result.reason = "The 3D replay is ready, but automatic swing timing could not be resolved. Open Adjust swing timing and mark address, top and impact to analyze the tracked positions.";
    return result;
  }
  if (report.view === "other") {
    result.reason = "Choose Face on or Down the line under the original video, then rebuild the swing to use the checks for that view.";
    return result;
  }
  if (!report.usable || report.quality.coverage < 0.85) {
    result.reason = `Clear body tracking is available in ${Math.round(report.quality.coverage * 100)}% of the swing; scoring needs 85%. Review the timing markers or rebuild with the shoulders and hips visible from setup through impact.`;
    return result;
  }
  const frames = trustworthyFrames(unpackFrames(model), model.aspect ?? 1, report.view);
  const geometry = motionGeometry(frames, model.aspect ?? 1, report.view);
  const inclination = (index: number) => {
    const frame = frames[index];
    if (!frame || !geometry.visibleBody(frame) || frame.landmarks.length !== 33) return null;
    if (![LM.leftHip, LM.rightHip, LM.leftShoulder, LM.rightShoulder].every((joint) =>
      (frame.landmarks[joint]!.visibility ?? 0) >= 0.6)) return null;
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
  // Use individual supported checks, without the 2D overall-score gate.
  // Timing gaps withhold rhythm upstream, not visible posture or displacement.
  const observed = swingScoreChecks(report, model.ballSide);
  for (const component of observed.components) {
    if (component.id === "tempo" || (report.quality.cameraStable && component.id === (report.view === "face_on" ? "head" : "hip_depth"))) {
      result.components.push({ ...component, weight: 30, rubric: component.rubric.replace(/Weight: \d+%/, "Weight: 30%") });
    }
  }
  if (!result.components.some((component) => component.id === "head" || component.id === "hip_depth")) {
    const missingBodyCheck = observed.missing.find((message) =>
      message.startsWith(report.view === "face_on" ? "Head control" : "Hip space") || message.startsWith("Select which side"));
    result.missing.push(report.quality.cameraStable ? missingBodyCheck ?? "Head or hip movement could not be scored clearly from this view." :
      "Body displacement was excluded because the feet, camera or image scale moved.");
  }
  if (!result.components.some((component) => component.id === "tempo")) result.missing.push("Rhythm was excluded because the hands or backswing transition were not clear enough.");
  const weight = result.components.reduce((sum, component) => sum + component.weight, 0);
  if (result.components.length >= 2 && weight >= 70) {
    result.total = Math.round(result.components.reduce((sum, component) => sum + (component.scoreRange?.[0] ?? component.score) * component.weight, 0) / weight);
    if (result.components.some((component) => component.scoreRange)) result.totalRange = [result.total,
      Math.round(result.components.reduce((sum, component) => sum + (component.scoreRange?.[1] ?? component.score) * component.weight, 0) / weight)];
  } else result.reason = `Analysis is complete with ${result.components.length} of 3 supported checks. An overall score needs two checks covering at least 70% of the planned weight. Review the available results and recording notes below.`;
  const upperScore = (component: SwingScoreComponent) => component.scoreRange?.[1] ?? component.score;
  result.priorities = result.components.filter((component) => upperScore(component) < 85)
    .sort((a, b) => (100 - upperScore(b)) * b.weight - (100 - upperScore(a)) * a.weight).slice(0, 3);
  result.reviews = result.components.filter((component) => component.scoreRange && component.scoreRange[0] < 85 && component.scoreRange[1] >= 85);
  return result;
}
