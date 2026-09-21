import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  VISION_CONFIDENCE_CAP,
  acceptFindings,
  acceptMeasurements,
  swingVisionSchema,
  type SwingVisionOutput,
} from "./vision";

function output(patch: Partial<SwingVisionOutput> = {}): SwingVisionOutput {
  return swingVisionSchema.parse({
    usable: true,
    view: "down_the_line",
    measurements: [],
    findings: [],
    ...patch,
  });
}

const finding = {
  category: "transition" as const,
  issue: "Arms start down early",
  description: "The hands drop before the pelvis has finished shifting.",
  why_it_matters: "Delivery changes from swing to swing, so contact does too.",
  severity: "medium" as const,
  certainty: "likely" as const,
  confidence: 0.9,
  related_skill: null as string | null,
  drill_id: null as string | null,
};

describe("swing vision output", () => {
  it("keeps a plausible value and records it as an estimate", () => {
    const [row] = acceptMeasurements(
      output({ measurements: [{ metric: "pelvis_sway_impact", value: 0.82, confidence: 0.5 }] }),
      "swing_1",
    );
    assert.equal(row?.metric, "pelvis_sway_impact");
    assert.equal(row?.value, 0.8);
    assert.equal(row?.source, "vision");
    assert.equal(row?.phase, "impact");
    assert.equal(row?.unit, "in");
  });

  it("never lets an estimate claim more confidence than a reading can carry", () => {
    const [row] = acceptMeasurements(
      output({ measurements: [{ metric: "chest_turn_top", value: 88, confidence: 1 }] }),
      "swing_1",
    );
    assert.equal(row?.confidence, VISION_CONFIDENCE_CAP);
  });

  it("drops a metric it was never offered rather than guessing at the name", () => {
    const kept = acceptMeasurements(
      output({ measurements: [{ metric: "shoulder_wobble", value: 12, confidence: 0.5 }] }),
      "swing_1",
    );
    assert.equal(kept.length, 0);
  });

  it("drops a wild value instead of clamping it to the edge of the band", () => {
    // Chest turn at the top bands 80 to 100, so 400 is a misread, not a swing.
    const kept = acceptMeasurements(
      output({ measurements: [{ metric: "chest_turn_top", value: 400, confidence: 0.5 }] }),
      "swing_1",
    );
    assert.equal(kept.length, 0);
  });

  it("keeps a value outside the band but inside the plausible envelope", () => {
    const kept = acceptMeasurements(
      output({ measurements: [{ metric: "chest_turn_top", value: 62, confidence: 0.4 }] }),
      "swing_1",
    );
    assert.equal(kept.length, 1);
  });

  it("takes the first reading of a metric and ignores a second", () => {
    const kept = acceptMeasurements(
      output({
        measurements: [
          { metric: "pelvis_turn_top", value: 41, confidence: 0.5 },
          { metric: "pelvis_turn_top", value: 48, confidence: 0.5 },
        ],
      }),
      "swing_1",
    );
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.value, 41);
  });

  it("saves nothing at all when the frames could not be read", () => {
    const unusable = output({
      usable: false,
      reason: "Too dark",
      measurements: [{ metric: "chest_turn_top", value: 88, confidence: 0.5 }],
      findings: [finding],
    });
    assert.equal(acceptMeasurements(unusable, "swing_1").length, 0);
    assert.equal(acceptFindings(unusable, "swing_1", "user_1").length, 0);
  });

  it("cuts an invented drill or skill reference from a finding", () => {
    const [row] = acceptFindings(
      output({ findings: [{ ...finding, drill_id: "drill_made_up", related_skill: "vibes" }] }),
      "swing_1",
      "user_1",
    );
    assert.equal(row?.recommended_drill_id, null);
    assert.equal(row?.related_skill, null);
    assert.equal(row?.source, "vision");
    assert.equal(row?.confidence, VISION_CONFIDENCE_CAP);
  });

  it("keeps a real drill reference", () => {
    const [row] = acceptFindings(
      output({
        findings: [
          { ...finding, drill_id: "drill_pause_at_top", related_skill: "sequencing" },
        ],
      }),
      "swing_1",
      "user_1",
    );
    assert.equal(row?.recommended_drill_id, "drill_pause_at_top");
    assert.equal(row?.related_skill, "sequencing");
  });

  it("rejects model output that is missing the fields the UI reads", () => {
    assert.equal(swingVisionSchema.safeParse({ usable: true }).success, false);
    assert.equal(
      swingVisionSchema.safeParse({ usable: true, view: "down_the_line" }).success,
      true,
    );
  });
});
