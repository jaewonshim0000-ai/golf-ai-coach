import type { MotionReport } from "./motion-analysis";
import { scoreSwing } from "./swing-score";

export type SwingFocusId = "head" | "height" | "posture" | "hip_depth" | "tempo";
export type SwingProcedure = "rehearsal" | "half_shots";
export type SwingFocus = { id: SwingFocusId | null; issue: string; steps: string[] };

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

/** Rank supported checks internally; show just one issue and its procedure. */
export function getSwingFocus(report: MotionReport, ballSide?: "left" | "right"): SwingFocus {
  const score = scoreSwing(report, ballSide);
  const main = score.priorities[0];
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
    return { id, issue: issues[id], steps: swingFocusProcedure(id, "rehearsal") };
  }

  const unclear = !score.components.length || score.reviews.length > 0 || score.missing.length > 0;
  return {
    id: null,
    issue: unclear ? "This recording does not show a clear main problem." : "No clear problem found in the visible movement.",
    steps: unclear ? [
      "Place the phone on a fixed support, facing your chest or directly behind you.",
      "Record one swing with your head, hands and feet visible, from a brief still setup through the finish. Use a constant video speed.",
      "Upload the new recording to identify one issue to work on.",
    ] : [
      "Keep your current swing and make five comfortable shots, checking for contact near the center of the clubface.",
      "Record another swing from the same phone position to check whether a consistent issue appears.",
    ],
  };
}
