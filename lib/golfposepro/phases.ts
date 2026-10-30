/**
 * GolfPosePro (github.com/ryanboscobanze/GolfPosePro, MIT), ported line for
 * line from its notebook: the wrist-height signal from
 * `extract_pose_features_debug` and the phase segmentation from
 * `detect_swing_phases`. Numbers follow NumPy/SciPy semantics, including
 * float32 rounding and NaN propagation, so the same wrist series gives the
 * same frames as the notebook. Do not "improve" this file: its output is the
 * analysis, and tests pin it to the notebook's own results.
 */

export const GPP_PHASES = ["Address", "Backswing", "Top", "Downswing", "Impact", "Follow Through"] as const;
export type GppPhase = (typeof GPP_PHASES)[number];
export type GppPhaseRanges = Record<GppPhase, [number, number]>;
export type GppLandmark = { x: number; y: number; visibility?: number };

const f32 = Math.fround;

/** Mean height of the wrists seen with visibility over 0.4, in pixels; null when neither is. */
export function wristY(landmarks: GppLandmark[] | null | undefined, height: number): number | null {
  if (!landmarks) return null;
  const visible = [landmarks[15], landmarks[16]].filter((p): p is GppLandmark => Boolean(p && (p.visibility ?? 0) > 0.4));
  if (!visible.length) return null;
  // np.mean of float landmark values, scaled by the frame height.
  return visible.reduce((sum, p) => sum + p.y, 0) / visible.length * height;
}

/** scipy.ndimage.uniform_filter1d(mode="nearest"): a running sum, so one NaN poisons every later value. */
function uniformFilter1d(input: Float32Array, size: number): Float32Array {
  const n = input.length, out = new Float32Array(n);
  if (!n) return out;
  const left = Math.floor(size / 2), at = (i: number) => input[Math.min(n - 1, Math.max(0, i))]!;
  let sum = 0;
  for (let k = 0; k < size; k++) sum += at(k - left);
  let mean = sum / size;
  out[0] = mean;
  for (let i = 1; i < n; i++) {
    mean += (at(i + size - 1 - left) - at(i - 1 - left)) / size;
    out[i] = mean;
  }
  return out;
}

/** np.gradient on a float32 array: central differences, one-sided at the ends. */
function gradient(values: Float32Array): Float32Array {
  const n = values.length, out = new Float32Array(n);
  if (n < 2) return out;
  out[0] = f32(values[1]! - values[0]!);
  out[n - 1] = f32(values[n - 1]! - values[n - 2]!);
  for (let i = 1; i < n - 1; i++) out[i] = f32(f32(values[i + 1]! - values[i - 1]!) / 2);
  return out;
}

const finite = (values: ArrayLike<number>) => Array.from(values).filter((v) => !Number.isNaN(v));
const nanmean = (values: ArrayLike<number>) => { const v = finite(values); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
const nanstd = (values: ArrayLike<number>) => {
  const v = finite(values);
  if (!v.length) return NaN;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
};
/** np.nanpercentile with the default linear interpolation. */
function nanpercentile(values: ArrayLike<number>, q: number): number {
  const v = finite(values).sort((a, b) => a - b);
  if (!v.length) return NaN;
  const index = (v.length - 1) * q / 100, low = Math.floor(index), high = Math.ceil(index);
  return f32(v[low]! + (v[high]! - v[low]!) * (index - low));
}
/** First index of the smallest/largest non-NaN value, as np.nanargmin/np.nanargmax; -1 when all NaN (NumPy raises). */
function nanarg(values: ArrayLike<number>, better: (a: number, b: number) => boolean): number {
  let best = -1;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (!Number.isNaN(v) && (best < 0 || better(v, values[best]!))) best = i;
  }
  return best;
}

export type GppSegmentation = {
  phases: GppPhaseRanges;
  swingStart: number;
  swingEnd: number;
  /** Raw and smoothed wrist height per frame, pixels from the top; NaN where unseen. */
  wristY: Float32Array;
  smoothed: Float32Array;
};

/**
 * detect_swing_phases(frame_data, smoothing_window=5, precheck_window=30,
 * threshold_percentile=90). Returns null where the notebook would raise
 * (an all-NaN slice) instead of throwing.
 */
export function detectSwingPhases(wrist: (number | null)[], smoothingWindow = 5, precheckWindow = 30, thresholdPercentile = 90): GppSegmentation | null {
  const wristY = Float32Array.from(wrist, (v) => v === null ? NaN : v);
  const n = wristY.length;
  if (n < 2) return null;
  const smoothed = uniformFilter1d(wristY, smoothingWindow);
  const velocityMag = gradient(smoothed).map(Math.abs);

  // Motion threshold and swing start
  const early = velocityMag.subarray(0, precheckWindow);
  const earlyMotion = nanmean(early), motionStd = nanstd(early);
  const bufferStart = earlyMotion < 0.001 && motionStd < 0.001 ? precheckWindow : 0;
  const threshold = nanpercentile(velocityMag.subarray(bufferStart), thresholdPercentile);
  const motion: number[] = [];
  velocityMag.forEach((v, i) => { if (v > threshold && i > bufferStart) motion.push(i); });

  let swingStart: number, swingEnd: number;
  if (motion.length) {
    swingStart = motion[0]!;
    const peak = motion[nanarg(motion.map((i) => velocityMag[i]!), (a, b) => a > b)]!;
    const target = smoothed[swingStart]!;
    const after = smoothed.subarray(peak + 1).map((v) => Math.abs(f32(v - target)));
    if (after.length) {
      const closest = nanarg(after, (a, b) => a < b);
      if (closest < 0) return null;
      swingEnd = peak + 1 + closest;
    } else swingEnd = n - 1;
  } else {
    swingStart = 0;
    swingEnd = n - 1;
  }

  // Dynamic Address detection
  const flatStdThresh = 1.0, minFlatFrames = 10;
  let addressStart = 0;
  for (let i = swingStart - minFlatFrames; i > 0; i--) {
    const window = smoothed.subarray(i, swingStart);
    if (finite(window).length < minFlatFrames) continue;
    if (nanstd(window) < flatStdThresh) addressStart = i;
    else break;
  }
  const addressEnd = swingStart;

  // Top of backswing
  const segment = smoothed.subarray(swingStart, swingEnd);
  let firstRise = -1;
  for (let i = 0; i < segment.length - 1; i++) if (f32(segment[i + 1]! - segment[i]!) > 0) { firstRise = i; break; }
  const topCandidateMax = firstRise >= 0 ? swingStart + firstRise : Math.min(swingStart + 20, n - 1);
  const topSearchEnd = Math.min(topCandidateMax, swingEnd);
  let topIdx = swingStart;
  if (topSearchEnd > swingStart) {
    const lowest = nanarg(smoothed.subarray(swingStart, topSearchEnd), (a, b) => a < b);
    if (lowest < 0) return null;
    topIdx = swingStart + lowest;
  }
  const topRange: [number, number] = [Math.max(0, topIdx - 5), Math.min(n - 1, topIdx + 5)];

  // Impact
  const postTop = smoothed.subarray(topRange[1], swingEnd);
  let impactRange: [number, number];
  if (!postTop.length || finite(postTop).length === 0) impactRange = [topRange[1], topRange[1] + 1];
  else {
    const localMaxIdx = nanarg(postTop, (a, b) => a > b);
    const maxVal = postTop[localMaxIdx]!;
    const values = finite(postTop);
    const tolerance = f32(0.05 * f32(Math.max(...values) - Math.min(...values)));
    let left = localMaxIdx, right = localMaxIdx;
    while (left > 0 && Math.abs(f32(postTop[left - 1]! - maxVal)) < tolerance) left--;
    while (right < postTop.length - 1 && Math.abs(f32(postTop[right + 1]! - maxVal)) < tolerance) right++;
    impactRange = [topRange[1] + left, topRange[1] + right];
  }

  return {
    phases: {
      Address: [addressStart, addressEnd],
      Backswing: [swingStart, topRange[0]],
      Top: topRange,
      Downswing: [topRange[1], impactRange[0]],
      Impact: impactRange,
      "Follow Through": [impactRange[1], swingEnd],
    },
    swingStart, swingEnd, wristY, smoothed,
  };
}
