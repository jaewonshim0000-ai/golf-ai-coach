"use client";

import { useEffect, useState } from "react";
import { getSwingCoachingAction } from "@/app/swing-coach-actions";
import type { FaceOnReview } from "@/lib/golf/face-on-review";
import type { FaceOnPractice } from "@/lib/ai/face-on-coach";

export function SwingCoach({ sessionId, practice }: { sessionId: string; practice: FaceOnReview["practice"] }) {
  const [selected, setSelected] = useState<FaceOnPractice | null>(null);
  useEffect(() => {
    let live = true;
    void getSwingCoachingAction(sessionId).then((result) => {
      if (live && result.ok && result.practice) setSelected(result.practice);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [sessionId]);
  const plan = selected ?? practice;
  return <div className="space-y-3 border-t border-border pt-4">
    <h3 className="text-[15px] font-semibold">Try this · {plan.title}</h3>
    <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-fg-muted">
      {plan.steps.map((step) => <li key={step}>{step}</li>)}
    </ol>
    <p className="text-[12px] leading-relaxed text-fg-muted">{plan.check}</p>
    <p className="text-[11px] text-fg-subtle">{selected?.source === "ai" ? "Exercise selected by Claude from the supported observations." : "Repeatability exercise based on your visible recording."}</p>
  </div>;
}
