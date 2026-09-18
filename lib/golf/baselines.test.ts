import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import type { SGSummary, Segment } from "../../types/analytics";
import { SG_CATEGORIES } from "../../types/golf";
import { BASELINES, baselineForHandicap, getBaseline, rebaseSegment, rebaseSummary } from "./baselines";
import { diagnoseSwing } from "./swing-metrics";
import type { SwingMeasurement } from "../../types/practice";

function summary(perRound: Record<string, number>, rounds = 8): SGSummary {
  const by_category = Object.fromEntries(
    SG_CATEGORIES.map((category) => [
      category,
      {
        category,
        per_round: perRound[category] ?? 0,
        total: (perRound[category] ?? 0) * rounds,
        shots: 50,
      },
    ]),
  ) as SGSummary["by_category"];
  const total = SG_CATEGORIES.reduce((sum, c) => sum + (perRound[c] ?? 0), 0);
  return { total: total * rounds, per_round: total, rounds, shots: 200, by_category };
}

describe("baselines", () => {
  it("leaves the Tour baseline exactly as computed", () => {
    const original = summary({ approach: -5.49, putting: -1.27 });
    assert.equal(rebaseSummary(original, getBaseline("tour")), original);
  });

  it("subtracts the level's own gap rather than rescaling", () => {
    // A 10-handicap averages -4.3 approach; this player is at -5.49.
    const rebased = rebaseSummary(summary({ approach: -5.49 }), getBaseline("hcp_10"));
    assert.equal(rebased.by_category.approach.per_round, -1.19);
  });

  it("turns a Tour deficit into a gain against a weaker level", () => {
    const rebased = rebaseSummary(summary({ putting: -1.27 }), getBaseline("hcp_15"));
    assert.ok(rebased.by_category.putting.per_round > 0, "putting should be a strength vs 15 hcp");
  });

  it("keeps the categories summing to the total", () => {
    const rebased = rebaseSummary(
      summary({ off_the_tee: -2.1, approach: -5.49, around_the_green: -1.87, putting: -1.27 }),
      getBaseline("hcp_10"),
    );
    const sum = SG_CATEGORIES.reduce((n, c) => n + rebased.by_category[c].per_round, 0);
    assert.equal(Math.round(sum * 100) / 100, rebased.per_round);
  });

  it("defaults to the nearest listed level, and to Tour with no handicap", () => {
    assert.equal(baselineForHandicap(11.8).id, "hcp_10");
    assert.equal(baselineForHandicap(17).id, "hcp_15");
    assert.equal(baselineForHandicap(null).id, "tour");
  });

  it("falls back to Tour for an unknown id rather than throwing", () => {
    assert.equal(getBaseline("hcp_999").id, "tour");
    assert.equal(getBaseline(undefined).id, "tour");
  });

  it("gives every level a gap for every category", () => {
    for (const baseline of BASELINES) {
      for (const category of SG_CATEGORIES) {
        assert.equal(typeof baseline.gap[category], "number", `${baseline.id}/${category}`);
      }
    }
  });

  it("gives a whole category its whole gap and a band only a share", () => {
    const base: Segment = {
      kind: "category",
      key: "approach",
      label: "Approach",
      category: "approach",
      shots: 176,
      rounds: 8,
      total_sg: -43.9,
      sg_per_shot: -0.25,
      sg_per_round: -5.49,
      trend: null,
      volatility: 0.5,
    };
    const whole = rebaseSegment(base, getBaseline("hcp_10"));
    assert.equal(whole.sg_per_round, -1.19);

    // 44 shots over 8 rounds is 5.5 a round out of ~22, so about a quarter.
    const band = rebaseSegment(
      { ...base, kind: "approach_distance", key: "150-175", shots: 44, sg_per_round: -2.36 },
      getBaseline("hcp_10"),
    );
    assert.ok(band.sg_per_round > -2.36, "band should improve against a weaker level");
    assert.ok(band.sg_per_round < -1.19, "but by less than the whole category's gap");
  });
});

describe("swing diagnostic", () => {
  const measure = (metric: string, value: number): SwingMeasurement => ({
    id: metric,
    swing_session_id: "s1",
    phase: "impact",
    metric,
    value,
    unit: "in",
    confidence: 0.6,
  });

  it("reports an unmeasured metric as missing, never as fine", () => {
    const result = diagnoseSwing([]);
    assert.equal(result.measured, 0);
    assert.equal(result.inRange, 0);
    assert.ok(result.missing.length > 0);
  });

  it("flags a value outside its band and says which way", () => {
    // Band for pelvis sway at impact is 1.5 to 5 inches toward the target.
    const [reading] = diagnoseSwing([measure("pelvis_sway_impact", 0.8)]).outOfRange;
    assert.equal(reading?.status, "below");
    assert.equal(reading?.deviation, 0.7);
    assert.match(reading!.note, /hanging back/);
  });

  it("ranks by how far outside the band, relative to its width", () => {
    const result = diagnoseSwing([
      measure("pelvis_sway_impact", 1.0), // 0.5 outside a 3.5-wide band
      measure("head_sway_impact", -6), // 4 outside a 3-wide band
    ]);
    assert.equal(result.outOfRange[0]?.metric.id, "head_sway_impact");
  });

  it("ignores a metric it does not know instead of inventing a band", () => {
    const result = diagnoseSwing([measure("shoulder_wobble", 12)]);
    assert.equal(result.measured, 0);
  });

  it("counts an in-band value as in range and suggests no drill for it", () => {
    const result = diagnoseSwing([measure("pelvis_sway_impact", 3)]);
    assert.equal(result.inRange, 1);
    assert.equal(result.outOfRange.length, 0);
    assert.equal(result.readings[0]?.drillId, null);
  });
});
