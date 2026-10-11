import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRACTICE_TESTS, TEST_DRILLS, dispersionDiameter, practiceTest, scoreTest, spiralProgress, testItem, testResultLabel } from "./tests";
import { benchmarkFor, benchmarkNote } from "./benchmark";
import { practiceTrends } from "../analytics/practice-progress";
import { drillAttemptSchema } from "../validation/schemas";
import { ruleBasedPracticeSummary } from "../ai/insights";
import { demoData } from "../seed/demo-player";
import type { DrillAttempt } from "../../types/practice";

const test = (id: string) => practiceTest(id)!;
const attempt = (id: string, raw_value: number, on: string): DrillAttempt => ({
  id: on, drill_id: id, user_id: "u", session_id: "s", practice_item_id: "i", attempts: 10,
  successes: 0, score: 0, raw_value, notes: null, completed_at: on,
});

describe("the supplied practice tests", () => {
  it("replaces the catalog with ten tests per area and retains the specified distances", () => {
    assert.equal(TEST_DRILLS.length, 30);
    assert.equal(new Set(TEST_DRILLS.map((drill) => drill.id)).size, 30);
    for (const group of ["range", "chipping", "putting"]) assert.equal(PRACTICE_TESTS.filter((test) => test.group === group).length, 10);
    assert.deepEqual(PRACTICE_TESTS.filter((test) => test.kind === "line").map((test) => test.focus), ["50–100 yd", "100–150 yd", "150–200 yd", "200–250 yd"]);
    assert.equal(test("test_putt_spiral").focus, "3, 5, 7, 9 ft");
    assert.equal(test("test_up_and_down").kind, "up_down");
    assert.equal(test("test_putt_gate").kind, "gate");
  });

  it("scores line tests sideways and chips radially against the saved band", () => {
    const points: [number, number][] = [[3, 4], [3, 4], ...Array.from({ length: 8 }, (): [number, number] => [6, 0])];
    assert.equal(scoreTest(test("test_line_50_100"), { tolerance: 3 }, points, null).successes, 2);
    assert.equal(scoreTest(test("test_short_chip"), { tolerance: 4 }, points, null).successes, 0);
    assert.equal(scoreTest(test("test_short_chip"), { tolerance: 5 }, points, null).successes, 2);
    assert.equal(scoreTest(test("test_short_chip"), { tolerance: 6 }, points, null).successes, 10);
    assert.equal(testItem(test("test_landing_spot"), 2).tolerance, 2);
    assert.match(testItem(test("test_landing_spot"), 2).objective, /Land within 2 ft/);
  });

  it("measures the full dispersion diameter rather than the sideways spread or target miss", () => {
    assert.equal(dispersionDiameter([[0, 0], [3, 4], [1, 1]]), 5);
    assert.equal(dispersionDiameter([[20, -10], [23, -6], [21, -9]]), 5);
    const points: [number, number][] = [[0, 0], [3, 4], ...Array.from({ length: 8 }, (): [number, number] => [1, 1])];
    const result = scoreTest(test("test_dispersion_100_150"), {}, points, null);
    assert.equal(result.raw_value, 5);
    assert.equal(result.score, 0);
    assert.match(testResultLabel(test("test_dispersion_100_150"), result), /5.0 yd dispersion diameter/);
  });

  it("averages all ten carries, including mishits, and rejects missing or invalid measurements", () => {
    const result = scoreTest(test("test_driver_distance"), {}, null, [0, ...Array(9).fill(250)]);
    assert.equal(result.raw_value, 225);
    assert.equal(result.successes, 0);
    assert.throws(() => scoreTest(test("test_driver_distance"), {}, null, Array(9).fill(250)), /exactly 10/);
    assert.throws(() => scoreTest(test("test_driver_distance"), {}, null, [601, ...Array(9).fill(250)]), /0 and 600/);
    assert.throws(() => scoreTest(test("test_short_chip"), {}, Array(9).fill([0, 0]), null), /all 10/);
  });

  it("scores ten outcomes for fairways, gates, putts and two-stroke up-and-downs", () => {
    for (const id of ["test_driver_accuracy", "test_putt_gate", "test_putt_3", "test_up_and_down"]) {
      const result = scoreTest(test(id), {}, null, [1, 1, 0, 1, 0, 0, 1, 1, 1, 0]);
      assert.equal(result.successes, 6);
      assert.equal(result.score, 0.6);
      assert.throws(() => scoreTest(test(id), {}, null, [2, ...Array(9).fill(0)]), /valid successful/);
    }
    assert.match(testResultLabel(test("test_up_and_down"), { attempts: 10, successes: 6, score: 0.6, raw_value: null }), /6\/10 up-and-downs in 2 strokes or fewer/);
  });

  it("restarts the spiral at three feet after a miss and completes only in order", () => {
    assert.equal(spiralProgress([1, 1]).nextDistance, 7);
    assert.deepEqual(spiralProgress([1, 1, 0]), { streak: 0, longest: 2, restarts: 1, complete: false, nextDistance: 3 });
    const outcomes = [1, 1, 0, 1, 1, 1, 1];
    const result = scoreTest(test("test_putt_spiral"), {}, null, outcomes);
    assert.equal(result.attempts, 7);
    assert.equal(result.score, 1);
    assert.equal(result.raw_value, 1);
    assert.deepEqual(result.shot_offsets, outcomes);
    assert.match(testResultLabel(test("test_putt_spiral"), result), /Completed in 7 putts/);
    assert.throws(() => scoreTest(test("test_putt_spiral"), {}, null, [...outcomes, 0]), /already completed/);
    assert.equal(scoreTest(test("test_putt_spiral"), {}, null, [1, 1, 0, 1]).score, 0.5);
  });

  it("accepts a longer spiral without weakening the limits of legacy shot estimates", () => {
    const input = { session_id: "s", drill_id: "test_putt_spiral", attempts: 45, successes: 4, shot_offsets: [...Array(41).fill(0), 1, 1, 1, 1] };
    assert.ok(drillAttemptSchema.safeParse(input).success);
    assert.equal(drillAttemptSchema.safeParse({ ...input, drill_id: "drill_iron_accuracy" }).success, false);
    assert.equal(scoreTest(test("test_putt_spiral"), {}, null, input.shot_offsets).score, 1);
  });

  it("compares raw measurements in their own direction and never calls them a zero-percent failure", () => {
    for (const [id, values, best] of [["test_driver_distance", [220, 240, 230], 240], ["test_dispersion_100_150", [20, 10, 15], 10]] as const) {
      const results = values.map((value, i) => attempt(id, value, `2026-10-0${i + 1}`));
      const drill = TEST_DRILLS.find((drill) => drill.id === id)!;
      const benchmark = benchmarkFor(drill, results);
      assert.equal(benchmark.best?.raw_value, best);
      assert.match(benchmarkNote(benchmark)!, /yd/);
      assert.deepEqual(practiceTrends(results, TEST_DRILLS), []);
      const summary = ruleBasedPracticeSummary({ session: demoData().practiceSessions[0]!, attempts: results.slice(0, 1), drills: TEST_DRILLS, trends: [] });
      assert.match(summary.results[0]!, /yd/);
      assert.doesNotMatch(summary.headline + summary.results.join(), /0%|target/);
    }
  });
});
