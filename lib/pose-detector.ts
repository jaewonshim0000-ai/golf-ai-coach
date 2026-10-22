import type { Landmark } from "./golf/pose";
import type { PoseVariant } from "./swing/policy";

export type DetectedLandmark = Landmark & { presence?: number };
export type PoseDetection = { worldLandmarks: DetectedLandmark[][]; landmarks: DetectedLandmark[][] };
export type PoseDetector = { detect: (image: ImageBitmap | HTMLVideoElement | HTMLCanvasElement) => PoseDetection; close: () => void };

// Match the installed JS runtime to its WASM. Pin model assets for repeatability.
const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const modelUrl = (variant: PoseVariant) => `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${variant}/float16/1/pose_landmarker_${variant}.task`;

export async function createPoseDetector(delegate: "GPU" | "CPU", variant: PoseVariant = "heavy"): Promise<PoseDetector> {
  const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelUrl(variant), delegate },
    // Refinement seeks backwards, so VIDEO mode's tracking history is invalid.
    runningMode: "IMAGE",
    numPoses: 2,
    minPoseDetectionConfidence: 0.65,
    minPosePresenceConfidence: 0.65,
    outputSegmentationMasks: false,
    ...(typeof document === "undefined" && typeof OffscreenCanvas !== "undefined"
      ? { canvas: new OffscreenCanvas(1, 1) } : {}),
  });
}

/** Retry a failed GPU initialization or inference once using the CPU. */
export function resilientDetector(variant: PoseVariant = "heavy") {
  let detector: PoseDetector | undefined;
  let delegate: "GPU" | "CPU" = "GPU";
  let closed = false;
  const load = async () => {
    const loaded = await createPoseDetector(delegate, variant);
    if (closed) { loaded.close(); throw new DOMException("Analysis cancelled.", "AbortError"); }
    detector = loaded;
  };
  return {
    async detect(image: ImageBitmap | HTMLVideoElement | HTMLCanvasElement): Promise<PoseDetection> {
      if (closed) throw new DOMException("Analysis cancelled.", "AbortError");
      try {
        if (!detector) await load();
        return detector!.detect(image);
      } catch (error) {
        detector?.close(); detector = undefined;
        if (delegate === "CPU" || closed) throw error;
        delegate = "CPU";
        await load();
        return detector!.detect(image);
      }
    },
    close() { closed = true; detector?.close(); detector = undefined; },
  };
}
