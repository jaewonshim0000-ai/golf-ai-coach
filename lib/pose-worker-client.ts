"use client";

import { resilientDetector, type PoseDetection } from "./pose-detector";
import { inputSize, type PoseVariant } from "./swing/policy";

/** One worker and at most one transferred bitmap per analysis. No frame queue
 * can grow behind a slow phone. Closing a run releases WASM/GPU resources. */
export function createSwingDetector(signal?: AbortSignal, variant: PoseVariant = "heavy") {
  let worker: Worker | undefined;
  let fallback: ReturnType<typeof resilientDetector> | undefined;
  let request = 0;
  let pending: { reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | undefined;
  let closed = false;
  let busy = false;
  let canvas: HTMLCanvasElement | undefined;
  const close = () => {
    closed = true;
    worker?.terminate(); worker = undefined;
    fallback?.close(); fallback = undefined;
    if (canvas) { canvas.width = 0; canvas.height = 0; canvas = undefined; }
    if (pending) { clearTimeout(pending.timer); pending.reject(new DOMException("Analysis cancelled.", "AbortError")); pending = undefined; }
    signal?.removeEventListener("abort", close);
  };
  signal?.throwIfAborted();
  signal?.addEventListener("abort", close, { once: true });
  if (typeof Worker !== "undefined" && typeof createImageBitmap !== "undefined" && typeof OffscreenCanvas !== "undefined") {
    try { worker = new Worker(new URL("./pose-worker.ts", import.meta.url)); } catch { /* Use the supported main-thread path. */ }
  }
  return {
    get execution() { return worker ? "worker" as const : "main-thread" as const; },
    async detect(video: HTMLVideoElement): Promise<PoseDetection> {
      signal?.throwIfAborted();
      if (closed) throw new DOMException("Analysis cancelled.", "AbortError");
      if (busy) throw new Error("A video frame is already being tracked.");
      busy = true;
      try {
        if (worker) {
          let bitmap: ImageBitmap | undefined;
          try {
            const size = inputSize(video.videoWidth, video.videoHeight);
            bitmap = await createImageBitmap(video, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: "high" });
            signal?.throwIfAborted();
            if (closed) throw new DOMException("Analysis cancelled.", "AbortError");
            const active = worker;
            const id = ++request;
            const transferred = bitmap;
            return await new Promise<PoseDetection>((resolve, reject) => {
              const finish = (error?: Error, result?: PoseDetection) => {
                if (pending) clearTimeout(pending.timer);
                pending = undefined;
                if (error) reject(error); else resolve(result!);
              };
              // The first frame includes downloading/compiling the selected model.
              pending = { reject, timer: setTimeout(() => finish(new Error("Body model timed out.")), id === 1 ? 60000 : 15000) };
              active.onmessage = (event: MessageEvent<{ id: number; result?: PoseDetection; error?: string }>) => {
                if (event.data.id === id) finish(event.data.result ? undefined : new Error(event.data.error), event.data.result);
              };
              active.onerror = () => finish(new Error("Background body tracking is unavailable."));
              active.onmessageerror = () => finish(new Error("Could not read background tracking."));
              try { active.postMessage({ id, bitmap: transferred, variant }, [transferred]); }
              catch { finish(new Error("Could not transfer the video frame.")); }
            });
          } catch (error) {
            if (pending) { clearTimeout(pending.timer); pending = undefined; }
            worker?.terminate(); worker = undefined;
            signal?.throwIfAborted();
            if (closed || (error instanceof DOMException && error.name === "SecurityError")) throw error;
            console.warn("Background body tracking unavailable; using foreground detection.", error);
          } finally { bitmap?.close(); }
        }
        fallback ??= resilientDetector(variant);
        // Let progress/cancel controls paint even on browsers without workers.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        signal?.throwIfAborted();
        const size = inputSize(video.videoWidth, video.videoHeight);
        canvas ??= document.createElement("canvas");
        canvas.width = size.width; canvas.height = size.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("This browser cannot prepare the video frame.");
        context.drawImage(video, 0, 0, size.width, size.height);
        return await fallback.detect(canvas);
      } finally { busy = false; }
    },
    close,
  };
}
