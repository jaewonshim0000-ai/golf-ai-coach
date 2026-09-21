import { test } from "node:test";
import assert from "node:assert/strict";
import { ruleBasedPracticeSummary } from "./insights";
import { demoData } from "../seed/demo-player";
import { DRILLS } from "../seed/drills";
import { practiceTrends } from "../analytics/practice-progress";

test("a first practice cannot borrow improvement from unrelated drills", () => {
  const data = demoData();
  const result = ruleBasedPracticeSummary({
    session: data.practiceSessions[0]!,
    drills: DRILLS,
    attempts: [{ ...data.drillAttempts[0]!, drill_id: "drill_wedge_accuracy", attempts: 10, successes: 7, score: 0.7 }],
    trends: practiceTrends(data.drillAttempts, DRILLS),
  });
  assert.equal(result.verdict, "insufficient_data");
});
