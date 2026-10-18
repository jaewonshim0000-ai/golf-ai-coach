import { frameAtTime, visiblePoint, type MotionReading } from "./motion-analysis";
import { LM, unpackFrames, type PoseModel, type SetupMarks } from "./pose";

const rounded = (value: number) => Math.round(value * 10) / 10;

/** Shaft line from horizontal in the picture, 0–90°. `aspect` restores the
 * true picture shape, since marks are fractions of width and height. */
export function shaftAngle(marks: Pick<SetupMarks, "grip" | "clubhead">, aspect: number): number {
  return Math.atan2(Math.abs(marks.clubhead[1] - marks.grip[1]), Math.abs(marks.grip[0] - marks.clubhead[0]) * aspect) * 180 / Math.PI;
}

/** Clubhead through the hands and on past them; the picture edge clips it. */
export function planeLine(marks: Pick<SetupMarks, "grip" | "clubhead">) {
  const [x, y] = marks.clubhead;
  return { x1: x, y1: y, x2: x + (marks.grip[0] - x) * 4, y2: y + (marks.grip[1] - y) * 4 };
}

/** Club readings from the player's marks. Picture geometry only: camera
 * height and position change every value, and none is a technique standard. */
export function setupReadings(model: PoseModel): MotionReading[] {
  const marks = model.setup, aspect = model.aspect ?? 0;
  if (!marks || !(aspect > 0)) return [];
  const view = model.cameraAngle ?? "other";
  const frame = frameAtTime(unpackFrames(model), marks.t);
  const left = frame?.imageLandmarks?.[LM.leftAnkle], right = frame?.imageLandmarks?.[LM.rightAnkle];
  const feet = visiblePoint(left) && visiblePoint(right) ? { left: left.x * aspect, right: right.x * aspect } : null;
  // Face on, the lead foot's side of the picture is the target side.
  const toLead = feet ? Math.sign(model.handedness === "right" ? feet.left - feet.right : feet.right - feet.left) : 0;
  const angle = rounded(shaftAngle(marks, aspect));
  const reading = (id: string, label: string, value: number, unit: MotionReading["unit"], note: string): MotionReading =>
    ({ id, label, phase: "address", value, unit, note, time: marks.t });
  const lean = rounded(90 - angle), leanSide = Math.sign((marks.grip[0] - marks.clubhead[0]) * toLead);
  const readings = [reading("shaft_address", "Shaft angle at setup", angle, "° in picture", view === "down_the_line"
    ? `The line from your marked clubhead through your hands rises ${angle}° from horizontal in this picture. The blue plane line on the replay extends it. Camera height and position change this angle, so compare recordings filmed from the same spot.`
    : view === "face_on"
      ? `The line from your marked clubhead to your hands rises ${angle}° from horizontal in this picture${toLead && lean > 0 && leanSide ? `, leaning ${lean}° from vertical with the hands toward the ${leanSide > 0 ? "lead" : "trail"} foot` : ""}. Camera height and position change this angle.`
      : `The line from your marked clubhead to your hands rises ${angle}° from horizontal in this picture. This camera angle has no standard setup comparison.`)];
  if (view === "face_on" && marks.ball && feet && toLead && Math.abs(feet.left - feet.right) >= 0.03) {
    const stance = Math.abs(feet.left - feet.right), middle = (feet.left + feet.right) / 2;
    const value = rounded((marks.ball[0] * aspect - middle) * toLead / stance * 100);
    readings.push(reading("ball_address", "Ball position", value, "% stance", value === 0
      ? "The marked ball sits at the midpoint between your ankles in this picture. Foot flare and camera angle shift this reading."
      : `The marked ball sits ${Math.abs(value)}% of stance width toward the ${value > 0 ? "lead" : "trail"} foot from the midpoint between your ankles in this picture. Foot flare and camera angle shift this reading.`));
  }
  return readings;
}
