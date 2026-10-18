"use client";

import { useEffect, useState } from "react";
import { getFaultCoachingAction } from "@/app/swing-coach-actions";
import type { FeedbackCard, SwingFeedback } from "@/lib/golf/faults";
import type { FaultCoaching } from "@/lib/ai/fault-coach";
import { Badge } from "@/components/ui/primitives";
import { SwingSeekButton } from "./seek-button";

/** The rule-ranked cards show at once; Claude's wording replaces the explanation when it arrives. */
export function FaultFeedback({ sessionId, feedback, reported }: { sessionId: string; feedback: SwingFeedback; reported: boolean }) {
  const [coaching, setCoaching] = useState<FaultCoaching | null>(null);
  useEffect(() => {
    let live = true;
    if (feedback.primary) void getFaultCoachingAction(sessionId).then((result) => {
      if (live && result.ok && result.coaching?.source === "ai") setCoaching(result.coaching);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [sessionId, feedback.primary]);
  const cards = [feedback.primary, feedback.secondary].filter((card): card is FeedbackCard => Boolean(card));
  return <div className="space-y-3 border-t border-border pt-4">
    <p className="text-[12px] leading-relaxed text-fg-muted">{feedback.note}</p>
    {cards.map((card, index) => <FaultCardView key={card.id} card={card} main={index === 0} reported={reported}
      written={coaching?.explanations.find((row) => row.id === card.id)} />)}
    {cards.length ? <p className="text-[11px] text-fg-subtle">{coaching ? "Explanation worded by Claude from the measured evidence; the ranking, drills and checks come from the app's rules." : "Ranked by the app's rules from the measured evidence and your shot."} Thresholds are provisional until checked against coach-labelled swings.</p> : null}
  </div>;
}

function FaultCardView({ card, main, reported, written }: { card: FeedbackCard; main: boolean; reported: boolean; written?: { drill: string; text: string } }) {
  const lead = written ? card.drills.find((drill) => drill.id === written.drill) : undefined;
  const drills = lead ? [lead, ...card.drills.filter((drill) => drill !== lead)] : card.drills;
  return <article className="space-y-2 rounded-xl border border-border p-3" aria-label={card.title}>
    <div className="flex flex-wrap gap-2">
      <Badge tone={main ? "accent" : "neutral"}>{main ? "Main focus" : "Also worth working on"}</Badge>
      <Badge tone={card.confidence === "medium" ? "neutral" : "warn"}>{card.confidence === "medium" ? "Medium confidence" : "Low confidence"}</Badge>
    </div>
    <h3 className="text-[15px] font-semibold">{card.title}</h3>
    <div className="text-[12px] leading-relaxed text-fg-muted">
      <p><span className="font-medium text-fg">What we saw.</span> {card.seen}</p>
      {card.condition ? <p className="mt-1 text-[11px] text-fg-subtle">Check line (provisional): {card.condition}.</p> : null}
      {card.time !== null ? <SwingSeekButton time={card.time} /> : null}
    </div>
    <p className="text-[12px] leading-relaxed text-fg-muted"><span className="font-medium text-fg">{reported ? "Why it fits your miss." : "Why it matters."}</span> {written?.text ?? card.why}</p>
    {drills.map((drill) => <div key={drill.id} className="rounded-xl bg-surface-2 p-3">
      <p className="text-[13px] font-semibold">Drill · {drill.name}</p>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-[12px] leading-relaxed text-fg-muted">{drill.steps.map((step) => <li key={step}>{step}</li>)}</ol>
    </div>)}
    <p className="text-[12px] leading-relaxed text-fg-muted"><span className="font-medium text-fg">Feel.</span> {card.feel}</p>
    <p className="text-[12px] leading-relaxed text-fg-muted"><span className="font-medium text-fg">Check it next recording.</span> {card.check}</p>
  </article>;
}
