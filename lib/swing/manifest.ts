import { CAPTURE_LIMITS, SWING_ENGINE } from "./policy";

export type CaptureManifest = {
  engine: typeof SWING_ENGINE;
  measurementModel: "mediapipe-heavy-f16-v1";
  scoutModel: "mediapipe-lite-f16-v1" | "none";
  timestampSource: "decoded" | "seek";
  width: number; height: number; maxInputEdge: typeof CAPTURE_LIMITS.maxEdge;
  /** Logical detector requests; a delegate fallback can retry native inference once. */
  inferences: number;
  seeks: number; duplicates: number; rejectedPoses: number; elapsedMs: number;
};

/** Shared upload and review validation without a schema library in the player. */
export function isCaptureManifest(value: unknown): value is CaptureManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>;
  const keys = ["engine", "measurementModel", "scoutModel", "timestampSource", "width", "height", "maxInputEdge", "inferences", "seeks", "duplicates", "rejectedPoses", "elapsedMs"];
  if (Object.keys(m).length !== keys.length || Object.keys(m).some((key) => !keys.includes(key))) return false;
  const integer = (key: string, minimum: number, maximum: number) => typeof m[key] === "number" &&
    Number.isInteger(m[key]) && (m[key] as number) >= minimum && (m[key] as number) <= maximum;
  return m.engine === SWING_ENGINE && m.measurementModel === "mediapipe-heavy-f16-v1" &&
    (m.scoutModel === "none" || m.scoutModel === "mediapipe-lite-f16-v1") &&
    (m.timestampSource === "decoded" || m.timestampSource === "seek") && m.maxInputEdge === CAPTURE_LIMITS.maxEdge &&
    integer("width", 1, 16384) && integer("height", 1, 16384) &&
    integer("inferences", 0, CAPTURE_LIMITS.inferences) && integer("seeks", 0, CAPTURE_LIMITS.seeks) &&
    integer("duplicates", 0, CAPTURE_LIMITS.seeks) && integer("rejectedPoses", 0, CAPTURE_LIMITS.inferences) &&
    typeof m.elapsedMs === "number" && Number.isFinite(m.elapsedMs) && m.elapsedMs >= 0 && m.elapsedMs <= CAPTURE_LIMITS.deadlineMs + 5000 &&
    (m.inferences as number) <= (m.seeks as number) && (m.duplicates as number) <= (m.seeks as number) &&
    (m.rejectedPoses as number) <= (m.inferences as number);
}
