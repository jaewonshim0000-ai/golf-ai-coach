import { resilientDetector } from "./pose-detector";

const detector = resilientDetector();
// A classic bundled worker also supports the WASM loader's importScripts.
self.onmessage = async (event: MessageEvent<{ id: number; bitmap: ImageBitmap }>) => {
  const { id, bitmap } = event.data;
  try {
    const result = await detector.detect(bitmap);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "The body detector could not read this frame." });
  } finally {
    bitmap.close();
  }
};
