import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyseMotion, describeMotionReading, findAutomaticTiming, findMotionPhases, frameAtTime, motionCriteria, trustworthyFrames } from "./motion-analysis";
import { LM, packFrames, unpackFrames, type PoseFrame } from "./pose";
import { poseModelSchema } from "../validation/schemas";
import { scoreSwing } from "./swing-score";

// Known positions in the image; the depth values deliberately have no meaning.
function swing(): PoseFrame[] {
  const handYs = [0.66, 0.66, 0.6, 0.48, 0.3, 0.25, 0.28, 0.44, 0.65, 0.58, 0.38, 0.2];
  return handYs.map((handY, index) => {
    const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 }));
    points[LM.nose] = { x: 0.5, y: 0.2, z: 0, visibility: 0.95 };
    points[11] = { x: 0.4, y: 0.35, z: 0, visibility: 0.95 };
    points[12] = { x: 0.6, y: 0.35, z: 0, visibility: 0.95 };
    points[23] = { x: 0.45 + (index > 5 ? 0.04 : 0), y: 0.6, z: 0, visibility: 0.95 };
    points[24] = { x: 0.55 + (index > 5 ? 0.04 : 0), y: 0.6, z: 0, visibility: 0.95 };
    points[27] = { x: 0.7, y: 0.9, z: 0, visibility: 0.95 };
    points[28] = { x: 0.3, y: 0.9, z: 0, visibility: 0.95 };
    points[13] = { x: 0.4, y: 0.5, z: 0, visibility: 0.95 };
    points[14] = { x: 0.6, y: 0.5, z: 0, visibility: 0.95 };
    points[15] = { x: 0.48, y: handY, z: 0, visibility: 0.95 };
    points[16] = { x: 0.52, y: handY, z: 0, visibility: 0.95 };
    return { t: index * 0.04, landmarks: points.map((point) => ({ ...point, z: index * 0.7 })), imageLandmarks: points };
  });
}
const phases = { address: 1, top: 5, impact: 8 };

describe("projected swing movement", () => {
  it("finds a complete hand arc without confusing the higher finish for top", () => {
    assert.deepEqual(findMotionPhases(swing(), 9 / 16), phases);
    assert.equal(findMotionPhases(swing().slice(0, 8), 9 / 16), null);
    assert.equal(findMotionPhases(swing().map((frame) => ({ ...frame, imageLandmarks: frame.imageLandmarks?.map((point, index) => index === 15 || index === 16 ? { ...point, y: 0.65 } : point) })), 1), null);
  });

  it("analyzes the criteria appropriate to the selected camera view", () => {
    for (const view of ["face_on", "down_the_line", "other"] as const) {
      const report = analyseMotion(swing(), 9 / 16, view);
      const criteria = motionCriteria(view);
      const expected = view === "down_the_line" ? 9 : 12;
      assert.equal(criteria.length, expected);
      assert.equal(new Set(criteria.map((row) => row.id)).size, expected);
      assert.deepEqual(report.phases, phases);
      assert.equal(report.timing?.source, "hands");
      assert.equal(criteria.filter((criterion) => report.readings.some((reading) => reading.id === criterion.id)).length, expected);
      assert.ok(report.readings.every((reading) => describeMotionReading(reading, report).length > 20));
      assert.equal(report.readings.find((reading) => reading.id === "shoulders_address")?.value, view === "down_the_line" ? undefined : 0);
      if (view !== "face_on") assert.equal(report.readings.find((reading) => reading.id === "head_impact")?.unit, "% body height");
    }
  });

  it("tracks a down-the-line clip with only one visible body side without drawing hidden joints", () => {
    const frames = swing();
    for (const frame of frames) for (const joint of [12, 14, 16, 24, 26, 28]) frame.imageLandmarks![joint]!.visibility = 0.1;
    const before = structuredClone(frames);
    const report = analyseMotion(frames, 9 / 16, "down_the_line");
    assert.deepEqual(report.phases, phases);
    assert.equal(report.usable, true);
    assert.equal(report.quality.coverage, 1);
    assert.equal(report.quality.cameraStable, true);
    assert.equal(motionCriteria("down_the_line").filter((row) => report.readings.some((reading) => reading.id === row.id)).length, 9);
    assert.equal(report.readings.some((reading) => reading.id.startsWith("shoulders_")), false);
    assert.equal(analyseMotion(frames, 9 / 16, "face_on").usable, false);
    assert.deepEqual(frames, before);
  });

  it("does not silently switch body sides or head landmarks across profile occlusions", () => {
    const frames = swing();
    for (const frame of frames) for (const joint of [12, 24, 28]) frame.imageLandmarks![joint]!.visibility = 0.1;
    frames[8]!.imageLandmarks![23]!.visibility = 0.1;
    const report = analyseMotion(frames, 1, "down_the_line", "right", phases);
    assert.equal(report.readings.some((row) => row.id === "hips_impact"), false);
    assert.equal(report.readings.some((row) => row.id === "torso_impact"), false);
    for (const frame of frames) frame.imageLandmarks![0]!.visibility = 0.1;
    assert.equal(analyseMotion(frames, 1, "down_the_line", "right", phases).readings.some((row) => row.id === "head_impact"), true);
  });

  it("brackets a short hidden transition and measures visible body ranges without inventing a wrist", () => {
    const hidden = swing();
    for (const index of [4, 5, 6]) for (const joint of [15, 16]) hidden[index]!.imageLandmarks![joint]!.visibility = 0.1;
    const before = structuredClone(hidden);
    const detected = findAutomaticTiming(hidden, 1);
    assert.deepEqual(detected?.phases, phases);
    assert.equal(detected?.timing.source, "occluded_transition");
    assert.deepEqual(detected?.timing.topWindow, [3, 7]);
    const report = analyseMotion(hidden, 1, "face_on");
    assert.equal(motionCriteria("face_on").filter((row) => report.readings.some((reading) => reading.id === row.id)).length, 12);
    assert.deepEqual(report.readings.find((row) => row.id === "hips_top")?.range, [0, 10]);
    assert.ok(!report.readings.some((row) => row.id === "arm_top"));
    assert.equal(report.tempo, null);
    const score = scoreSwing(report);
    assert.equal(score.total, 100);
    assert.deepEqual(score.totalRange, [100, 100]);
    assert.deepEqual(score.components.map((component) => component.id), ["head", "height"]);
    assert.equal(score.missing.length, 1);
    // Existing saved joint samples receive the fix on reload, without a new read.
    assert.deepEqual(scoreSwing(analyseMotion(unpackFrames(packFrames(hidden)), 1, "face_on")), score);
    assert.deepEqual(hidden, before);
  });

  it("rejects an unbounded occlusion, missing body evidence and a clip cut before follow-through", () => {
    const hidden = swing();
    for (const index of [4, 5, 6]) for (const joint of [15, 16]) hidden[index]!.imageLandmarks![joint]!.visibility = 0.1;
    assert.equal(findAutomaticTiming(hidden.map((frame) => ({ ...frame, t: frame.t * 3 })), 1), null);
    assert.equal(findAutomaticTiming(hidden.slice(0, 9), 1), null);
    hidden[5]!.imageLandmarks![LM.leftShoulder]!.visibility = 0.1;
    assert.equal(findAutomaticTiming(hidden, 1), null);
  });

  it("handles quantized 100ms sample gaps without treating rounding as missing body evidence", () => {
    const frames = swing().map((frame, index) => ({ ...frame, t: 10 + index * 0.1 + (index % 2 ? 0.000001 : 0) }));
    for (const index of [4, 5]) for (const joint of [15, 16]) frames[index]!.imageLandmarks![joint]!.visibility = 0.1;
    const report = analyseMotion(frames, 1, "face_on");
    assert.equal(report.timing?.source, "occluded_transition");
    assert.equal(report.readings.filter((reading) => motionCriteria("face_on").some((criterion) => criterion.id === reading.id)).length, 12);
    assert.equal(report.tempo, null);
  });

  it("computes movement in stance width from x/y and ignores arbitrary inferred depth", () => {
    const frames = swing();
    const report = analyseMotion(frames, 9 / 16, "face_on", "right", phases);
    assert.equal(report.usable, true);
    assert.equal(report.quality.cameraStable, true);
    assert.equal(report.readings.find((row) => row.id === "hips_impact")!.value, 10);
    const otherDepth = frames.map((frame) => ({ ...frame, landmarks: frame.landmarks.map((point) => ({ ...point, x: 50, y: 100, z: -500 })) }));
    assert.deepEqual(analyseMotion(otherDepth, 9 / 16, "face_on", "right", phases), report);
    assert.ok(report.readings.every((row) => !row.id.includes("turn") && row.unit !== ("in" as string)));
  });

  it("locates address before a sideways/downward takeaway rather than at its later low point", () => {
    const frames = swing();
    for (const index of [2, 3]) {
      for (const joint of [15, 16]) {
        frames[index]!.imageLandmarks![joint]!.x += index === 2 ? 0.1 : 0.2;
        frames[index]!.imageLandmarks![joint]!.y = index === 2 ? 0.68 : 0.66;
      }
    }
    assert.deepEqual(findMotionPhases(frames, 9 / 16), phases);
  });

  it("does not replace explicitly unresolved stored timing with new automatic guesses", () => {
    const report = analyseMotion(swing(), 1, "face_on", "right", null);
    assert.equal(report.phases, null);
    assert.equal(report.usable, false);
    assert.equal(report.readings.length, 0);
  });

  it("does not guess the peak behind an occluded hand or stop at a small backswing reversal", () => {
    const hidden = swing();
    for (const index of [4, 5, 6]) for (const joint of [15, 16]) hidden[index]!.imageLandmarks![joint]!.visibility = 0.1;
    assert.equal(findMotionPhases(hidden, 1), null);
    const marked = analyseMotion(hidden, 1, "face_on", "right", phases);
    assert.ok(marked.tempo);
    assert.ok(!marked.readings.some((row) => row.id === "arm_top"));
    assert.ok(marked.warnings.some((warning) => warning.includes("hands are hidden")));
    const ys = [0.66, 0.66, 0.5, 0.4, 0.46, 0.3, 0.25, 0.4, 0.65, 0.55, 0.3, 0.2];
    const reversal = swing().map((frame, index) => ({ ...frame, imageLandmarks: frame.imageLandmarks!.map((point, joint) => joint === 15 || joint === 16 ? { ...point, y: ys[index]! } : point) }));
    assert.deepEqual(findMotionPhases(reversal, 1), { address: 1, top: 6, impact: 8 });
  });

  it("corrects pixel aspect and keeps a mirrored left-handed shift's sign", () => {
    const report = analyseMotion(swing(), 9 / 16, "face_on", "right", phases);
    const mirrored = swing().map((frame) => ({ ...frame, imageLandmarks: frame.imageLandmarks?.map((_, index, points) => {
      const twin = index >= 11 && index <= 32 ? index + (index % 2 ? 1 : -1) : index;
      return { ...points[twin]!, x: 1 - points[twin]!.x };
    }) }));
    assert.equal(analyseMotion(mirrored, 9 / 16, "face_on", "left", phases).readings.find((row) => row.id === "hips_impact")!.value, 10);
    assert.ok(report.tempo);
    assert.equal(report.tempo!.ratio, 1.3);
  });

  it("withholds displacement when the camera pans and never converts visibility into accuracy", () => {
    const panning = swing().map((frame, index) => ({ ...frame, imageLandmarks: frame.imageLandmarks?.map((point) => ({ ...point, x: point.x + index * 0.02 })) }));
    const report = analyseMotion(panning, 1, "face_on", "right", phases);
    assert.equal(report.quality.cameraStable, false);
    assert.ok(report.warnings.some((warning) => warning.includes("camera moved")));
    assert.ok(!report.readings.some((row) => row.unit !== "° in picture"));
  });

  it("omits a hidden required joint even if the rest of the body is visible", () => {
    const frames = swing();
    frames[phases.top]!.imageLandmarks![13]!.visibility = 0.1;
    const report = analyseMotion(frames, 1, "face_on", "right", phases);
    assert.ok(!report.readings.some((row) => row.id === "arm_top"));
    const hidden = frames.map((frame) => ({ ...frame, imageLandmarks: frame.imageLandmarks?.map((point) => ({ ...point, visibility: 0.1 })) }));
    assert.equal(analyseMotion(hidden, 1, "face_on").usable, false);
  });

  it("follows the visible hand when the other wrist is hidden by the grip or body", () => {
    const frames = swing().map((frame) => ({ ...frame, imageLandmarks: frame.imageLandmarks!.map((point, index) => index === LM.leftWrist ? { ...point, visibility: 0.1 } : point) }));
    assert.deepEqual(findMotionPhases(frames, 9 / 16), phases);
  });

  it("rejects isolated body jumps and does not paint across missing video samples", () => {
    const frames = swing();
    frames[4]!.imageLandmarks = frames[4]!.imageLandmarks!.map((point) => ({ ...point, x: point.x + 0.4 }));
    assert.equal(trustworthyFrames(frames, 1)[4]!.imageLandmarks![23]!.visibility, 0);
    assert.equal(frameAtTime([swing()[0]!, swing().at(-1)!], 0.2), null);
    assert.equal(frameAtTime(swing(), -1), null);
    assert.equal(frameAtTime(swing(), 0.201)?.t, 0.2);
  });

  it("withholds timing ratios when the impact interval is undersampled", () => {
    const sparse = swing().map((frame, index) => ({ ...frame, t: index * 0.2 }));
    assert.equal(analyseMotion(sparse, 1, "face_on", "right", phases).tempo, null);
  });

  it("retains fine image coordinates in storage and rejects out-of-order sample times", () => {
    const frames = swing();
    frames[0]!.imageLandmarks![11]!.x = 0.41234;
    frames[0]!.t = 0.033333;
    assert.equal(packFrames(frames).t[0], 0.033333);
    assert.equal(unpackFrames(packFrames(frames))[0]!.imageLandmarks![11]!.x, 0.41234);
    const packed = packFrames(swing());
    assert.equal(poseModelSchema.safeParse({ swing_session_id: "s1", ...packed, aspect: 1 }).success, false); // arbitrary world depth exceeds storage envelope
    const bounded = packFrames(swing().map((frame) => ({ ...frame, landmarks: frame.imageLandmarks! })));
    assert.equal(poseModelSchema.safeParse({ swing_session_id: "s1", ...bounded, aspect: 1 }).success, true);
    assert.equal(poseModelSchema.safeParse({ swing_session_id: "s1", ...bounded, t: [...bounded.t].reverse() }).success, false);
  });
});
