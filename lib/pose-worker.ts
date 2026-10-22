import { resilientDetector } from "./pose-detector";
import type { PoseVariant } from "./swing/policy";

let detector: ReturnType<typeof resilientDetector> | undefined;
// A classic bundled worker also supports the WASM loader's importScripts.
self.onmessage = async (event: MessageEvent<{ id: number; bitmap: ImageBitmap; variant: PoseVariant }>) => {
  const { id, bitmap, variant } = event.data;
  try {
    detector ??= resilientDetector(variant === "lite" ? "lite" : "heavy");
    const result = await detector.detect(bitmap);
    // Player-facing capture uses image coordinates only; avoid serializing
    // inferred world arrays across the worker boundary on every inference.
    self.postMessage({ id, result: { landmarks: result.landmarks, worldLandmarks: [] } });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "The body detector could not read this frame." });
  } finally {
    bitmap.close();
  }
};
