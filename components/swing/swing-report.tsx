"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSwingFeedbackAction } from "@/app/swing-coach-actions";
import type { SwingFeedback } from "@/lib/ai/swing-feedback";
import { GPP_PHASES, type GppPhase } from "@/lib/golfposepro/phases";
import { frameTime, type GolfPoseProResult } from "@/lib/golfposepro/result";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { Disclosure } from "@/components/ui/disclosure";
import { seekSwing } from "@/components/swing/seek-button";
import { cn } from "@/lib/utils";

/** GolfPosePro's plot colors for its six phases. */
const COLOR: Record<GppPhase, string> = {
  Address: "#808080", Backswing: "#1f4fd8", Top: "#f28c28", Downswing: "#2e9e44", Impact: "#d62728", "Follow Through": "#8e44ad",
};
const show = (time: number) => { if (seekSwing(time)) window.dispatchEvent(new Event("swing:review")); };
/** MediaPipe's pose connections, without the face. */
const BONES: [number, number][] = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29],
  [29, 31], [27, 31], [24, 26], [26, 28], [28, 30], [30, 32], [28, 32], [15, 17], [15, 19], [17, 19], [16, 18], [16, 20], [18, 20]];

/**
 * GolfPosePro's compare_swing_phases frames: the middle frame of each phase
 * with the detected pose drawn on it, read from the player's own video.
 * The same JPEGs go to the coach. Null entries when a frame cannot be read.
 */
function useKeyFrames(result: GolfPoseProResult) {
  const [frames, setFrames] = useState<(string | null)[] | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      let player: HTMLVideoElement | null = null;
      for (let wait = 0; wait < 60 && live; wait++) {
        player = document.querySelector<HTMLVideoElement>("video[data-swing-player]");
        if (player?.currentSrc && player.readyState >= 1) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!live || !player?.currentSrc) { if (live) setFrames([]); return; }
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      if (player.crossOrigin !== null) video.crossOrigin = "anonymous";
      video.src = player.currentSrc;
      await new Promise((resolve) => { video.onloadeddata = resolve; video.onerror = resolve; setTimeout(resolve, 10000); });
      const drawn: (string | null)[] = [];
      for (const key of result.keyFrames) {
        try {
          await new Promise((resolve) => { video.onseeked = resolve; setTimeout(resolve, 3000); video.currentTime = (result.startFrame + key.frame + 0.5) / result.fps; });
          const width = 360, height = Math.round(width * (video.videoHeight || result.height) / (video.videoWidth || result.width));
          const canvas = Object.assign(document.createElement("canvas"), { width, height });
          const context = canvas.getContext("2d")!;
          context.drawImage(video, 0, 0, width, height);
          if (key.pose) {
            const seen = (i: number) => key.pose![i]![2] >= 0.5;
            context.lineWidth = 3; context.strokeStyle = "rgba(255,255,255,0.9)";
            for (const [a, b] of BONES) if (seen(a) && seen(b)) {
              context.beginPath(); context.moveTo(key.pose[a]![0] * width, key.pose[a]![1] * height); context.lineTo(key.pose[b]![0] * width, key.pose[b]![1] * height); context.stroke();
            }
            key.pose.forEach(([x, y], i) => {
              if (!seen(i) || (i > 0 && i < 11)) return;
              context.fillStyle = i % 2 ? "#ff7a1a" : "#22d3ee";
              context.beginPath(); context.arc(x * width, y * height, 4, 0, Math.PI * 2); context.fill();
            });
          }
          drawn.push(canvas.toDataURL("image/jpeg", 0.75));
        } catch { drawn.push(null); } // A storage host without CORS taints the canvas.
      }
      video.removeAttribute("src");
      if (live) setFrames(drawn);
    })();
    return () => { live = false; };
  }, [result]);
  return frames;
}

/**
 * The swing report: GolfPosePro's phases, wrist trajectory and key frames,
 * with comprehensive coaching written from exactly those values and frames.
 */
export function SwingReport({ sessionId, result, initial, pending }: {
  sessionId: string; result: GolfPoseProResult; initial: SwingFeedback; pending: boolean;
}) {
  const [feedback, setFeedback] = useState(initial);
  const [writing, setWriting] = useState(pending);
  const frames = useKeyFrames(result);
  useEffect(() => {
    if (!pending || frames === null) return;
    let live = true;
    const images = frames.flatMap((url) => url ? [url.slice(url.indexOf(",") + 1)] : []);
    void getSwingFeedbackAction(sessionId, images.length === GPP_PHASES.length ? images : [])
      .then((response) => { if (live && response.ok && response.feedback) setFeedback(response.feedback); })
      .catch(() => undefined)
      .finally(() => { if (live) setWriting(false); });
    return () => { live = false; };
  }, [sessionId, pending, frames]);

  return <section id="swing-analysis" className="scroll-mt-6 space-y-3" aria-label="Swing analysis">
    <Card><CardContent className="space-y-5 pt-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Swing report</h2>
          <p className="text-[11px] text-fg-subtle">Analyzed with GolfPosePro · {result.wristY.length} frames at {Math.round(result.fps)} fps</p>
        </div>
        <Badge tone={feedback.source === "ai" ? "accent" : "neutral"}>{feedback.source === "ai" ? "AI coach" : "Quick review"}</Badge>
      </div>
      {writing ? <p role="status" className="flex items-center gap-2 text-[12px] text-fg-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing your analysis from GolfPosePro’s results…</p> : null}
      <p className="text-[14px] leading-relaxed">{feedback.summary}</p>
      <Phases result={result} />
      <WristTrajectory result={result} />
    </CardContent></Card>

    <Card><CardContent className="pt-5">
      <h3 className="text-[15px] font-semibold">Swing phases</h3>
      <p className="mt-1 text-[12px] text-fg-muted">The middle frame of each phase, with the pose GolfPosePro detected.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {result.keyFrames.map((key, index) => <button key={key.phase} type="button" onClick={() => show(frameTime(result, key.frame))} className="text-left">
          <div className="overflow-hidden rounded-lg bg-surface-2" style={{ aspectRatio: `${result.width} / ${result.height}` }}>
            {frames?.[index] ? <img src={frames[index]!} alt={`${key.phase}, frame ${key.frame}`} className="h-full w-full object-cover" />
              : <div className="flex h-full items-center justify-center text-[11px] text-fg-subtle">{frames === null ? "Drawing…" : "Frame unavailable"}</div>}
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] font-medium"><span aria-hidden className="h-2 w-2 rounded-full" style={{ background: COLOR[key.phase] }} />{key.phase}<span className="text-fg-subtle">· frame {key.frame}</span></p>
        </button>)}
      </div>
    </CardContent></Card>

    {feedback.priorities.map((item, index) => <Card key={item.title}><CardContent className="space-y-3 pt-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold leading-snug"><span className="text-fg-subtle">{index + 1}.</span> {item.title}</h3>
        <PhaseButton result={result} phase={item.phase} />
      </div>
      <p className="text-[13px] leading-relaxed text-fg-muted">{item.evidence}</p>
      <p className="text-[13px] leading-relaxed">{item.why}</p>
      <div>
        <p className="text-[12px] font-semibold">How to fix it</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-fg-muted">{item.fix.map((step) => <li key={step}>{step}</li>)}</ol>
      </div>
    </CardContent></Card>)}

    {feedback.practice.length ? <Card id="swing-practice"><CardContent className="pt-5">
      <h3 className="text-[15px] font-semibold">Your practice list</h3>
      <p className="mt-1 text-[12px] text-fg-muted">What to practise for the best result, most important first.</p>
      <ol className="mt-4 space-y-4">{feedback.practice.map((item, index) => {
        const drill = item.drill ? DRILLS_BY_ID.get(item.drill) : undefined;
        return <li key={item.title} className="space-y-2 border-t border-border pt-4 first:border-0 first:pt-0">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[14px] font-semibold leading-snug"><span className="text-fg-subtle">{index + 1}.</span> {item.title}</p>
            <PhaseButton result={result} phase={item.phase} />
          </div>
          <p className="text-[13px] leading-relaxed text-fg-muted">{item.why}</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed">{item.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-[12.5px] leading-relaxed"><span className="font-semibold">Dose: </span>{item.dose}</p>
          {drill ? <p className="text-[12px] leading-relaxed text-fg-subtle">Library drill: {drill.name} · track {drill.metric_to_track.toLowerCase()}, aim for {Math.round(drill.success_threshold * 100)}%
            {drill.equipment_required.length ? ` · needs ${drill.equipment_required.join(", ")}` : ""}</p> : null}
        </li>;
      })}</ol>
    </CardContent></Card> : null}

    {feedback.strengths.length ? <Card><CardContent className="pt-5">
      <h3 className="text-[15px] font-semibold">What is working</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-fg-muted">{feedback.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
    </CardContent></Card> : null}

    {feedback.phases.length ? <Disclosure title="Phase by phase" count={feedback.phases.length}>
      <ul className="space-y-3">{GPP_PHASES.flatMap((phase) => feedback.phases.filter((item) => item.phase === phase)).map((item) => <li key={item.phase + item.note} className="flex gap-3">
        <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR[item.phase] }} />
        <p className="text-[13px] leading-relaxed"><span className="font-semibold">{item.phase}. </span><span className="text-fg-muted">{item.note}</span></p>
      </li>)}</ul>
    </Disclosure> : null}

    {feedback.caveats.length ? <ul className="space-y-1 px-1 text-[11px] leading-relaxed text-fg-subtle">{feedback.caveats.map((item) => <li key={item}>{item}</li>)}</ul> : null}
  </section>;
}

function PhaseButton({ result, phase }: { result: GolfPoseProResult; phase: GppPhase }) {
  return <button type="button" onClick={() => show(frameTime(result, result.phases[phase][0]))}
    className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-accent">{phase}</button>;
}

function Phases({ result }: { result: GolfPoseProResult }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-1.5">
    {GPP_PHASES.map((phase) => {
      const [start, end] = result.phases[phase];
      return <button key={phase} type="button" onClick={() => show(frameTime(result, start))}
        className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-left text-[12px]">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR[phase] }} />
        <span className="min-w-0 leading-tight">{phase}<span className="block tabular-nums text-[11px] text-fg-subtle">frames {start}–{end} · {((end - start) / result.fps).toFixed(2)}s</span></span>
      </button>;
    })}
  </div>;
}

/** GolfPosePro's "Wrist Trajectory with Dynamic Phase Detection", around the swing. */
function WristTrajectory({ result }: { result: GolfPoseProResult }) {
  const from = Math.max(0, result.phases.Address[1] - Math.round(result.fps)), to = Math.min(result.wristY.length - 1, result.swingEnd + Math.round(result.fps / 2));
  const points = result.wristY.slice(from, to + 1).flatMap((y, n): [number, number][] => y === null ? [] : [[from + n, y]]);
  if (points.length < 3) return null;
  const top = Math.min(...points.map(([, y]) => y)), bottom = Math.max(...points.map(([, y]) => y));
  const W = 320, H = 110, x = (frame: number) => (frame - from) / Math.max(1, to - from) * W;
  // Flipped like the notebook: higher wrists plot higher.
  const y = (wrist: number) => 6 + (wrist - top) / Math.max(1, bottom - top) * (H - 12);
  return <figure>
    <figcaption className="text-[12px] font-semibold">Wrist trajectory</figcaption>
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="mt-2 w-full" role="img" aria-label={`Wrist height from frame ${from} to ${to}, with GolfPosePro's six phases shaded`}>
      {GPP_PHASES.map((phase) => {
        const [start, end] = result.phases[phase];
        const left = x(Math.max(from, Math.min(start, end))), right = x(Math.min(to, Math.max(start, end)));
        return right > left ? <rect key={phase} x={left} y={0} width={right - left} height={H} fill={COLOR[phase]} opacity={0.25} /> : null;
      })}
      <polyline points={points.map(([frame, wrist]) => `${x(frame).toFixed(1)},${y(wrist).toFixed(1)}`).join(" ")} fill="none" className={cn("stroke-fg")} strokeWidth={1.5} strokeLinejoin="round" />
      <text x={0} y={H + 11} className="fill-fg-subtle text-[8px]">frame {from}</text>
      <text x={W} y={H + 11} textAnchor="end" className="fill-fg-subtle text-[8px]">frame {to}</text>
    </svg>
  </figure>;
}
