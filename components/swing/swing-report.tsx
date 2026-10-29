"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getSwingFeedbackAction } from "@/app/swing-coach-actions";
import type { SwingFeedback } from "@/lib/ai/swing-feedback";
import { PHASE_LABELS, SWING_PHASES, type BreakdownReading, type SwingBreakdown, type SwingPhaseName } from "@/lib/golf/swing-breakdown";
import { Badge, ButtonLink, Card, CardContent } from "@/components/ui/primitives";
import { Disclosure } from "@/components/ui/disclosure";
import { seekSwing } from "@/components/swing/seek-button";
import { cn } from "@/lib/utils";

const TONE: Record<SwingPhaseName, string> = {
  address: "bg-fg-subtle", backswing: "bg-info", top: "bg-gold", downswing: "bg-warn", impact: "bg-bad", follow_through: "bg-good",
};
const FILL: Record<SwingPhaseName, string> = {
  address: "fill-fg-subtle", backswing: "fill-info", top: "fill-gold", downswing: "fill-warn", impact: "fill-bad", follow_through: "fill-good",
};
const show = (time: number) => { if (seekSwing(time)) window.dispatchEvent(new Event("swing:review")); };

/**
 * The full swing report: GolfPosePro-style phases and hand path from the
 * measurements, and written coaching on top. Rules feedback shows at once;
 * AI feedback replaces it when it arrives.
 */
export function SwingReport({ sessionId, referenceId, initial, pending, breakdown, readings }: {
  sessionId: string; referenceId?: string; initial: SwingFeedback; pending: boolean;
  breakdown: SwingBreakdown | null; readings: BreakdownReading[];
}) {
  const [feedback, setFeedback] = useState(initial);
  const [writing, setWriting] = useState(pending);
  useEffect(() => {
    if (!pending) return;
    let live = true;
    void getSwingFeedbackAction(sessionId, referenceId)
      .then((result) => { if (live && result.ok && result.feedback) setFeedback(result.feedback); })
      .catch(() => undefined)
      .finally(() => { if (live) setWriting(false); });
    return () => { live = false; };
  }, [sessionId, referenceId, pending]);
  const start = (phase: SwingPhaseName) => breakdown?.phases.find((item) => item.name === phase)?.start;

  if (feedback.status === "needs_input") return <section id="swing-analysis" className="scroll-mt-6" aria-label="Swing analysis"><Card>
    <CardContent className="space-y-4 pt-5">
      <h2 className="text-[15px] font-semibold">Needs a clearer recording</h2>
      <p className="text-[18px] font-semibold leading-snug">{feedback.summary}</p>
      <ol className="list-decimal space-y-3 pl-5 text-[13px] leading-relaxed text-fg-muted">{feedback.practice.map((step) => <li key={step}>{step}</li>)}</ol>
      <ButtonLink href="/swing" size="sm">Record again</ButtonLink>
    </CardContent>
  </Card></section>;

  return <section id="swing-analysis" className="scroll-mt-6 space-y-3" aria-label="Swing analysis">
    <Card><CardContent className="space-y-5 pt-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold">Swing report</h2>
        <Badge tone={feedback.source === "ai" ? "accent" : "neutral"}>{feedback.source === "ai" ? "AI coach" : "Quick review"}</Badge>
      </div>
      {writing ? <p role="status" className="flex items-center gap-2 text-[12px] text-fg-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing detailed feedback from your measurements…</p> : null}
      <p className="text-[14px] leading-relaxed">{feedback.summary}</p>
      {breakdown ? <Phases breakdown={breakdown} /> : null}
      {breakdown && breakdown.handPath.length > 2 ? <HandPath breakdown={breakdown} /> : null}
    </CardContent></Card>

    {feedback.priorities.map((item, index) => <Card key={item.title}><CardContent className="space-y-3 pt-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[15px] font-semibold leading-snug"><span className="text-fg-subtle">{index + 1}.</span> {item.title}</h3>
        <button type="button" onClick={() => { const time = start(item.phase); if (time !== undefined) show(time); }}
          className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-accent">{PHASE_LABELS[item.phase]}</button>
      </div>
      <p className="text-[13px] leading-relaxed text-fg-muted">{item.evidence}</p>
      <p className="text-[13px] leading-relaxed">{item.why}</p>
      <div>
        <p className="text-[12px] font-semibold">How to fix it</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-fg-muted">{item.fix.map((step) => <li key={step}>{step}</li>)}</ol>
      </div>
      <p className="rounded-lg bg-accent-soft px-3 py-2 text-[12.5px] leading-relaxed"><span className="font-semibold">Drill: </span>{item.drill}</p>
    </CardContent></Card>)}

    {feedback.strengths.length ? <Card><CardContent className="pt-5">
      <h3 className="text-[15px] font-semibold">What is working</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-fg-muted">{feedback.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
    </CardContent></Card> : null}

    {feedback.phases.length ? <Disclosure title="Phase by phase" count={feedback.phases.length}>
      <ul className="space-y-3">{SWING_PHASES.flatMap((phase) => feedback.phases.filter((item) => item.phase === phase)).map((item) => <li key={item.phase + item.note} className="flex gap-3">
        <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE[item.phase])} />
        <p className="text-[13px] leading-relaxed"><span className="font-semibold">{PHASE_LABELS[item.phase]}. </span><span className="text-fg-muted">{item.note}</span></p>
      </li>)}</ul>
    </Disclosure> : null}

    {feedback.practice.length ? <Card><CardContent className="pt-5">
      <h3 className="text-[15px] font-semibold">Practice plan</h3>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-fg-muted">{feedback.practice.map((step) => <li key={step}>{step}</li>)}</ol>
    </CardContent></Card> : null}

    {readings.length ? <Disclosure title="All measurements" count={readings.length} description="Measured in the picture from the tracked body.">
      <table className="w-full text-left text-[12px]">
        <tbody>{SWING_PHASES.flatMap((phase) => readings.filter((row) => row.phase === phase)).map((row) => <tr key={row.id} className="border-t border-border">
          <td className="py-2 pr-2"><span className="block font-medium">{row.label}</span><span className="text-fg-subtle">{PHASE_LABELS[row.phase]}</span></td>
          <td className="py-2 text-right tabular-nums">{row.value}{row.unit.startsWith("°") ? "°" : "%"}{row.range ? <span className="block text-fg-subtle">{row.range[0]} to {row.range[1]}</span> : null}</td>
        </tr>)}</tbody>
      </table>
    </Disclosure> : null}

    {feedback.caveats.length ? <ul className="space-y-1 px-1 text-[11px] leading-relaxed text-fg-subtle">{feedback.caveats.map((item) => <li key={item}>{item}</li>)}</ul> : null}
  </section>;
}

function Phases({ breakdown }: { breakdown: SwingBreakdown }) {
  const { phases } = breakdown, first = phases[0]!.start, total = Math.max(0.01, phases.at(-1)!.end - first);
  return <div>
    <p className="text-[12px] font-semibold">Swing phases</p>
    <div aria-hidden className="mt-2 flex h-2.5 overflow-hidden rounded-full">
      {phases.map((phase) => <span key={phase.name} className={TONE[phase.name]} style={{ flexGrow: Math.max(phase.end - phase.start, total * 0.03), flexBasis: 0 }} />)}
    </div>
    <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
      {phases.map((phase) => <button key={phase.name} type="button" onClick={() => show(phase.start)}
        className="flex min-h-11 items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1.5 text-left text-[12px]">
        <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", TONE[phase.name])} />
        <span className="min-w-0 leading-tight">{PHASE_LABELS[phase.name]}<span className="block tabular-nums text-[11px] text-fg-subtle">{(phase.end - phase.start).toFixed(2)}s</span></span>
      </button>)}
    </div>
  </div>;
}

/** GolfPosePro's wrist chart: hand height through the swing over the phase bands. */
function HandPath({ breakdown }: { breakdown: SwingBreakdown }) {
  const { phases, handPath } = breakdown;
  const first = Math.min(phases[0]!.start, handPath[0]![0]), last = Math.max(phases.at(-1)!.end, handPath.at(-1)![0]);
  const top = Math.max(120, ...handPath.map(([, height]) => height)) + 10;
  const W = 320, H = 120, x = (time: number) => (time - first) / Math.max(0.01, last - first) * W, y = (height: number) => H - height / top * H;
  return <figure>
    <figcaption className="text-[12px] font-semibold">Hand height through the swing</figcaption>
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="mt-2 w-full" role="img"
      aria-label={`Hand height rises to ${Math.max(...handPath.map(([, height]) => height))}% of body height`}>
      {phases.map((phase) => <rect key={phase.name} x={x(phase.start)} y={0} width={Math.max(0.5, x(phase.end) - x(phase.start))} height={H} className={cn(FILL[phase.name], "opacity-15")} />)}
      <line x1={0} x2={W} y1={y(100)} y2={y(100)} className="stroke-fg-subtle" strokeDasharray="3 3" strokeWidth={0.75} />
      <text x={W - 2} y={y(100) - 3} textAnchor="end" className="fill-fg-subtle text-[8px]">head height</text>
      <polyline points={handPath.map(([time, height]) => `${x(time).toFixed(1)},${y(height).toFixed(1)}`).join(" ")} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" />
      <text x={0} y={H + 11} className="fill-fg-subtle text-[8px]">0s</text>
      <text x={W} y={H + 11} textAnchor="end" className="fill-fg-subtle text-[8px]">{(last - first).toFixed(2)}s</text>
    </svg>
  </figure>;
}
