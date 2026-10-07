"use client";

import type { PoseFrame } from "@/lib/golf/pose";
import { overlayFrameAtTime, motionGeometry, visibleHands, visiblePoint, type MotionView } from "@/lib/golf/motion-analysis";

const BONES: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24],
  [23, 25], [25, 27], [24, 26], [26, 28], [27, 29], [29, 31], [28, 30], [30, 32],
];
export function BodyOverlay({ frames, time, guide, view = "other", aspect = 1 }: { frames: PoseFrame[]; time: number; guide?: PoseFrame; view?: MotionView; aspect?: number }) {
  const frame = overlayFrameAtTime(frames, time);
  if (!frame?.imageLandmarks) return null;
  const points = frame.imageLandmarks;
  // Separate segments stop a lost hand from drawing a line across a gap.
  const trails: { from: { x: number; y: number }; to: { x: number; y: number }; opacity: number }[] = [];
  frames.forEach((current, index) => {
    const previous = frames[index - 1];
    if (!previous || current.t > time || current.t < time - 0.6 || current.t - previous.t > 0.12) return;
    const a = visibleHands(previous, aspect), b = visibleHands(current, aspect);
    if (a && b) trails.push({ from: { x: a.x / aspect, y: a.y }, to: { x: b.x / aspect, y: b.y }, opacity: 0.2 + (1 - (time - current.t) / 0.6) * 0.6 });
  });
  const geometry = motionGeometry(frames, 1, view);
  const guideHip = guide ? geometry.hips(guide) : null;
  const guideShoulder = guide ? geometry.shoulders(guide) : null;
  const guideHead = guide ? geometry.head(guide) : null;
  return <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
    {guideHip ? <line x1={guideHip.x} x2={guideHip.x} y1="0" y2="1" stroke="#3fc1a5" strokeWidth="0.003" strokeDasharray="0.012 0.01" opacity="0.6" /> : null}
    {guideHead ? <line x1={guideHead.x} x2={guideHead.x} y1="0" y2="1" stroke="#e6b85c" strokeWidth="0.002" strokeDasharray="0.01 0.012" opacity="0.4" /> : null}
    {view === "down_the_line" && guideHip && guideShoulder ? <line x1={guideHip.x} y1={guideHip.y} x2={guideShoulder.x} y2={guideShoulder.y} stroke="#ff7a59" strokeWidth="0.003" strokeDasharray="0.012 0.01" opacity="0.6" /> : null}
    {trails.map((trail, index) => <line key={index} x1={trail.from.x} y1={trail.from.y} x2={trail.to.x} y2={trail.to.y} stroke="#e6b85c" strokeWidth="0.004" opacity={trail.opacity} />)}
    {BONES.map(([from, to]) => {
      const a = points[from], b = points[to];
      if (!visiblePoint(a) || !visiblePoint(b)) return null;
      return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={from === 11 && to === 12 ? "#ff7a59" : from === 23 && to === 24 ? "#3fc1a5" : "#f8fafc"} strokeWidth="0.0045" strokeLinecap="round" />;
    })}
    {[0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].map((joint) => {
      const point = points[joint];
      return visiblePoint(point) ? <circle key={joint} data-joint={joint} cx={point.x} cy={point.y} r="0.005" fill="#e6b85c" /> : null;
    })}
  </svg>;
}
