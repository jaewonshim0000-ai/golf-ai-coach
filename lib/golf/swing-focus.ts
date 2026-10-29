import type { MotionReport } from "./motion-analysis";
import { swingScoreChecks } from "./swing-score";

export type SwingFocusId = "head" | "height" | "posture" | "hip_depth" | "tempo";
export type SwingProcedure = "rehearsal" | "half_shots";
export type SwingFocus = {
  status: "issue" | "clear" | "needs_input";
  id: SwingFocusId | null;
  issue: string;
  steps: string[];
};

const procedures: Record<SwingFocusId, Record<SwingProcedure, string[]>> = {
  head: {
    rehearsal: [
      "Set up without a ball and make five waist-high swings at half speed.",
      "Let your body turn naturally while easing the sideways lunge through contact. Keep your head free to move.",
      "Hit five half shots with the same feel, then record again from the same position. Compare the sideways movement and where the ball meets the clubface.",
    ],
    half_shots: [
      "Start with five short shots, swinging only from waist high to waist high.",
      "Use a comfortable turn and reduce the sideways lunge as you swing through the ball.",
      "Record another half swing from the same position. Compare your head at setup and contact, and check for strikes near the center of the clubface before adding speed.",
    ],
  },
  height: {
    rehearsal: [
      "Take your normal setup with a comfortable knee bend, without a ball.",
      "Make five slow backswings, easing the large rise or dip while allowing your hips to turn naturally.",
      "Hit five half shots, then record again from the same position. Compare your hip height during the backswing and check where the ball meets the clubface.",
    ],
    half_shots: [
      "Take your normal setup and hit five shots with a short, easy backswing.",
      "Keep a comfortable knee bend as you turn back. Avoid deliberately standing taller or squatting deeper.",
      "Record another swing from the same position. Compare your hip height at setup and during the backswing, and check contact before lengthening the swing.",
    ],
  },
  posture: {
    rehearsal: [
      "Set up without a ball, bending comfortably forward from your hips.",
      "Make five slow half swings. Keep room for your arms through the contact area, allowing a natural turn and rise into the finish.",
      "Hit five half shots, then film again from behind. Compare your chest position at setup and contact, and check where the ball meets the clubface.",
    ],
    half_shots: [
      "Hit five waist-high shots at half speed from your normal setup.",
      "Feel your chest turning through the contact area with room for your arms, then let your body rise into the finish.",
      "Record another swing from behind. Check whether your chest rises abruptly before contact, and keep the shorter swing until contact is repeatable.",
    ],
  },
  hip_depth: {
    rehearsal: [
      "Take your normal setup without a ball and note the space between your hips and the ball line.",
      "Rehearse five slow turns, keeping room for your arms instead of pushing your hips toward the ball line.",
      "Film another rehearsal from behind to check that space. Then try five half shots and compare contact before adding speed.",
    ],
    half_shots: [
      "Begin with five short shots at half speed from your normal setup.",
      "Allow your hips to turn while keeping space for your hands through contact.",
      "Film again from behind. Compare your hips with the setup guide and check contact before returning to a full swing.",
    ],
  },
  tempo: {
    rehearsal: [
      "Without a ball, rehearse a smooth count: one-two-three going back, four coming down.",
      "Make five half-speed swings with a gradual change of direction at the top.",
      "Hit five half shots with the same count. Record again at a constant video speed and compare the rhythm and contact.",
    ],
    half_shots: [
      "Set up for five short shots with a waist-high backswing.",
      "Count one-two-three going back and four coming down, letting the change of direction stay smooth.",
      "Keep that count as you gradually lengthen the swing. Record again at a constant video speed and compare the rhythm and contact.",
    ],
  },
};

export function swingFocusProcedure(id: SwingFocusId, procedure: SwingProcedure): string[] {
  return [...procedures[id][procedure]];
}

/** Timing and views are automatic, so the remedy is always a clearer recording. */
function recordAgain(issue: string): SwingFocus {
  return { status: "needs_input", id: null, issue, steps: [
    "Record again in slow motion with the phone on a stand, placed as the filming guide shows.",
    "Keep your whole body, hands and club in view from setup through the finish.",
    "The new video is timed and analyzed automatically.",
  ] };
}

/** A full-swing score has stricter requirements than an individual visible
 * position. Missing checks or a gap elsewhere must not erase usable evidence. */
export function getSwingFocus(report: MotionReport, ballSide?: "left" | "right"): SwingFocus {
  const { components } = swingScoreChecks(report, ballSide);
  const main = components.filter((item) => (item.scoreRange?.[1] ?? item.score) < 85)
    .sort((a, b) => (100 - (b.scoreRange?.[1] ?? b.score)) * b.weight - (100 - (a.scoreRange?.[1] ?? a.score)) * a.weight)[0];
  if (main && Object.hasOwn(procedures, main.id)) {
    const id = main.id as SwingFocusId;
    const lift = report.readings.find((row) => row.id === "lift_top");
    const issues: Record<SwingFocusId, string> = {
      head: "Your head shifts sideways through contact.",
      height: (lift?.value ?? 0) < 0 ? "Your hips dip during the backswing." : "Your hips rise during the backswing.",
      posture: "Your upper body appears to straighten before contact.",
      hip_depth: "Your hips appear to move toward the ball through contact.",
      tempo: main.value < 2
        ? "Your backswing is rushed compared with your downswing."
        : "Your downswing is rushed compared with your backswing.",
    };
    return { status: "issue", id, issue: issues[id], steps: swingFocusProcedure(id, "rehearsal") };
  }

  const uncertain = components.find((item) => item.scoreRange && item.scoreRange[0] < 85 && item.scoreRange[1] >= 85 &&
    (item.id !== "tempo" || (item.estimateScore ?? item.score) < 85));
  if (uncertain) {
    const details: Record<string, string> = {
      head: "Your head position around contact needs checking before choosing a correction.",
      height: "Your hip position near the top needs checking before choosing a correction.",
      posture: "Your posture around contact needs checking before choosing a correction.",
      hip_depth: "Your hip position around contact needs checking before choosing a correction.",
      tempo: "Your swing timing needs checking before choosing a rhythm correction.",
    };
    return recordAgain(details[uncertain.id] ?? "Your swing positions need checking before choosing a correction.");
  }
  if (components.length) {
    return { status: "clear", id: null, issue: "The visible checks do not show a clear swing fault.", steps: [
      "Keep your current swing and make five comfortable shots, checking for contact near the center of the clubface.",
      "Record another swing from the same phone position to check whether a consistent issue appears.",
    ] };
  }
  if (report.view === "other") return recordAgain("This camera angle has no matching checks. Film face on or down the line.");
  if (report.quality.coverage < 0.65) return recordAgain("Your body could not be tracked clearly through this swing.");
  if (!report.phases) return recordAgain("The setup, top and contact positions could not be identified automatically.");
  if (report.usable && !report.quality.cameraStable) {
    return { status: "needs_input", id: null, issue: "Camera or foot movement prevented a reliable head and hip check.", steps: [
      "Check whether the phone moves or both feet leave the frame during this swing.",
      "Use a fixed phone support and keep your feet visible for the next recording.",
    ] };
  }
  return recordAgain("The key body positions could not be read in this video.");
}
