import assert from "node:assert/strict";
import { test } from "node:test";
import { FAULTS, faultProgress, measureFaults, rankFaults } from "./faults";
import type { MotionReading } from "./motion-analysis";
import type { BallFlight } from "./pose";
import { SWING_DRILLS } from "../seed/drills";
import { ballFlightSchema } from "../validation/schemas";

const reading = (id: string, value: number, unit: MotionReading["unit"] = "% stance", time = 1.2): MotionReading =>
  ({ id, label: id, phase: "impact", value, unit, note: "", time });
const flight = (start: BallFlight["start"], curve: BallFlight["curve"], contact: BallFlight["contact"]): BallFlight => ({ start, curve, contact });
// Sway past its line at the top, head past its line toward the target at impact.
const faceOn = [reading("hips_top", -25), reading("head_impact", 15)];

test("a measured fault that fits the reported shot ranks first", () => {
  const measured = measureFaults(faceOn, "face_on", "7_iron");
  assert.deepEqual(measured.map((row) => row.fault.id), ["sway", "head_lunge"]);
  // A right-hander's shot starting right is a push: sway explains it and the thin contact.
  const ranked = rankFaults(measured, flight("right", "straight", "thin"), "right");
  assert.equal(ranked.primary?.id, "sway");
  assert.match(ranked.primary!.why, /thin contact and a start to the right/);
  assert.equal(ranked.primary!.time, 1.2);
  // The head movement explains none of this shot, so it is not offered.
  assert.equal(ranked.secondary, null);
  // For a left-hander the same start is a pull, which the head movement explains.
  assert.equal(rankFaults(measured, flight("right", "straight", "good"), "left").primary?.id, "head_lunge");
});

test("a curve no body fault explains goes to the clubface, not an invented body fault", () => {
  // Sway explains no curve. (The head lunge would explain a slice.)
  const measured = measureFaults([reading("hips_top", -25)], "face_on", "7_iron");
  const slice = rankFaults(measured, flight("straight", "fade_slice", "good"), "right");
  assert.equal(slice.primary?.id, "clubface");
  assert.equal(slice.primary!.measure, null);
  assert.match(slice.primary!.seen, /can't see the clubface/);
  assert.deepEqual(slice.primary!.drills.map((drill) => drill.id), ["swing_grip_stronger", "drill_split_hand_face"]);
  assert.equal(slice.secondary, null);
  // A body fault that explains the start and contact keeps first place; the hook it cannot explain follows as the face.
  const pushHook = rankFaults(measured, flight("right", "draw_hook", "thin"), "right");
  assert.deepEqual([pushHook.primary?.id, pushHook.secondary?.id], ["sway", "clubface"]);
  assert.equal(pushHook.secondary!.drills[0]!.id, "swing_grip_weaker");
  // With only the start line unexplained, the face is read against the target: a push is open.
  const pushOnly = rankFaults(measureFaults([reading("hips_impact", -5)], "face_on", "7_iron"), flight("right", "draw_hook", "good"), "right");
  assert.deepEqual([pushOnly.primary?.id, pushOnly.secondary?.id], ["hang_back", "clubface"]);
  assert.match(pushOnly.secondary!.why, /start line.*open to the target/);
  assert.equal(pushOnly.secondary!.drills[0]!.id, "swing_grip_stronger");
  // Nothing measured: unexplained contact gets the strike card, never a body fault.
  const fat = rankFaults([], flight("straight", "straight", "fat"), "right");
  assert.deepEqual([fat.primary?.id, fat.secondary], ["strike", null]);
  // A good, straight shot has nothing to fix, even with movement measured.
  assert.equal(rankFaults(measured, flight("straight", "straight", "good"), "right").primary, null);
});

test("readings count only in the fault's own unit, view and club range", () => {
  // Face on with a narrow stance falls back to body-height units, which the stance thresholds do not apply to.
  assert.deepEqual(measureFaults([reading("hips_top", -25, "% body height")], "face_on", "7_iron"), []);
  assert.deepEqual(measureFaults(faceOn, "down_the_line", "7_iron"), []);
  // Ball 25% toward the lead foot is fine for a 7 iron and too far forward for a wedge.
  assert.deepEqual(measureFaults([reading("ball_address", 25)], "face_on", "7_iron"), []);
  assert.equal(measureFaults([reading("ball_address", 25)], "face_on", "pw")[0]?.fault.id, "ball_forward");
  // Every value across an uncertain top must pass the line.
  assert.deepEqual(measureFaults([{ ...reading("hips_top", -25), range: [-30, -12] }], "face_on", "7_iron"), []);
  for (const fault of FAULTS) for (const id of fault.drills) assert.ok(SWING_DRILLS.has(id), id);
});

test("a measurement change is only called progress when the shot changed too", () => {
  const earlier = rankFaults(measureFaults(faceOn, "face_on", "7_iron"), flight("right", "straight", "thin"), "right").primary!;
  const now = [reading("hips_top", -10)];
  const progress = (latest: BallFlight | null) => faultProgress({ card: earlier, flight: flight("right", "straight", "thin"), date: "12 Oct" },
    { readings: now, flight: latest, club: "7_iron" }, "right")!;
  assert.match(progress(flight("straight", "straight", "good")), /back inside the check line.*real progress/);
  assert.match(progress(flight("right", "straight", "thin")), /not an improvement yet/);
  assert.match(progress(null), /before calling it progress/);
});

test("the shot answer is validated before it is stored", () => {
  assert.ok(ballFlightSchema.safeParse(flight("left", "draw_hook", "toe")).success);
  assert.equal(ballFlightSchema.safeParse({ start: "left", curve: "hook", contact: "toe" }).success, false);
  assert.equal(ballFlightSchema.safeParse({ ...flight("left", "straight", "good"), note: "x" }).success, false);
});
