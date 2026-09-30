import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nextVideoTimestamp } from "./pose-runner";

describe("pose detector timestamps", () => {
  it("keep increasing when a later measurement tries to restart its clock", () => {
    const first = nextVideoTimestamp(10_000);
    const second = nextVideoTimestamp(10_000);
    const restarted = nextVideoTimestamp(0);

    assert.ok(second > first);
    assert.ok(restarted > second);
  });
});
