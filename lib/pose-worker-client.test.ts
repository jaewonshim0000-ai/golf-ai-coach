import assert from "node:assert/strict";
import { afterEach, it, mock } from "node:test";
import { createSwingDetector } from "./pose-worker-client";
import type { Landmark } from "./golf/pose";

const originals = new Map<string, PropertyDescriptor | undefined>();
function global(name: string, value: unknown) {
  originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
afterEach(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  originals.clear();
});

class FakeWorker {
  static instances: FakeWorker[] = [];
  static respond = true;
  static poses: Landmark[][] = [];
  onmessage?: (event: { data: unknown }) => void;
  calls = 0;
  terminated = false;
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message: { id: number }) {
    this.calls++;
    if (FakeWorker.respond) queueMicrotask(() => this.onmessage?.({ data: { id: message.id, result: { landmarks: FakeWorker.poses, worldLandmarks: [] } } }));
  }
  terminate() { this.terminated = true; }
}
function environment() {
  FakeWorker.instances = []; FakeWorker.respond = true; FakeWorker.poses = [];
  const close = mock.fn();
  global("Worker", FakeWorker);
  global("OffscreenCanvas", class {});
  global("createImageBitmap", async () => ({ close }));
  global("window", { setTimeout, clearTimeout });
  return close;
}
class FakeVideo extends EventTarget {
  duration = 8;
  videoWidth = 720;
  videoHeight = 1280;
  paused = true;
  readyState = 4;
  private time = 0;
  private callback?: (now: number, metadata: { mediaTime: number }) => void;
  get currentTime() { return this.time; }
  set currentTime(time: number) {
    this.time = time;
    queueMicrotask(() => {
      const callback = this.callback; this.callback = undefined;
      callback?.(0, { mediaTime: Math.floor(time * 60) / 60 });
      this.dispatchEvent(new Event("seeked"));
    });
  }
  requestVideoFrameCallback(callback: typeof this.callback) { this.callback = callback; return 1; }
  cancelVideoFrameCallback() { this.callback = undefined; }
  pause() { this.paused = true; }
  async play() { this.paused = false; }
}

it("reuses one background worker, releases transferred images and closes the run", async () => {
  const close = environment();
  const detector = createSwingDetector();
  const video = new FakeVideo() as unknown as HTMLVideoElement;
  await detector.detect(video); await detector.detect(video);
  assert.equal(FakeWorker.instances.length, 1);
  assert.equal(FakeWorker.instances[0]!.calls, 2);
  assert.equal(close.mock.callCount(), 2);
  assert.equal(detector.execution, "worker");
  detector.close();
  assert.equal(FakeWorker.instances[0]!.terminated, true);
  await assert.rejects(detector.detect(video), { name: "AbortError" });
});

it("cancels in-flight inference promptly and terminates the worker", async () => {
  environment(); FakeWorker.respond = false;
  const controller = new AbortController();
  const detector = createSwingDetector(controller.signal);
  const pending = detector.detect(new FakeVideo() as unknown as HTMLVideoElement);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await Promise.resolve(); controller.abort(); await rejected;
  assert.equal(FakeWorker.instances[0]!.terminated, true);
});

it("rejects overlapping frame requests rather than growing a queue", async () => {
  environment(); FakeWorker.respond = false;
  const detector = createSwingDetector();
  const video = new FakeVideo() as unknown as HTMLVideoElement;
  const first = detector.detect(video);
  const cancelled = assert.rejects(first, { name: "AbortError" });
  await assert.rejects(detector.detect(video), /already being tracked/);
  detector.close();
  await cancelled;
});

it("bounds transferred bitmap size and preserves aspect ratio for a 4K recording", async () => {
  environment();
  const prepare = mock.fn(async (_source: unknown, _options?: ImageBitmapOptions) => ({ close() {} }));
  global("createImageBitmap", prepare);
  const video = new FakeVideo(); video.videoWidth = 3840; video.videoHeight = 2160;
  const detector = createSwingDetector();
  await detector.detect(video as unknown as HTMLVideoElement);
  const options = prepare.mock.calls[0]!.arguments[1] as ImageBitmapOptions;
  assert.equal(options.resizeWidth, 960); assert.equal(options.resizeHeight, 540);
  detector.close();
});

