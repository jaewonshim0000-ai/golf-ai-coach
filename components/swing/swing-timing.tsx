"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retimeSwingAction } from "@/app/actions";
import { samplePosition } from "@/lib/golf/reconstruction";
import type { PoseModel, SwingPhases } from "@/lib/golf/pose";
import { Button } from "@/components/ui/primitives";
import { seekSwing, swingPlayer } from "@/components/swing/seek-button";

const PHASES = ["address", "top", "impact"] as const;
type Draft = Record<keyof SwingPhases, number | null>;

export function SwingTimingButton() {
  return <Button type="button" size="sm" variant="secondary" onClick={() => window.dispatchEvent(new Event("swing:timing"))}>Adjust swing timing</Button>;
}

/** Keep corrections beside the original video as well as the 3D replay. */
export function SwingTiming({ model, sessionId, unresolved }: { model: PoseModel; sessionId: string; unresolved: boolean }) {
  const router = useRouter();
  const details = useRef<HTMLDetailsElement>(null);
  const [position, setPosition] = useState(0);
  const [draft, setDraft] = useState<Draft>(unresolved ? { address: null, top: null, impact: null } : model.phases);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDraft(unresolved ? { address: null, top: null, impact: null } : model.phases);
  }, [model, unresolved]);
  useEffect(() => {
    const followVideo = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string; time: number }>).detail;
      if (detail?.id === sessionId) setPosition(samplePosition(model.t, detail.time));
    };
    const open = () => {
      if (details.current) details.current.open = true;
      requestAnimationFrame(() => details.current?.scrollIntoView({ block: "center", behavior: "smooth" }));
    };
    window.addEventListener("swing:frame", followVideo);
    window.addEventListener("swing:timing", open);
    return () => {
      window.removeEventListener("swing:frame", followVideo);
      window.removeEventListener("swing:timing", open);
    };
  }, [model.t, sessionId]);

  const seek = (index: number) => {
    seekSwing(model.t[index]!);
    setPosition(index);
  };
  const mark = (phase: keyof SwingPhases) => {
    const player = swingPlayer();
    const time = player ? player.video.currentTime / player.slowMotion : model.t[Math.round(position)]!;
    const index = Math.round(samplePosition(model.t, time));
    if (Math.abs(model.t[index]! - time) > 0.06) {
      setMessage("This position falls in a tracking gap. Choose a nearby tracked frame or rebuild the swing to read more frames.");
      return;
    }
    seek(index);
    setDraft((current) => ({ ...current, [phase]: index }));
    setMessage(null);
  };
  const { address, top, impact } = draft;
  const valid = address !== null && top !== null && impact !== null && address < top && top < impact;
  const save = () => {
    if (!valid) return;
    startTransition(async () => {
      const result = await retimeSwingAction({ swing_session_id: sessionId, phases: { address, top, impact }, expectedRevision: model.revision ?? null });
      setMessage(result.ok ? "Timing saved. Your analysis now uses these frames." : result.message ?? "The timing could not be saved.");
      if (result.ok) router.refresh();
    });
  };

  return <details ref={details} id="swing-timing" open={unresolved} className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <summary className="min-h-8 cursor-pointer text-[13px] font-medium text-accent">Adjust swing timing</summary>
    <p className="text-[12px] leading-relaxed text-fg-muted">{unresolved ? "Your body was tracked, but automatic timing needs a correction. " : ""}Pause the original video at setup just before takeaway, the top of the backswing, and contact. Mark each position, then update the analysis.</p>
    <label className="block text-[12px] text-fg-muted">Tracked frame · {(model.t[Math.round(position)]! - model.t[0]!).toFixed(2)}s
      <input type="range" aria-label="Swing timing frame" min={0} max={model.t.length - 1} step={1} value={Math.round(position)} disabled={pending} onChange={(event) => seek(Number(event.target.value))} className="mt-2 w-full accent-accent" />
    </label>
    <div className="grid gap-2 sm:grid-cols-3">{PHASES.map((phase) => <Button key={phase} type="button" size="sm" variant="secondary" disabled={pending} onClick={() => mark(phase)} className="justify-between capitalize">
      <span>Mark {phase}</span><span className="ml-2 tabular-nums text-fg-muted">{draft[phase] === null ? "—" : `${(model.t[draft[phase]!]! - model.t[0]!).toFixed(2)}s`}</span>
    </Button>)}</div>
    {!valid ? <p className="text-[11px] text-fg-muted">Mark address first, top second, and impact third.</p> : null}
    <Button type="button" size="sm" disabled={!valid || pending} onClick={save}>{pending ? "Updating analysis…" : "Use these frames"}</Button>
    {message ? <p role="status" className="text-[12px] leading-relaxed text-fg-muted">{message}</p> : null}
  </details>;
}
