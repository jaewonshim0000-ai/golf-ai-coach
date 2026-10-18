"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveBallFlightAction } from "@/app/actions";
import type { BallFlight } from "@/lib/golf/pose";
import { Button } from "@/components/ui/primitives";

/** "What did this shot do?" The camera cannot see the ball, so the player says. */
export function BallFlightQuestion({ sessionId, saved, handedness }: {
  sessionId: string; saved: BallFlight | null; handedness: "right" | "left";
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Partial<BallFlight>>(saved ?? {});
  const [editing, setEditing] = useState(!saved);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  useEffect(() => { setDraft(saved ?? {}); setEditing(!saved); }, [saved]);
  // A draw curves toward the player's lead side: left for a right-hander.
  const [drawSide, fadeSide] = handedness === "right" ? ["left", "right"] : ["right", "left"];
  const groups = [
    { key: "start", label: "Where did it start?", options: [["left", "Left"], ["straight", "Straight"], ["right", "Right"]] },
    { key: "curve", label: "How did it curve?", options: [["draw_hook", `Draw or hook (${drawSide})`], ["straight", "No curve"], ["fade_slice", `Fade or slice (${fadeSide})`]] },
    { key: "contact", label: "How did it feel off the face?", options: [["good", "Good"], ["fat", "Fat"], ["thin", "Thin"], ["toe", "Toe"], ["heel", "Heel"], ["unsure", "Not sure"]] },
  ] as const;
  const save = (ballFlight: BallFlight | null) => startTransition(async () => {
    const result = await saveBallFlightAction({ swing_session_id: sessionId, ballFlight });
    setMessage(result.message ?? (result.ok ? null : "Your answer could not be saved."));
    if (result.ok) router.refresh();
  });
  const complete = draft.start && draft.curve && draft.contact ? draft as BallFlight : null;

  return <div className="space-y-3 rounded-xl border border-border p-3">
    <h3 className="text-[13px] font-semibold">What did this shot do?</h3>
    {!editing && saved ? <>
      <p className="text-[12px] leading-relaxed text-fg-muted">Started {saved.start}, {saved.curve === "straight" ? "no curve" : saved.curve === "draw_hook" ? `draw or hook (${drawSide})` : `fade or slice (${fadeSide})`}, {saved.contact === "unsure" ? "contact not sure" : `${saved.contact} contact`}. The feedback below is ranked against this.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>Change</Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => save(null)}>Remove</Button>
      </div>
    </> : <>
      <p className="text-[12px] leading-relaxed text-fg-muted">The camera can't see the ball or the clubface. Your answer is the most useful thing the feedback can use.</p>
      {groups.map((group) => <div key={group.key}>
        <p className="dsp mb-1.5 text-[9px] tracking-[0.15em] text-fg-subtle">{group.label}</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={group.label}>
          {group.options.map(([value, label]) => <Button key={value} type="button" size="sm" aria-pressed={draft[group.key] === value}
            variant={draft[group.key] === value ? "primary" : "secondary"}
            onClick={() => setDraft((current) => ({ ...current, [group.key]: value }))}>{label}</Button>)}
        </div>
      </div>)}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={pending || !complete} onClick={() => complete && save(complete)}>{pending ? "Saving…" : "Save shot"}</Button>
        {saved ? <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setDraft(saved); setEditing(false); }}>Cancel</Button> : null}
      </div>
    </>}
    {message ? <p role="status" className="text-[12px] leading-relaxed text-fg-muted">{message}</p> : null}
  </div>;
}
