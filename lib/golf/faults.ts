import type { Club } from "../../types/golf";
import { SWING_DRILLS, type SwingDrill } from "../seed/drills";
import { frameAtTime, visiblePoint, type MotionReading, type MotionReport, type MotionView } from "./motion-analysis";
import { setupReadings, setupStance, shaftAngle } from "./setup-marks";
import { LM, unpackFrames, type BallFlight, type PoseModel } from "./pose";

/**
 * Swing faults the 2D analysis can actually see, and the ball flights each one
 * explains. Every threshold below is PROVISIONAL: a coaching heuristic in the
 * readings' own picture units, not a population norm, to be checked against
 * coach-labelled swings before it is treated as a standard. The clubface is
 * not visible, so no fault here claims to read it.
 */

type Contact = BallFlight["contact"];
type Curve = BallFlight["curve"];
/** Start direction named for the player's hand: a right-hander's pull starts left. */
export type Start = "pull" | "straight" | "push";
export type FaultId =
  | "sway" | "slide" | "hang_back" | "head_lunge" | "ball_forward" | "ball_back" | "hands_behind"
  | "early_extension" | "posture_loss" | "dip" | "setup_upright" | "setup_flat";

export type Fault = {
  id: FaultId;
  title: string;
  view: MotionView | "any";
  /** Reading id from motion-analysis, setup-marks or `faultReadings`, in this unit only. */
  reading: string;
  unit: MotionReading["unit"];
  /** "above": flagged at or over the threshold. "below": at or under it. */
  flag: "above" | "below";
  /** Provisional. Null where the club has no sensible range (putter). */
  threshold: (club: Club) => number | null;
  /** Plain-language condition, for the card and the README. */
  condition: string;
  explains: { contact: Contact[]; start: Start[]; curve: Curve[] };
  /** How far a 2D picture reading supports this fault, never above medium. */
  confidence: "medium" | "low";
  seen: (value: number) => string;
  mechanism: string;
  drills: string[];
  feel: string;
  check: string;
};

type Band = "driver" | "wood" | "iron" | "short";
function band(club: Club): Band | null {
  if (club === "putter") return null;
  if (club === "driver") return "driver";
  if (club.endsWith("wood") || club.endsWith("hybrid")) return "wood";
  return ["3_iron", "4_iron", "5_iron", "6_iron", "7_iron"].includes(club) ? "iron" : "short";
}
const byBand = (values: Record<Band, number | null>) => (club: Club) => { const b = band(club); return b ? values[b] : null; };
const always = (value: number) => (club: Club) => (band(club) ? value : null);
// Ball position, % of stance width from the ankle midpoint, + toward the lead foot.
const BALL = { driver: [20, 60], wood: [5, 45], iron: [-10, 30], short: [-25, 15] } as const;
// Down-the-line shaft angle from horizontal in the picture; camera height moves it.
const SHAFT = { driver: [35, 55], wood: [38, 58], iron: [42, 63], short: [45, 67] } as const;
const abs = Math.abs;

export const FAULTS: Fault[] = [
  {
    id: "sway", title: "Sway off the ball", view: "face_on", reading: "hips_top", unit: "% stance", flag: "below", threshold: always(-20),
    condition: "Hip centre 20% of stance width or more toward the trail foot at the top",
    explains: { contact: ["fat", "thin"], start: ["push"], curve: [] }, confidence: "medium",
    seen: (v) => `At the top, your hip centre had moved ${abs(v)}% of your stance width toward your trail foot.`,
    mechanism: "When the hips drift away from the target going back, they have to travel back before the club reaches the ball, so the low point moves and the club can arrive late and open.",
    drills: ["swing_trail_hip_stick", "drill_half_swing_contact"],
    feel: "Feel your trail hip turn behind you, as if into a back pocket, rather than slide sideways.",
    check: "Next recording from the same spot: the hip centre at the top should sit closer to its setup line.",
  },
  {
    id: "slide", title: "Hips slide toward the target", view: "face_on", reading: "hips_impact", unit: "% stance", flag: "above", threshold: always(35),
    condition: "Hip centre 35% of stance width or more toward the lead foot at impact",
    explains: { contact: ["thin"], start: ["push"], curve: ["fade_slice"] }, confidence: "medium",
    seen: (v) => `At impact, your hip centre had moved ${v}% of your stance width toward your lead foot.`,
    mechanism: "Hips that slide past the lead foot instead of turning leave the arms and clubface behind, which tends to start the ball toward the trail side and leave the face open.",
    drills: ["swing_lead_hip_stick", "swing_lead_side_finish"],
    feel: "Feel your lead hip turn back and away from the ball through impact, not bump toward the target.",
    check: "Next recording: the hip centre at impact should stay nearer the lead foot instead of past it.",
  },
  {
    id: "hang_back", title: "Hips stay back at impact", view: "face_on", reading: "hips_impact", unit: "% stance", flag: "below", threshold: always(0),
    condition: "Hip centre no further toward the lead foot at impact than at setup",
    explains: { contact: ["fat", "thin"], start: ["pull"], curve: ["draw_hook"] }, confidence: "medium",
    seen: (v) => v === 0 ? "At impact, your hip centre was right where it started at setup." :
      `At impact, your hip centre was ${abs(v)}% of your stance width toward your trail foot from setup.`,
    mechanism: "With the hips behind their setup position at impact, the club tends to bottom out behind the ball and the hands flip to save it, closing the face.",
    drills: ["swing_lead_side_finish", "drill_towel_gate_contact"],
    feel: "Feel your belt buckle reach the target before the club does.",
    check: "Next recording: the hip centre at impact should sit toward the lead foot from its setup line.",
  },
  {
    id: "head_lunge", title: "Head moves toward the target", view: "face_on", reading: "head_impact", unit: "% stance", flag: "above", threshold: always(12),
    condition: "Nose 12% of stance width or more toward the lead foot at impact",
    explains: { contact: ["fat"], start: ["pull"], curve: ["fade_slice"] }, confidence: "medium",
    seen: (v) => `At impact, your head had moved ${v}% of your stance width toward the target from setup.`,
    mechanism: "When the head lunges toward the target, the upper body gets ahead of the ball, the club comes down steeply and across, and it digs or starts left of a right-hander's target.",
    drills: ["swing_head_behind_ball", "drill_half_swing_contact"],
    feel: "Feel your head stay behind the ball until it is gone.",
    check: "Next recording: the head guide at impact should sit at or behind its setup line.",
  },
  {
    id: "ball_forward", title: "Ball too far forward", view: "face_on", reading: "ball_address", unit: "% stance", flag: "above",
    threshold: byBand({ driver: BALL.driver[1], wood: BALL.wood[1], iron: BALL.iron[1], short: BALL.short[1] }),
    condition: "Marked ball past the forward end of the club's range (driver 60%, woods 45%, mid irons 30%, short irons 15% of stance toward the lead foot)",
    explains: { contact: ["thin"], start: ["pull"], curve: ["fade_slice"] }, confidence: "medium",
    seen: (v) => `At setup, the ball you marked sat ${abs(v)}% of your stance width ${v >= 0 ? "toward your lead foot" : "toward your trail foot"} from the middle of your stance.`,
    mechanism: "A ball too far forward is met after the low point with the path already swinging left of a right-hander's target, so it starts that way and is often caught thin.",
    drills: ["swing_ball_position_sticks"],
    feel: "Feel the ball sit under your lead shirt logo with irons, not outside it.",
    check: "Next recording: mark the ball again and check it sits inside the club's range.",
  },
  {
    id: "ball_back", title: "Ball too far back", view: "face_on", reading: "ball_address", unit: "% stance", flag: "below",
    threshold: byBand({ driver: BALL.driver[0], wood: BALL.wood[0], iron: BALL.iron[0], short: BALL.short[0] }),
    condition: "Marked ball behind the back end of the club's range (driver 20%, woods 5% toward the lead foot; mid irons 10%, short irons 25% toward the trail foot)",
    explains: { contact: [], start: ["push"], curve: ["draw_hook"] }, confidence: "medium",
    seen: (v) => `At setup, the ball you marked sat ${abs(v)}% of your stance width ${v >= 0 ? "toward your lead foot" : "toward your trail foot"} from the middle of your stance.`,
    mechanism: "A ball too far back is met while the club is still travelling out toward the trail side, so it starts that way and tends to curve back.",
    drills: ["swing_ball_position_sticks"],
    feel: "Feel the ball in the middle of your stance with a short iron, a little forward of it with a mid iron.",
    check: "Next recording: mark the ball again and check it sits inside the club's range.",
  },
  {
    id: "hands_behind", title: "Hands behind the ball at setup", view: "face_on", reading: "lean_address", unit: "° in picture", flag: "below",
    threshold: byBand({ driver: null, wood: null, iron: -5, short: -5 }),
    condition: "Iron shaft leaning 5° or more toward the trail foot at setup",
    explains: { contact: ["fat", "thin"], start: [], curve: [] }, confidence: "low",
    seen: (v) => `At setup, the shaft you marked leaned ${abs(v)}° with your hands toward your trail foot.`,
    mechanism: "Starting with the hands behind the clubhead makes a forward-leaning shaft at impact harder to reach, so the club tends to bottom out early.",
    drills: ["swing_hands_ahead_setup", "drill_towel_gate_contact"],
    feel: "Feel your hands over your lead thigh before you start the club back.",
    check: "Next recording: mark the grip and clubhead again; the shaft should lean toward the target.",
  },
  {
    id: "early_extension", title: "Hips move toward the ball", view: "down_the_line", reading: "hips_ballward_impact", unit: "% body height", flag: "above", threshold: always(5),
    condition: "Tracked hip 5% of body height or more toward the ball at impact",
    explains: { contact: ["thin", "heel"], start: ["push"], curve: ["draw_hook"] }, confidence: "medium",
    seen: (v) => `At impact, your tracked hip had moved ${v}% of your body height toward the ball from setup.`,
    mechanism: "When the hips move toward the ball, the arms lose their room, the club moves out toward the heel and the hands either hold the face open or flip it closed.",
    drills: ["swing_chair_behind", "swing_chest_down"],
    feel: "Feel your backside stay back on its setup line as you turn through.",
    check: "Next recording from the same spot: the hip at impact should sit on or behind the green address guide.",
  },
  {
    id: "posture_loss", title: "Standing up through impact", view: "down_the_line", reading: "posture_impact", unit: "° in picture", flag: "below", threshold: always(-10),
    condition: "Torso 10° or more closer to upright at impact than at setup",
    // Turning also changes this projected angle, so it stays low.
    explains: { contact: ["thin", "toe"], start: ["push"], curve: ["fade_slice"] }, confidence: "low",
    seen: (v) => `At impact, your torso was ${abs(v)}° closer to upright than at setup.`,
    mechanism: "Rising out of posture lifts the club, so it meets the ball higher on the face or toward the toe, and the face is often left open.",
    drills: ["swing_chest_down", "swing_chair_behind"],
    feel: "Feel your chest stay pointed at the ball until your arms are past it.",
    check: "Next recording: compare the shoulder-to-hip line at setup and impact; it should change less.",
  },
  {
    id: "dip", title: "Dipping down through impact", view: "any", reading: "lift_impact", unit: "% body height", flag: "below", threshold: always(-4),
    condition: "Hips 4% of body height or more lower at impact than at setup",
    explains: { contact: ["fat", "heel"], start: [], curve: [] }, confidence: "low",
    seen: (v) => `At impact, your hips were ${abs(v)}% of your body height lower than at setup.`,
    mechanism: "Sinking toward the ground on the way down lowers the bottom of the swing, so the club hits the ground first or moves toward the heel.",
    drills: ["swing_ground_push", "drill_towel_gate_contact"],
    feel: "Feel your feet push into the ground as you start down.",
    check: "Next recording: the hips at impact should sit at about their setup height.",
  },
  {
    id: "setup_upright", title: "Shaft upright at setup", view: "down_the_line", reading: "shaft_address", unit: "° in picture", flag: "above",
    threshold: byBand({ driver: SHAFT.driver[1], wood: SHAFT.wood[1], iron: SHAFT.iron[1], short: SHAFT.short[1] }),
    condition: "Marked shaft steeper than the club's range in the picture (driver 55°, woods 58°, mid irons 63°, short irons 67°)",
    explains: { contact: ["heel"], start: ["pull"], curve: [] }, confidence: "low",
    seen: (v) => `At setup, the shaft you marked rose ${v}° from horizontal in this picture.`,
    mechanism: "An upright shaft usually means standing close with the hands high, which brings the heel into the ball and points the face left of a right-hander's target.",
    drills: ["swing_arm_hang"],
    feel: "Feel your arms hang straight down from your shoulders at setup.",
    check: "Next recording from the same camera height: mark the club again and compare the angle.",
  },
  {
    id: "setup_flat", title: "Shaft flat at setup", view: "down_the_line", reading: "shaft_address", unit: "° in picture", flag: "below",
    threshold: byBand({ driver: SHAFT.driver[0], wood: SHAFT.wood[0], iron: SHAFT.iron[0], short: SHAFT.short[0] }),
    condition: "Marked shaft flatter than the club's range in the picture (driver 35°, woods 38°, mid irons 42°, short irons 45°)",
    explains: { contact: ["toe"], start: ["push"], curve: [] }, confidence: "low",
    seen: (v) => `At setup, the shaft you marked rose only ${v}° from horizontal in this picture.`,
    mechanism: "A flat shaft usually means reaching for the ball, which brings the toe into it and points the face right of a right-hander's target.",
    drills: ["swing_arm_hang"],
    feel: "Feel your arms hang straight down from your shoulders at setup.",
    check: "Next recording from the same camera height: mark the club again and compare the angle.",
  },
];

const FAULTS_BY_ID = new Map(FAULTS.map((fault) => [fault.id, fault]));
export type FeedbackId = FaultId | "clubface" | "strike";

const rounded = (value: number) => Math.round(value * 10) / 10;

/**
 * Every reading the catalogue checks: the motion report's, the setup marks',
 * and three derived ones. Shaft lean face on (+ hands toward the lead foot),
 * torso change down the line (− closer to upright) and hip movement toward the
 * ball down the line, whose side comes from the marked clubhead.
 */
export function faultReadings(model: PoseModel, report: MotionReport): MotionReading[] {
  const readings = [...report.readings, ...setupReadings(model)];
  const find = (id: string) => readings.find((row) => row.id === id);
  const marks = model.setup, aspect = model.aspect ?? 0;
  const derived = (id: string, label: string, value: number, unit: MotionReading["unit"], from: MotionReading | undefined, time: number) =>
    readings.push({ id, label, phase: from?.phase ?? "address", value: rounded(value), unit, note: label, time });
  const stance = setupStance(model);
  if (report.view === "face_on" && marks && stance?.toLead) {
    const lean = 90 - shaftAngle(marks, aspect), side = Math.sign((marks.grip[0] - marks.clubhead[0]) * stance.toLead);
    derived("lean_address", "Shaft lean at setup", lean * side, "° in picture", undefined, marks.t);
  }
  if (report.view === "down_the_line") {
    const setup = find("torso_address"), impact = find("torso_impact");
    if (setup && impact) derived("posture_impact", "Torso change at impact", impact.value - setup.value, "° in picture", impact, impact.time);
    const hips = find("hips_impact");
    const frame = marks ? frameAtTime(unpackFrames(model), marks.t) : null;
    const left = frame?.imageLandmarks?.[LM.leftHip], right = frame?.imageLandmarks?.[LM.rightHip];
    const hipX = visiblePoint(left) && visiblePoint(right) ? (left.x + right.x) / 2 : visiblePoint(left) ? left.x : visiblePoint(right) ? right.x : null;
    // The clubhead sits by the ball, so it says which side of the picture the ball is on.
    const ballSide = marks && hipX !== null ? Math.sign(marks.clubhead[0] - hipX) : model.ballSide === "right" ? 1 : model.ballSide === "left" ? -1 : 0;
    if (hips && ballSide) derived("hips_ballward_impact", "Hip movement toward the ball", hips.value * ballSide, "% body height", hips, hips.time);
  }
  return readings;
}

export type MeasuredFault = { fault: Fault; value: number; threshold: number; time: number };

/** A reading across an uncertain transition counts only where every value in its range does. */
function readFault(fault: Fault, readings: MotionReading[], club: Club): MeasuredFault | null {
  const threshold = fault.threshold(club), reading = readings.find((row) => row.id === fault.reading && row.unit === fault.unit);
  if (threshold === null || !reading || !Number.isFinite(reading.value)) return null;
  const value = reading.range ? (fault.flag === "above" ? Math.min(...reading.range) : Math.max(...reading.range)) : reading.value;
  return { fault, value, threshold, time: reading.time };
}
const flagged = (fault: Fault, value: number, threshold: number) => fault.flag === "above" ? value >= threshold : value <= threshold;

export function measureFaults(readings: MotionReading[], view: MotionView, club: Club): MeasuredFault[] {
  return FAULTS.flatMap((fault) => {
    if (fault.view !== "any" && fault.view !== view) return [];
    const measured = readFault(fault, readings, club);
    return measured && flagged(fault, measured.value, measured.threshold) ? [measured] : [];
  });
}

export function relativeStart(flight: BallFlight, handedness: "right" | "left"): Start {
  if (flight.start === "straight") return "straight";
  return (flight.start === "left") === (handedness === "right") ? "pull" : "push";
}

const CONTACT_TEXT: Record<Contact, string> = { good: "good contact", fat: "fat contact", thin: "thin contact", toe: "toe strike", heel: "heel strike", unsure: "" };
const CURVE_TEXT: Record<Curve, string> = { draw_hook: "draw or hook", straight: "no curve", fade_slice: "fade or slice" };

/** The parts of the reported shot this fault explains, in the player's words. */
function fits(fault: Fault, flight: BallFlight, handedness: "right" | "left"): string[] {
  return [
    ...(fault.explains.contact.includes(flight.contact) ? [CONTACT_TEXT[flight.contact]] : []),
    ...(fault.explains.start.includes(relativeStart(flight, handedness)) ? [`a start to the ${flight.start}`] : []),
    ...(fault.explains.curve.includes(flight.curve) ? [`a ${CURVE_TEXT[flight.curve]}`] : []),
  ];
}

/** "started left, curved like a fade or slice, thin contact" */
export function describeFlight(flight: BallFlight): string {
  return [`started ${flight.start}`, flight.curve === "straight" ? "with no curve" : `curved like a ${CURVE_TEXT[flight.curve]}`,
    CONTACT_TEXT[flight.contact]].filter(Boolean).join(", ");
}

export type FeedbackCard = {
  id: FeedbackId;
  title: string;
  seen: string;
  /** Video time to review; none for the cards the camera cannot see. */
  time: number | null;
  why: string;
  drills: SwingDrill[];
  feel: string;
  check: string;
  confidence: "medium" | "low";
  /** The provisional check line, for measured faults only. */
  condition: string | null;
  measure: { reading: string; value: number; threshold: number; flag: Fault["flag"]; unit: MotionReading["unit"] } | null;
};
export type SwingFeedback = { primary: FeedbackCard | null; secondary: FeedbackCard | null; note: string };

const drills = (ids: string[]) => ids.map((id) => SWING_DRILLS.get(id)!);

function faultCard({ fault, value, threshold, time }: MeasuredFault, matched: string[] | null): FeedbackCard {
  return {
    id: fault.id, title: fault.title, seen: fault.seen(value), time,
    why: `${fault.mechanism} ${matched === null ? "Tell us what this shot did to check whether it explains your miss."
      : `It fits what you reported: ${matched.join(" and ")}.`}`,
    drills: drills(fault.drills), feel: fault.feel, check: fault.check, confidence: fault.confidence, condition: fault.condition,
    measure: { reading: fault.reading, value, threshold, flag: fault.flag, unit: fault.unit },
  };
}

/**
 * The clubface is out of sight, so a curve or start line nothing measured
 * explains points here. The curve reads the face against the path; a start
 * line alone reads it against the target.
 */
function clubfaceCard(flight: BallFlight, handedness: "right" | "left", startLeft: boolean, curveLeft: boolean): FeedbackCard {
  const start = relativeStart(flight, handedness);
  const open = curveLeft ? flight.curve === "fade_slice" : start === "push";
  const unexplained = curveLeft ? (startLeft ? "the start line or the curve" : "the curve") : "the start line";
  return {
    id: "clubface", title: "Clubface at impact", seen: "This camera can't see the clubface, so this comes from the shot you described.", time: null,
    why: `Your shot ${describeFlight(flight)}, and none of the body movements the camera measured explain ${unexplained}. Where a shot starts comes mostly from where the face points at impact, and the curve from the face compared with the swing path, so the face was most likely ${open ? "open" : "closed"} ${curveLeft ? "to the path." : "to the target. A start line off target can also be aim, so check where your feet and clubface point before changing the grip."}`,
    drills: drills([open ? "swing_grip_stronger" : "swing_grip_weaker", start === "straight" ? "drill_split_hand_face" : "drill_gate_face_control"]),
    feel: open ? "Feel the back of your lead hand turn toward the ground through impact." : "Feel the back of your lead hand keep facing the target well past impact.",
    check: "Next recording with the same club, answer the shot question again. The camera still can't see the face, so the start and curve are the check.",
    confidence: "low", condition: null, measure: null,
  };
}

function strikeCard(flight: BallFlight): FeedbackCard {
  const depth = flight.contact === "fat" || flight.contact === "thin";
  return {
    id: "strike", title: depth ? "Low point" : "Strike location", seen: `Nothing the camera measured on your body explains the ${CONTACT_TEXT[flight.contact]}.`, time: null,
    why: depth ? "Fat and thin shots come from where the club bottoms out. The camera tracks your body, not the club's low point."
      : "Toe and heel strikes come from where the face meets the ball, which the camera can't see. Distance from the ball at setup is a common cause.",
    drills: drills(depth ? ["drill_towel_gate_contact", "drill_half_swing_contact"] : ["drill_9_ball_contact", "swing_arm_hang"]),
    feel: depth ? "Feel the club brush the grass just after the ball." : "Feel your arms hang straight down from your shoulders at setup.",
    check: "Next recording with the same club, answer the shot question again; the contact is the check.",
    confidence: "low", condition: null, measure: null,
  };
}

/**
 * One primary fault and at most one secondary. A measured fault that explains
 * the reported shot ranks first, by how much of the shot it explains, then by
 * confidence and how far past the threshold it is. A start line or curve no
 * measured fault explains goes to the clubface card, and unexplained contact to
 * the strike card, rather than to a body fault that does not fit.
 */
export function rankFaults(measured: MeasuredFault[], flight: BallFlight | null, handedness: "right" | "left"): SwingFeedback {
  const strength = (item: MeasuredFault) => (item.fault.confidence === "medium" ? 2 : 1) + Math.min(1, abs(item.value - item.threshold) / 10);
  if (!flight) {
    const [first, second] = [...measured].sort((a, b) => strength(b) - strength(a));
    return { primary: first ? faultCard(first, null) : null, secondary: second ? faultCard(second, null) : null,
      note: first ? "Tell us what the shot did to rank these against your miss." : "Nothing the camera measured stands out. Tell us what the shot did for feedback on it." };
  }
  const fitting = measured.map((item) => ({ item, matched: fits(item.fault, flight, handedness) }))
    .filter((row) => row.matched.length).sort((a, b) => b.matched.length - a.matched.length || strength(b.item) - strength(a.item));
  const start = relativeStart(flight, handedness);
  const startLeft = start !== "straight" && !fitting.some((row) => row.item.fault.explains.start.includes(start));
  const curveLeft = flight.curve !== "straight" && !fitting.some((row) => row.item.fault.explains.curve.includes(flight.curve));
  const contactLeft = ["fat", "thin", "toe", "heel"].includes(flight.contact) && !fitting.some((row) => row.item.fault.explains.contact.includes(flight.contact));
  const cards = [
    ...fitting.map((row) => faultCard(row.item, row.matched)),
    ...(startLeft || curveLeft ? [clubfaceCard(flight, handedness, startLeft, curveLeft)] : []),
    ...(contactLeft ? [strikeCard(flight)] : []),
  ];
  // An unexplained direction outranks a second body fault, and so does unexplained contact.
  const [primary = null, ...rest] = cards;
  const secondary = rest.find((card) => card.measure === null) ?? rest[0] ?? null;
  return { primary, secondary, note: primary ? `Ranked against the shot you described: ${describeFlight(flight)}.`
    : `Your shot ${describeFlight(flight)}. ${measured.length ? "The movement the camera measured did not cost you this shot, so there is nothing to fix from it." : "Nothing to fix from this one."}` };
}

/** The whole flow for one stored swing: readings, measured faults, ranking against its shot. */
export function swingFeedback(model: PoseModel, report: MotionReport, club: Club) {
  const readings = faultReadings(model, report);
  return { readings, feedback: rankFaults(measureFaults(readings, report.view, club), model.ballFlight ?? null, model.handedness) };
}

/**
 * Did the fault the player was working on move since their earlier swing with
 * the same club and view? A movement change is only called progress when the
 * shot the fault explained has changed too.
 */
export function faultProgress(
  earlier: { card: FeedbackCard; flight: BallFlight | null; date: string },
  now: { readings: MotionReading[]; flight: BallFlight | null; club: Club },
  handedness: "right" | "left",
): string | null {
  const fault = FAULTS_BY_ID.get(earlier.card.id as FaultId), before = earlier.card.measure;
  if (!fault || !before) return null;
  const intro = `On your ${earlier.date} swing with this club and view, the main fault was ${fault.title.toLowerCase()}. ${fault.seen(before.value)}`;
  const after = readFault(fault, now.readings, now.club);
  if (!after) return `${intro} This recording doesn't show it clearly enough to compare.`;
  const seen = fault.seen(after.value);
  const latest = `This time, ${seen.charAt(0).toLowerCase()}${seen.slice(1)}`;
  const better = fault.flag === "below" ? after.value > before.value : after.value < before.value;
  if (abs(after.value - before.value) < 2) return `${intro} ${latest} That's about the same.`;
  if (!better) return `${intro} ${latest} It moved further past the check line.`;
  const moved = flagged(fault, after.value, after.threshold) ? "It moved toward the check line." : "It moved back inside the check line.";
  const explained = earlier.flight ? fits(fault, earlier.flight, handedness) : [];
  const verdict = !now.flight ? "Answer the shot question for this swing before calling it progress."
    : !earlier.flight ? "The earlier swing has no shot answer, so this is a movement change, not an improvement yet."
    : explained.length && !fits(fault, now.flight, handedness).length
      ? `Your shot changed too: it ${describeFlight(earlier.flight)} before, and this one ${describeFlight(now.flight)}. That looks like real progress.`
      : "The shot hasn't changed in the way this fault explains, so this is a movement change, not an improvement yet.";
  return `${intro} ${latest} ${moved} ${verdict}`;
}
