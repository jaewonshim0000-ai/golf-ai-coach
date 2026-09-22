import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { LM, analysePose, findPhases, golfFrame, type Landmark, type PoseFrame } from "./pose";

/**
 * A golfer built to order.
 *
 * The world here is the one the maths has to discover for itself: +x toward
 * the target, +y up, +z toward the ball. Nothing in `pose.ts` is told that -
 * it works the frame out from the stance and the toes - so if it gets an axis
 * or a sign wrong, these numbers come back wrong rather than merely different.
 */

const INCH = 0.0254;

type Point = { x: number; y: number; z: number };

/** Rotate about vertical the way a right-hander turns going back. */
function turnBack(point: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(angle) - point.z * Math.sin(angle),
    y: point.y,
    z: point.x * Math.sin(angle) + point.z * Math.cos(angle),
  };
}

const move = (point: Point, by: Partial<Point>): Point => ({
  x: point.x + (by.x ?? 0),
  y: point.y + (by.y ?? 0),
  z: point.z + (by.z ?? 0),
});

type Pose = {
  /** Degrees the shoulders have turned from address, going back. */
  chestTurn?: number;
  pelvisTurn?: number;
  /** Hip centre movement from address, in metres. */
  hips?: Partial<Point>;
  nose?: Partial<Point>;
  /** Wrist height above the address hands, in metres. */
  hands?: number;
  /** Trail shoulder above lead shoulder, in degrees. */
  sideBend?: number;
};

/**
 * Address: 34 degrees of chest bend, 22 of pelvis bend, square to the target.
 * Every other pose is this one moved.
 */
function skeleton(pose: Pose = {}): PoseFrame["landmarks"] {
  const chestBend = 34;
  const spineUp = 0.5;
  const spineBall = spineUp * Math.tan((chestBend * Math.PI) / 180);

  const hipShift = pose.hips ?? {};
  const hipCentre = move({ x: 0, y: 0, z: 0 }, hipShift);

  const hipHalf = turnBack({ x: 0.1, y: 0, z: 0 }, pose.pelvisTurn ?? 0);
  const shoulderHalf = turnBack({ x: 0.2, y: 0, z: 0 }, pose.chestTurn ?? 0);
  const tilt = ((pose.sideBend ?? 0) * Math.PI) / 180;
  // Side bend drops the lead shoulder and lifts the trail one.
  const tiltUp = Math.sin(tilt) * 0.2;

  const shoulderCentre = move(hipCentre, { y: spineUp, z: spineBall });
  const handY = hipCentre.y - 0.05 + (pose.hands ?? 0);

  const landmarks: Point[] = new Array(33).fill(null).map(() => ({ x: 0, y: 0, z: 0 }));

  landmarks[LM.nose] = move({ x: 0, y: 0.75, z: 0.2 }, pose.nose ?? {});

  landmarks[LM.leftShoulder] = {
    x: shoulderCentre.x + shoulderHalf.x,
    y: shoulderCentre.y + shoulderHalf.y - tiltUp,
    z: shoulderCentre.z + shoulderHalf.z,
  };
  landmarks[LM.rightShoulder] = {
    x: shoulderCentre.x - shoulderHalf.x,
    y: shoulderCentre.y - shoulderHalf.y + tiltUp,
    z: shoulderCentre.z - shoulderHalf.z,
  };

  landmarks[LM.leftWrist] = { x: 0.05, y: handY, z: 0.45 };
  landmarks[LM.rightWrist] = { x: -0.05, y: handY, z: 0.45 };

  landmarks[LM.leftHip] = move(hipCentre, hipHalf);
  landmarks[LM.rightHip] = move(hipCentre, { x: -hipHalf.x, y: -hipHalf.y, z: -hipHalf.z });

  // Knees stay put: 22 degrees of pelvis bend at address.
  landmarks[LM.leftKnee] = { x: 0.15, y: -0.45, z: 0.18 };
  landmarks[LM.rightKnee] = { x: -0.15, y: -0.45, z: 0.18 };

  landmarks[LM.leftAnkle] = { x: 0.15, y: -0.9, z: 0 };
  landmarks[LM.rightAnkle] = { x: -0.15, y: -0.9, z: 0 };
  landmarks[LM.leftHeel] = { x: 0.15, y: -0.9, z: -0.05 };
  landmarks[LM.rightHeel] = { x: -0.15, y: -0.9, z: -0.05 };
  landmarks[LM.leftFootIndex] = { x: 0.15, y: -0.9, z: 0.2 };
  landmarks[LM.rightFootIndex] = { x: -0.15, y: -0.9, z: 0.2 };

  return landmarks.map((point) => ({ ...point, visibility: 0.9 }) as Landmark);
}

/** A whole swing: address, backswing, top, downswing, impact, finish. */
function swing(top: Pose = {}, impact: Pose = {}): PoseFrame[] {
  return [
    { t: 0, landmarks: skeleton() },
    { t: 0.3, landmarks: skeleton({ chestTurn: 45, pelvisTurn: 20, hands: 0.4 }) },
    { t: 0.8, landmarks: skeleton({ chestTurn: 90, pelvisTurn: 40, hands: 0.9, ...top }) },
    { t: 1.0, landmarks: skeleton({ chestTurn: 40, pelvisTurn: 10, hands: 0.4 }) },
    { t: 1.1, landmarks: skeleton({ chestTurn: -30, pelvisTurn: -40, hands: 0, ...impact }) },
    { t: 1.4, landmarks: skeleton({ chestTurn: -90, pelvisTurn: -70, hands: 0.8 }) },
  ];
}

function read(frames: PoseFrame[], metric: string): number | undefined {
  return analysePose(frames, "right")?.readings.find((row) => row.metric === metric)?.value;
}

const near = (actual: number | undefined, expected: number, tolerance = 1.5) => {
  assert.ok(actual !== undefined, `${expected} expected, nothing measured`);
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected about ${expected}, got ${actual}`,
  );
};

describe("the landmark map", () => {
  /*
    Checked against the detector's own skeleton in a browser: its
    POSE_CONNECTIONS joins 11-12 and 23-24 across the body, 11-23 and 12-24
    down each side, then 23-25-27-29-31 from hip to toe. Those edges only fit
    one reading of the indices, which is the one below. Pinned because a wrong
    index produces confident nonsense rather than an error.
  */
  it("matches the detector's published skeleton", () => {
    assert.deepEqual(
      { ...LM },
      {
        nose: 0,
        leftShoulder: 11,
        rightShoulder: 12,
        leftWrist: 15,
        rightWrist: 16,
        leftHip: 23,
        rightHip: 24,
        leftKnee: 25,
        rightKnee: 26,
        leftAnkle: 27,
        rightAnkle: 28,
        leftHeel: 29,
        rightHeel: 30,
        leftFootIndex: 31,
        rightFootIndex: 32,
      },
    );
  });
});

describe("the golf frame", () => {
  it("finds vertical, the target line and the ball from the stance alone", () => {
    const frame = golfFrame({ t: 0, landmarks: skeleton() }, "right");
    assert.ok(frame);
    near(frame!.up.y, 1, 0.01);
    near(frame!.target.x, 1, 0.01);
    near(frame!.ballward.z, 1, 0.01);
  });

  it("points the target line the other way for a left-hander", () => {
    const frame = golfFrame({ t: 0, landmarks: skeleton() }, "left");
    assert.ok(frame);
    near(frame!.target.x, -1, 0.01);
  });
});

describe("finding the three frames", () => {
  it("picks the top by chest rotation and impact by the hands coming back down", () => {
    const phases = findPhases(swing(), "right");
    assert.deepEqual(phases, { address: 0, top: 2, impact: 4 });
  });

  it("does not mistake the follow-through for impact", () => {
    // The finish passes back through address height going the other way.
    const frames = swing();
    const phases = findPhases(frames, "right");
    assert.ok(phases!.impact < frames.length - 1);
  });

  it("refuses a clip too short to hold a swing", () => {
    assert.equal(findPhases([{ t: 0, landmarks: skeleton() }], "right"), null);
  });
});

describe("reading the positions", () => {
  it("measures the bends at address", () => {
    const frames = swing();
    near(read(frames, "chest_bend_address"), 34);
    near(read(frames, "pelvis_bend_address"), 22);
  });

  it("measures turn at the top, positive away from the target", () => {
    const frames = swing();
    near(read(frames, "chest_turn_top"), 90);
    near(read(frames, "pelvis_turn_top"), 40);
  });

  it("measures turn at impact, positive open to the target", () => {
    const frames = swing();
    near(read(frames, "pelvis_turn_impact"), 40);
    near(read(frames, "chest_turn_impact"), 30);
  });

  it("calls a pelvis sliding away from the target a positive sway at the top", () => {
    const frames = swing({ hips: { x: -2 * INCH } });
    near(read(frames, "pelvis_sway_top"), 2, 0.3);
  });

  it("calls a pelvis moving toward the target a positive sway at impact", () => {
    const frames = swing({}, { hips: { x: 3 * INCH } });
    near(read(frames, "pelvis_sway_impact"), 3, 0.3);
  });

  it("reads lift at the top and thrust at impact on their own axes", () => {
    const frames = swing({ hips: { y: 1.5 * INCH } }, { hips: { z: -2 * INCH } });
    near(read(frames, "pelvis_lift_top"), 1.5, 0.3);
    near(read(frames, "pelvis_thrust_impact"), -2, 0.3);
  });

  it("reads head sway against the target line", () => {
    const frames = swing({}, { nose: { x: -1.5 * INCH } });
    near(read(frames, "head_sway_impact"), -1.5, 0.3);
  });

  it("reads chest side bend as a tilt out of level", () => {
    const frames = swing({ sideBend: 12 });
    near(read(frames, "chest_side_bend_top"), 12, 2);
  });

  it("gives a left-hander the same numbers for the mirrored swing", () => {
    const mirrored = swing().map((frame) => ({
      ...frame,
      landmarks: frame.landmarks.map((point) => ({ ...point, x: -point.x })),
    }));
    const analysis = analysePose(mirrored, "left");
    const turn = analysis?.readings.find((row) => row.metric === "chest_turn_top")?.value;
    near(turn, 90);
  });

  it("skips a position whose landmarks the detector could not see", () => {
    const frames = swing();
    const impact = frames[4]!;
    impact.landmarks = impact.landmarks.map((point, index) =>
      index === LM.nose ? { ...point, visibility: 0.1 } : point,
    );
    const analysis = analysePose(frames, "right");
    assert.ok(analysis!.skipped.includes("head_sway_impact"));
    assert.equal(
      analysis!.readings.some((row) => row.metric === "head_sway_impact"),
      false,
    );
  });
});
