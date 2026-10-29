/** Pure runtime policy: keep validation libraries out of the inference worker. */
export const SWING_ENGINE = "swing-2d-3";
export const CAPTURE_LIMITS = Object.freeze({
  inferences: 160, scout: 32, measurements: 96, seeks: 256,
  deadlineMs: 90000, maxEdge: 960, maxClipSeconds: 60,
});
export type CaptureStage = "scouting" | "measuring" | "refining";
export type PoseVariant = "lite" | "heavy";
export function inputSize(width: number, height: number) {
  const scale = Math.min(1, CAPTURE_LIMITS.maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
