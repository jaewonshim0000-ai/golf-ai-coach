import assert from "node:assert/strict";
import { it } from "node:test";
import { faceOnSwing } from "../golf/__fixtures__/face-on";
import { selectTrackedPose, refinementTimes } from "../pose-runner";
import { runSwingCapture, type CaptureSource } from "./capture";
import { CAPTURE_LIMITS } from "./policy";

const algorithms = { select: selectTrackedPose, refine: refinementTimes };
function camera(duration = 2.4) {
  let time = 0, active = 0, peak = 0, calls = 0, seeks = 0;
  const models: string[] = [], closed: string[] = [];
  const source: CaptureSource = {
    width: 720, height: 1280, duration, decodedTimestamps: true,
    async seek(t) { seeks++; time = Math.floor(t * 60) / 60; return time; },
    detector(variant) {
      active++; peak = Math.max(peak, active); models.push(variant);
      return {
        async detect() {
          calls++;
          const reference = faceOnSwing();
          const frame = reference.reduce((best, f) => Math.abs(f.t - time) < Math.abs(best.t - time) ? f : best);
          // Distinct model outputs make scout leakage observable.
          const points = frame.imageLandmarks!.map((p) => ({ ...p, z: variant === "lite" ? 99 : 42 }));
          return { landmarks: [points], worldLandmarks: [] };
        },
        close() { active--; closed.push(variant); },
      };
    },
  };
  return { source, models, closed, stats: () => ({ active, peak, calls, seeks }) };
}

it("short clips use one measurement model, at most 96 inferences, and image-only tracks", async () => {
  const c = camera();
  const r = await runSwingCapture(c.source, algorithms, { from: 0, to: 2.4, view: "face_on" });
  assert.deepEqual(c.models, ["heavy"]);
  assert.ok(r.capture.inferences <= 96 && r.capture.inferences >= 48);
  assert.equal(r.capture.timestampSource, "decoded");
  assert.ok(r.frames.length > 30 && r.frames.every((f) => f.landmarks.length === 0 && f.imageLandmarks?.every((p) => p.z === 0)));
  assert.equal(new Set(r.frames.map((f) => f.t)).size, r.frames.length);
  assert.equal(c.stats().active, 0);
});

it("long clips release the scout before measurement and never mix detector tracks", async () => {
  const c = camera(8);
  const progress: number[] = [];
  const r = await runSwingCapture(c.source, algorithms, { from: 0, to: 8, view: "face_on", progress: (done) => progress.push(done) });
  assert.deepEqual(c.models, ["lite", "heavy"]);
  assert.deepEqual(c.closed, c.models);
  assert.equal(c.stats().peak, 1);
  assert.ok(r.capture.inferences <= CAPTURE_LIMITS.inferences);
  assert.equal(r.capture.inferences, c.stats().calls);
  assert.equal(r.capture.seeks, c.stats().seeks);
  assert.ok(progress.every((n, i) => !i || n >= progress[i - 1]!));
});

it("counts empty detections and duplicate decodes without unbounded retries", async () => {
  const c = camera();
  c.source.seek = async () => 0.5;
  c.source.detector = () => ({ async detect() { return { landmarks: [], worldLandmarks: [] }; }, close() {} });
  const r = await runSwingCapture(c.source, algorithms, { from: 0, to: 2.4, view: "face_on" });
  assert.equal(r.capture.inferences, 1);
  assert.ok(r.capture.duplicates > 0 && r.capture.seeks <= CAPTURE_LIMITS.seeks);
  assert.deepEqual(r.frames, []);
});

it("cancels a hung inference promptly and closes its resources", async () => {
  const c = camera(); const controller = new AbortController();
  let closed = false;
  c.source.detector = () => ({ detect: () => new Promise(() => {}), close() { closed = true; } });
  const run = runSwingCapture(c.source, algorithms, { from: 0, to: 2.4, view: "face_on", signal: controller.signal });
  queueMicrotask(() => controller.abort());
  await assert.rejects(run, { name: "AbortError" });
  assert.equal(closed, true);
});

it("validates duration before allocating any model and labels fallback timestamps", async () => {
  const c = camera(60);
  await assert.rejects(runSwingCapture(c.source, algorithms, { from: 0, to: 60, view: "face_on" }), /30 seconds/);
  assert.deepEqual(c.models, []);
  c.source.decodedTimestamps = false;
  const r = await runSwingCapture(c.source, algorithms, { from: 0, to: 2.4, view: "face_on" });
  assert.equal(r.capture.timestampSource, "seek");
});

it("enforces the asynchronous deadline on a hung adapter and closes the detector", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const c = camera(); let closed = false;
  c.source.detector = () => ({ detect: () => new Promise(() => {}), close() { closed = true; } });
  const pending = runSwingCapture(c.source, algorithms, { from: 0, to: 2.4, view: "face_on" });
  await Promise.resolve();
  context.mock.timers.tick(CAPTURE_LIMITS.deadlineMs);
  await assert.rejects(pending, /too long/);
  assert.equal(closed, true);
});

it("enforces the measurement cap even if a refinement strategy overproduces requests", async () => {
  const c = camera();
  const result = await runSwingCapture(c.source, { ...algorithms,
    refine: () => Array.from({ length: 500 }, (_, i) => i * 0.004),
  }, { from: 0, to: 2.4, view: "face_on" });
  assert.ok(result.capture.inferences <= CAPTURE_LIMITS.measurements);
  assert.ok(result.capture.seeks <= CAPTURE_LIMITS.seeks);
  assert.equal(c.stats().active, 0);
});
