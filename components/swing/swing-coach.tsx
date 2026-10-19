"use client";

import { useEffect, useState } from "react";
import { getSwingCoachingAction } from "@/app/swing-coach-actions";
import type { SwingFocus } from "@/lib/golf/swing-focus";
import { Card, CardContent } from "@/components/ui/primitives";
import { SwingTimingButton } from "./swing-timing";

export function SwingCoach({ sessionId, focus }: { sessionId: string; focus: SwingFocus }) {
  const [selected, setSelected] = useState<SwingFocus | null>(null);
  useEffect(() => {
    if (!focus.id) return;
    let live = true;
    void getSwingCoachingAction(sessionId).then((result) => {
      if (live && result.ok && result.focus?.id === focus.id) setSelected(result.focus);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [sessionId, focus.id]);
  const plan = selected ?? focus;
  const hasIssue = plan.status === "issue";
  return <Card>
    <CardContent className="space-y-6 pt-5">
      <div>
        <h2 className="text-[15px] font-semibold">{hasIssue ? "Biggest problem" : plan.status === "clear" ? "Swing review" : "Complete your analysis"}</h2>
        <p className="mt-2 text-[18px] font-semibold leading-snug">{plan.issue}</p>
      </div>
      <div className="border-t border-border pt-5">
        <h2 className="text-[15px] font-semibold">{hasIssue ? "How to fix it" : "What to do next"}</h2>
        <ol className="mt-3 list-decimal space-y-3 pl-5 text-[13px] leading-relaxed text-fg-muted">
          {plan.steps.map((step) => <li key={step}>{step}</li>)}
        </ol>
        {plan.action === "timing" ? <div className="mt-4"><SwingTimingButton /></div> : null}
      </div>
    </CardContent>
  </Card>;
}
