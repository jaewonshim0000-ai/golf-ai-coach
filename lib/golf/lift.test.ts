import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { liftFrames } from "./lift";
import { analysePose, findImagePhases, type PoseFrame } from "./pose";
import { ASPECT, DOWN_THE_LINE, FACE_ON, MAIN_LENS, PHASES, film, zoomed } from "./swing.fixture";

/**
 * Does the rebuilt body read the numbers the golfer was built with? The
 * golfer and the phone that films it are in swing.fixture.ts.
 */

const TURNS = ["chest_turn_top", "pelvis_turn_top", "chest_turn_impact", "pelvis_turn_impact"];

function read(frames: PoseFrame[], translations: boolean) {
  const analysis = analysePose(frames, "right", PHASES, { translations });
  assert.ok(analysis, "the swing should analyse");
  return {
    value: (metric: string) => analysis.readings.find((row) => row.metric === metric)?.value,
    skipped: analysis.skipped,
  };
}

function meanError(a: ReturnType<typeof read>, b: ReturnType<typeof read>, metrics: string[]) {
  const errors = metrics.map((metric) => {
    const x = a.value(metric);
    const y = b.value(metric);
    return x === undefined || y === undefined ? 90 : Math.abs(x - y);
  });
  return errors.reduce((sum, e) => sum + e, 0) / errors.length;
}

const BENDS = ["chest_bend_address", "pelvis_bend_address"];

/**
 * How close each view gets, across several takes. Down the line the turns
 * are well conditioned throughout; face on they are at the top, but at
 * impact the shoulder and hip lines sit 30-40 degrees out of the picture,
 * where neither the geometry nor the detector's depth pins them down, and
 * the limit is looser. That is a property of one camera, not a bug.
 */
const VIEWS = [
  {
    name: "face on",
    camera: FACE_ON,
    turnLimit: { chest_turn_top: 9, pelvis_turn_top: 9, chest_turn_impact: 18, pelvis_turn_impact: 18 } as Record<string, number>,
    inPicture: ["pelvis_sway_top", "pelvis_sway_impact", "head_sway_impact", "pelvis_lift_top"],
    outOfPicture: ["pelvis_thrust_impact"],
  },
  {
    name: "down the line",
    camera: DOWN_THE_LINE,
    turnLimit: { chest_turn_top: 7, pelvis_turn_top: 7, chest_turn_impact: 7, pelvis_turn_impact: 7 } as Record<string, number>,
    inPicture: ["pelvis_thrust_impact", "pelvis_lift_top"],
    outOfPicture: ["pelvis_sway_top", "pelvis_sway_impact"],
  },
];
const TAKES = [7, 8, 9];

for (const view of VIEWS) {
  describe(`rebuilding a swing filmed ${view.name}`, () => {
    const takes = TAKES.map((seed) => {
      const { truth, detected } = film(view.camera, seed);
      const lifted = liftFrames(detected, ASPECT);
      assert.ok(lifted);
      return { actual: read(truth, true), rebuilt: read(lifted, true), raw: read(detected, false) };
    });

    it("recovers the body exactly when the detector is perfect", () => {
      const perfect = film(view.camera, 1, MAIN_LENS, { image: 0, world: 0, depth: 0, squash: 1, oversize: 1 });
      const actual = read(perfect.truth, true);
      const rebuilt = read(liftFrames(perfect.detected, ASPECT)!, true);
      for (const metric of [...BENDS, ...TURNS]) {
        assert.ok(Math.abs(rebuilt.value(metric)! - actual.value(metric)!) <= 3, `${metric}: ${rebuilt.value(metric)} vs ${actual.value(metric)}`);
      }
    });

    it("reads the turns within the view's limit, and closer than the detector's own depth", () => {
      for (const { actual, rebuilt, raw } of takes) {
        for (const metric of TURNS) {
          const error = Math.abs(rebuilt.value(metric)! - actual.value(metric)!);
          assert.ok(error <= view.turnLimit[metric]!, `${metric}: rebuilt ${rebuilt.value(metric)} vs true ${actual.value(metric)}`);
        }
        assert.ok(meanError(rebuilt, actual, TURNS) < meanError(raw, actual, TURNS));
      }
    });

    it("keeps the bends at address within 4 degrees", () => {
      for (const { actual, rebuilt } of takes) {
        for (const metric of BENDS) {
          assert.ok(Math.abs(rebuilt.value(metric)! - actual.value(metric)!) <= 4, `${metric}: ${rebuilt.value(metric)} vs ${actual.value(metric)}`);
        }
      }
    });

    it("measures the movements the camera can see, to about half an inch", () => {
      for (const { actual, rebuilt } of takes) {
        for (const metric of view.inPicture) {
          const value = rebuilt.value(metric);
          assert.ok(value !== undefined, `${metric} should be measured ${view.name}`);
          assert.ok(Math.abs(value - actual.value(metric)!) <= 0.6, `${metric}: ${value} vs ${actual.value(metric)}`);
        }
      }
    });

    it("leaves out the movements that run along the lens", () => {
      for (const metric of view.outOfPicture) assert.ok(takes[0]!.rebuilt.skipped.includes(metric), metric);
    });
  });
}

describe("finding the phases in the picture", () => {
  it("puts address, top and impact within two frames, in either view", () => {
    for (const view of VIEWS) {
      for (const seed of TAKES) {
        const found = findImagePhases(film(view.camera, seed).detected);
        assert.ok(found, `${view.name} ${seed}`);
        for (const phase of ["address", "top", "impact"] as const) {
          assert.ok(Math.abs(found[phase] - PHASES[phase]) <= 2, `${view.name} ${phase}: ${found[phase]} vs ${PHASES[phase]}`);
        }
      }
    }
  });
});

describe("a zoomed-in clip", () => {
  it("reads as well as one from the main lens, though the lens is not the one assumed", () => {
    for (const view of VIEWS) {
      const { truth, detected } = film(zoomed(view.camera), 13, MAIN_LENS * 2);
      const actual = read(truth, true);
      const rebuilt = read(liftFrames(detected, ASPECT)!, true);
      for (const metric of TURNS) {
        const error = Math.abs(rebuilt.value(metric)! - actual.value(metric)!);
        assert.ok(error <= view.turnLimit[metric]!, `${view.name} ${metric}: ${rebuilt.value(metric)} vs ${actual.value(metric)}`);
      }
    }
  });
});

describe("what the raw detector skeleton can support", () => {
  it("measures no movement, because it is pinned between the hips", () => {
    const raw = read(film(FACE_ON, 3).detected, false);
    assert.ok(raw.skipped.includes("pelvis_sway_top"));
    assert.ok(raw.skipped.includes("head_sway_impact"));
  });

  it("will not rebuild without the picture landmarks", () => {
    const { detected } = film(FACE_ON, 5);
    assert.equal(liftFrames(detected.map(({ t, landmarks }) => ({ t, landmarks })), ASPECT), null);
  });
});


