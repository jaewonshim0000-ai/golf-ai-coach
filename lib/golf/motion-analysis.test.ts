import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyseMotion, describeMotionReading, findAutomaticTiming, findMotionPhases, frameAtTime, motionCriteria, overlayFrameAtTime, trustworthyFrames, visibleHands } from "./motion-analysis";
import { LM, packFrames, unpackFrames, type PoseFrame } from "./pose";
import { poseModelSchema } from "../validation/schemas";
import { scoreSwing } from "./swing-score";
import { scoreReconstruction } from "./reconstruction-score";
import { faceOnSwing } from "./__fixtures__/face-on";
import { getSwingFocus } from "./swing-focus";

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

  it("recovers a complete swing after brief wrist loss during takeaway and keeps rhythm uncertainty", () => {
    for (const view of ["face_on", "down_the_line"] as const) {
      const frames = Array.from({ length: 65 }, (_, index) => {
        const frame = structuredClone(swing()[0]!);
        frame.t = index * 0.04;
        const y = frame.t <= 0.2 ? 0.66 : frame.t <= 1.6 ? 0.66 - (frame.t - 0.2) / 1.4 * 0.41 :
          frame.t <= 2 ? 0.25 + (frame.t - 1.6) / 0.4 * 0.41 : 0.66 - (frame.t - 2) * 0.75;
        for (const joint of [15, 16]) frame.imageLandmarks![joint]!.y = y;
        return frame;
      });
      for (const index of [20, 21, 22]) for (const joint of [15, 16]) frames[index]!.imageLandmarks![joint]!.visibility = 0.1;
      const original = structuredClone(frames);
      const report = analyseMotion(frames, 1, view);
      assert.equal(report.phases?.top, 40);
      assert.equal(report.phases?.impact, 50);
      assert.ok(Math.abs(frames[report.phases!.address]!.t - 0.2) <= 0.121);
      assert.equal(report.usable, true);
      assert.ok(report.timing!.uncertainty >= 0.15);
      assert.equal(report.tempo, null);
      assert.deepEqual(analyseMotion(unpackFrames(packFrames(frames)), 1, view), report);
      const model = { v: 1 as const, motionVersion: 1 as const, reconstructionVersion: 1 as const,
        handedness: "right" as const, cameraAngle: view, aspect: 1, ballSide: "right" as const,
        phases: report.phases!, timingStatus: "unresolved" as const, ...packFrames(frames) };
      assert.equal(scoreReconstruction(model, report).total, 100);
      assert.deepEqual(frames, original);
      for (const index of [20, 21, 22]) frames[index]!.imageLandmarks![LM.leftShoulder]!.visibility = 0.1;
      assert.equal(findAutomaticTiming(frames, 1, "face_on"), null);
    }
  });

  it("judges body coverage within the swing instead of idle footage and the finish", () => {
    const frames = swing();
    for (const frame of [frames[0]!, ...frames.slice(9)]) for (const joint of [11, 12, 23, 24]) frame.imageLandmarks![joint]!.visibility = 0.1;
    const report = analyseMotion(frames, 1, "face_on", "right", phases);
    assert.equal(report.usable, true);
    assert.equal(report.quality.coverage, 1);
    assert.equal(report.quality.visible, 8);
    assert.equal(report.quality.total, 8);
    assert.equal(scoreSwing(report).total !== null, true);
    for (const frame of frames.slice(3, 7)) frame.imageLandmarks![11]!.visibility = 0.1;
    assert.equal(analyseMotion(frames, 1, "face_on", "right", phases).usable, false);
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

  it("rejects an isolated wrist spike without losing its correctly tracked partner or changing source samples", () => {
    const frames = swing();
    frames[5]!.imageLandmarks![15]!.x = 0.95;
    const original = structuredClone(frames);
    const clean = trustworthyFrames(frames, 1, "face_on");
    assert.equal(clean[5]!.imageLandmarks![15]!.visibility, 0);
    assert.equal(clean[5]!.imageLandmarks![16]!.visibility, 0.95);
    assert.equal(visibleHands(frames[5]!), null);
    assert.deepEqual(findMotionPhases(clean), phases);
    assert.equal(analyseMotion(frames, 1, "face_on").readings.some((row) => row.id === "arm_top"), false);
    assert.deepEqual(frames, original);
  });

  it("accepts a normal trail-foot pivot but withholds displacement during pan or zoom", () => {
    const frames = swing();
    for (const frame of frames.slice(6)) {
      frame.imageLandmarks![28]!.x += 0.1;
      frame.imageLandmarks![28]!.y -= 0.07;
    }
    for (const view of ["face_on", "down_the_line"] as const) {
      const report = analyseMotion(frames, 1, view, "right", phases);
      assert.equal(report.quality.cameraStable, true);
      assert.ok(report.readings.some((row) => row.id === "hips_impact"));
    }
    const zoomed = swing().map((frame, index) => ({ ...frame, imageLandmarks: frame.imageLandmarks!.map((point) => ({
      ...point, x: 0.5 + (point.x - 0.5) * (1 + index * 0.04), y: 0.5 + (point.y - 0.5) * (1 + index * 0.04),
    })) }));
    assert.equal(analyseMotion(zoomed, 1, "down_the_line", "right", phases).quality.cameraStable, false);
  });

  it("uses planted ankles rather than knee visibility or changing projected shin length", () => {
    const frames = swing().flatMap((frame) => [0, 0.013, 0.026].map((offset) => ({ ...structuredClone(frame), t: frame.t + offset })));
    const marked = { address: 3, top: 15, impact: 24 };
    for (const frame of frames.slice(9, 16)) for (const joint of [25, 26]) frame.imageLandmarks![joint]!.visibility = 0.1;
    assert.equal(analyseMotion(frames, 1, "face_on", "right", marked).quality.cameraStable, true);
    for (const frame of frames) for (const joint of [25, 26]) frame.imageLandmarks![joint]!.visibility = 0.1;
    assert.equal(analyseMotion(frames, 1, "face_on", "right", marked).quality.cameraStable, true);
    for (const frame of frames) for (const joint of [25, 26]) {
      frame.imageLandmarks![joint]!.visibility = 0.95;
      frame.imageLandmarks![joint]!.y += Math.sin(frame.t * Math.PI) * 0.2;
    }
    const report = analyseMotion(frames, 1, "face_on", "right", marked);
    assert.equal(report.quality.cameraStable, true);
    assert.equal(report.readings.find((reading) => reading.id === "hips_impact")?.value, 10);
  });

  it("renders between adjacent clear video samples without revealing hidden joints or spanning tracking gaps", () => {
    const frames = swing();
    const original = structuredClone(frames);
    const midway = overlayFrameAtTime(frames, 0.1)!;
    assert.equal(midway.t, 0.1);
    assert.ok(Math.abs(midway.imageLandmarks![15]!.y - 0.54) < 1e-10);
    assert.deepEqual(frames, original);
    frames[3]!.imageLandmarks![15]!.visibility = 0.1;
    assert.equal(overlayFrameAtTime(frames, 0.1)!.imageLandmarks![15]!.visibility, 0);
    assert.equal(overlayFrameAtTime([frames[0]!, frames[3]!], 0.06), null);
    assert.equal(overlayFrameAtTime(frames, -0.03), null);
    assert.equal(overlayFrameAtTime(frames, NaN), null);
    assert.equal(overlayFrameAtTime(frames, 0.12), frames[3]);
  });

  it("withholds timing ratios when the impact interval is undersampled", () => {
    const sparse = swing().map((frame, index) => ({ ...frame, t: index * 0.2 }));
    assert.equal(analyseMotion(sparse, 1, "face_on", "right", phases).tempo, null);
  });

  it("carries automatic contact brackets into body readings and lets confirmed timing resolve a borderline correction", () => {
    const frames = faceOnSwing();
    for (const frame of frames.slice(43)) frame.imageLandmarks![LM.nose]!.x = Math.min(0.65, 0.56 + (frame.t - 1.72) * 0.75);
    const original = structuredClone(frames);
    const automatic = analyseMotion(frames, 1, "face_on");
    assert.deepEqual(automatic.timing?.impactWindow, [43, 45]);
    assert.deepEqual(automatic.readings.find((row) => row.id === "head_impact")?.range, [12.5, 25]);
    assert.match(describeMotionReading(automatic.readings.find((row) => row.id === "head_impact")!, automatic), /contact interval/);
    assert.equal(getSwingFocus(automatic).status, "needs_input");
    assert.match(getSwingFocus(automatic).issue, /head position around contact/);
    const confirmed = analyseMotion(frames, 1, "face_on", "right", automatic.phases);
    assert.equal(confirmed.timing?.source, "marked");
    assert.equal(confirmed.readings.find((row) => row.id === "head_impact")?.range, undefined);
    assert.equal(getSwingFocus(confirmed).id, "head");
    // A hidden bracketing head cannot silently narrow the possible movement.
    frames[43]!.imageLandmarks![LM.nose]!.visibility = 0.1;
    assert.equal(analyseMotion(frames, 1, "face_on").readings.some((row) => row.id === "head_impact"), false);
    frames[43]!.imageLandmarks![LM.nose]!.visibility = 0.95;
    assert.deepEqual(frames, original);
  });

  it("withholds displacement at contact when a brief camera movement passes the global percentile", () => {
    for (const view of ["face_on", "down_the_line"] as const) {
      const frames = faceOnSwing();
      for (const point of frames[44]!.imageLandmarks!) point.x += 0.045;
      const report = analyseMotion(frames, 1, view, "right", { address: 8, top: 36, impact: 44 });
      assert.equal(report.quality.cameraStable, true); // rest of the clip is steady
      assert.equal(report.readings.some((row) => row.id === "head_impact" || row.id === "hips_impact" || row.id === "lift_impact"), false);
      assert.ok(report.readings.some((row) => row.id === "torso_impact"));
      assert.ok(report.readings.some((row) => row.id === "hips_top"));
      assert.match(report.warnings.join(" "), /at a measured position/);
    }
  });

  it("propagates event intervals into rhythm bounds and narrows them with denser observed samples", () => {
    const coarse = faceOnSwing();
    const report = analyseMotion(coarse, 1, "face_on");
    assert.ok(report.tempo?.ratioRange);
    const [low, high] = report.tempo.ratioRange;
    assert.ok(low < report.tempo.ratio && high > report.tempo.ratio);
    const dense = coarse.flatMap((frame, index) => {
      const next = coarse[index + 1];
      return next ? [frame, { ...frame, t: (frame.t + next.t) / 2, imageLandmarks: frame.imageLandmarks!.map((point, joint) => ({ ...point,
        x: (point.x + next.imageLandmarks![joint]!.x) / 2, y: (point.y + next.imageLandmarks![joint]!.y) / 2,
      })) }] : [frame];
    });
    const refined = analyseMotion(dense, 1, "face_on");
    assert.ok(refined.tempo?.ratioRange);
    assert.ok(refined.tempo.ratioRange[1] - refined.tempo.ratioRange[0] < high - low);
    // A normal nominal rhythm with broad sampling bounds needs no correction.
    assert.equal(getSwingFocus(report).status, "clear");
    const slowed = analyseMotion(coarse.map((frame) => ({ ...frame, t: frame.t * 2 + 7 })), 1, "face_on");
    assert.ok(slowed.tempo?.ratioRange);
    assert.ok(Math.abs(slowed.tempo.ratioRange[0] - low) < 1e-10);
    assert.ok(Math.abs(slowed.tempo.ratioRange[1] - high) < 1e-10);
  });

  it("detects the same smooth hand arc across frame rates and slow-motion exports", () => {
    const source = faceOnSwing();
    for (const rate of [24, 30, 60, 120, 240]) {
      const frames = Array.from({ length: Math.floor(2.4 * rate) + 1 }, (_, index): PoseFrame => {
        const t = index / rate;
        const frame = structuredClone(source[0]!);
        frame.t = t;
        const handY = t <= 0.24 ? 0.66 : t <= 1.44 ? 0.66 - (t - 0.24) / 1.2 * 0.41 :
          t <= 1.76 ? 0.25 + (t - 1.44) / 0.32 * 0.41 : Math.max(0.12, 0.66 - (t - 1.76) * 0.8);
        for (const joint of [LM.leftWrist, LM.rightWrist]) frame.imageLandmarks![joint]!.y = handY;
        return frame;
      });
      for (const speed of [1, 4]) for (const view of ["face_on", "down_the_line"] as const) {
        const recording = frames.map((frame) => ({ ...frame, t: frame.t * speed }));
        const found = findMotionPhases(recording, 1, view);
        if (rate / speed < 10) {
          assert.equal(found, null); // stretching timestamps cannot invent missing frames
          continue;
        }
        assert.ok(found, `${rate}fps, ${speed}x duration, ${view}`);
        assert.ok(Math.abs(recording[found.top]!.t / speed - 1.44) <= 1 / rate);
        assert.ok(Math.abs(recording[found.impact]!.t / speed - 1.76) <= 1 / rate);
      }
    }
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
