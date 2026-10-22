"use client";

import { useEffect, useRef, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { saveSwingSetupAction } from "@/app/actions";
import type { PoseFrame, SetupMarks } from "@/lib/golf/pose";
import type { MotionView } from "@/lib/golf/motion-analysis";
import { BodyOverlay } from "@/components/swing/body-overlay";
import { SwingTimingButton } from "@/components/swing/swing-timing";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type Point = [number, number];
const LABELS = { grip: "your hands on the grip", clubhead: "the clubhead behind the ball", ball: "the ball (optional)" } as const;

/**
 * The player confirms the tracked body is theirs on the paused setup frame and
 * taps the club, which the pose model cannot see. A second still copy of the
 * video keeps the main player free for replay.
 */
export function SwingSetup({ src, crossOrigin, frames, time, view, aspect, saved, sessionId, slowMotion = 1, revision }: {
  src: string; crossOrigin: boolean; frames: PoseFrame[]; time: number; view: MotionView; aspect: number;
  saved?: SetupMarks; sessionId: string;
  /** `time` is real swing seconds; the still video seeks to time × slowMotion. */
  slowMotion?: number;
  revision?: string;
}) {
  const router = useRouter();
  const still = useRef<HTMLVideoElement>(null);
  const [step, setStep] = useState<"confirm" | "wrong" | "mark">(saved ? "mark" : "confirm");
  const [draft, setDraft] = useState<Partial<SetupMarks>>(saved ?? {});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const at = saved?.t ?? time;
  useEffect(() => { setDraft(saved ?? {}); setStep(saved ? "mark" : "confirm"); }, [saved]);
  useEffect(() => { if (still.current && still.current.readyState >= 1) still.current.currentTime = at * slowMotion; }, [at, slowMotion]);
  const next = !draft.grip ? "grip" : !draft.clubhead ? "clubhead" : view === "face_on" && !draft.ball ? "ball" : null;
  const tap = (event: MouseEvent<HTMLDivElement>) => {
    if (step !== "mark" || !next || pending) return;
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 10000) / 10000;
    setDraft((current) => ({ ...current, [next]: [fraction((event.clientX - box.left) / box.width), fraction((event.clientY - box.top) / box.height)] }));
    setMessage(null);
  };
  const save = (setup: SetupMarks | null) => startTransition(async () => {
    const result = await saveSwingSetupAction({ swing_session_id: sessionId, setup, expectedRevision: revision ?? null });
    setMessage(result.message ?? (result.ok ? null : "Your setup could not be saved."));
    if (result.ok) router.refresh();
  });
  const { grip, clubhead, ball } = draft;
  const dot = (point: Point | undefined, fill: string) => point
    ? <circle cx={point[0] * aspect} cy={point[1]} r="0.014" fill={fill} stroke="#0b0f0c" strokeWidth="0.003" /> : null;

  return <details id="swing-setup" open={!saved} className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <summary className="min-h-8 cursor-pointer text-[13px] font-medium text-accent">Check your setup{saved ? " · checked" : ""}</summary>
    <p className="text-[12px] leading-relaxed text-fg-muted">
      {step === "confirm" ? "This is the setup frame the analysis measures from. Is the outline on you, with the joints on your body?"
        : step === "wrong" ? "If the outline is on someone else or off your body, record again with only you in the frame and your whole body visible. If the body is right but this is not your setup just before takeaway, adjust the timing."
        : next ? `On the picture, tap ${LABELS[next]}.`
        : saved && grip === saved.grip ? "These marks give the club readings in your analysis. Mark again if they are off."
        : "Save these marks to add the club readings to your analysis."}
    </p>
    <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-xl bg-black" style={{ aspectRatio: aspect }}>
      <video ref={still} src={src} crossOrigin={crossOrigin ? "anonymous" : undefined} muted playsInline preload="metadata" aria-label="Setup frame"
        className="absolute inset-0 h-full w-full object-contain" onLoadedMetadata={(event) => { event.currentTarget.currentTime = at * slowMotion; }} />
      <BodyOverlay frames={frames} time={at} view={view} aspect={aspect} plane={view === "down_the_line" && grip && clubhead ? { grip, clubhead } : undefined} />
      <svg viewBox={`0 0 ${aspect} 1`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        {grip && clubhead ? <line x1={grip[0] * aspect} y1={grip[1]} x2={clubhead[0] * aspect} y2={clubhead[1]} stroke="#7cc4ff" strokeWidth="0.006" strokeLinecap="round" /> : null}
        {dot(grip, "#7cc4ff")}{dot(clubhead, "#7cc4ff")}{dot(ball, "#f8fafc")}
      </svg>
      <div onClick={tap} className={cn("absolute inset-0", step === "mark" && next && "cursor-crosshair")} />
    </div>
    {step === "confirm" ? <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => setStep("mark")}>Yes, this is me</Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => setStep("wrong")}>No, it is wrong</Button>
    </div> : step === "wrong" ? <div className="flex flex-wrap gap-2">
      <ButtonLink href="/swing" size="sm">Record again</ButtonLink>
      <SwingTimingButton />
      <Button type="button" size="sm" variant="ghost" onClick={() => setStep("confirm")}>Back</Button>
    </div> : <div className="flex flex-wrap gap-2">
      {next === "ball" || !next ? <Button type="button" size="sm" disabled={pending || !grip || !clubhead || (saved && grip === saved.grip && ball === saved.ball)}
        onClick={() => save({ t: at, grip: grip!, clubhead: clubhead!, ...(ball ? { ball } : {}) })}>
        {pending ? "Saving…" : next === "ball" ? "Save without ball" : "Save setup"}</Button> : null}
      <Button type="button" size="sm" variant="secondary" disabled={pending || !grip} onClick={() => { setDraft({}); setMessage(null); }}>Mark again</Button>
      {saved ? <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => save(null)}>Remove marks</Button> : null}
    </div>}
    {message ? <p role="status" className="text-[12px] leading-relaxed text-fg-muted">{message}</p> : null}
  </details>;
}
