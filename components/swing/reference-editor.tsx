"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveSwingReferenceAction } from "@/app/swing-reference-actions";
import type { SwingReferenceMetadata } from "@/lib/golf/swing-reference";
import { Button, Field, Input, Select } from "@/components/ui/primitives";

export function SwingReferenceEditor({ sessionId, saved, handedness, initiallyOpen = false }: {
  sessionId: string; saved?: SwingReferenceMetadata; handedness: "right" | "left"; initiallyOpen?: boolean;
}) {
  const router = useRouter(), [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null), [ok, setOk] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await saveSwingReferenceAction(sessionId, { name: data.get("name"), kind: data.get("kind"),
        handedness: data.get("handedness"), source: data.get("source"), permission: data.get("permission") === "on" });
      setMessage(result.message); setOk(result.ok);
      if (result.ok) { router.push("/swing/references"); router.refresh(); }
    });
  }
  return <details id="swing-reference" open={initiallyOpen || undefined} className="scroll-mt-6 rounded-2xl border border-border bg-surface p-5">
    <summary className="min-h-9 cursor-pointer text-[14px] font-semibold">{saved ? "Manage reference" : "Use this recording as a reference"}</summary>
    <form onSubmit={submit} className="mt-3 grid gap-4 sm:grid-cols-2">
      <Field label="Golfer or reference name"><Input name="name" required minLength={2} maxLength={80} defaultValue={saved?.name} placeholder="Coach Alex · 7 iron" disabled={pending} /></Field>
      <Field label="Reference type"><Select name="kind" defaultValue={saved?.kind ?? "professional"} disabled={pending}>
        <option value="professional">Professional golfer</option><option value="coach">Coach demonstration</option><option value="personal">My own reference swing</option>
      </Select></Field>
      <Field label="Golfer's handedness"><Select name="handedness" defaultValue={saved?.handedness ?? handedness} disabled={pending}>
        <option value="right">Right handed</option><option value="left">Left handed</option>
      </Select></Field>
      <Field label="Source or credit (optional)"><Input name="source" maxLength={300} defaultValue={saved?.source} placeholder="Coach, source or license credit" disabled={pending} /></Field>
      <label className="flex items-start gap-2 text-[12px] leading-relaxed text-fg-muted sm:col-span-2"><input name="permission" type="checkbox" required defaultChecked={saved?.permission} disabled={pending} className="mt-1 accent-accent" />I own this video or have permission to use it as a private reference.</label>
      <div className="flex flex-wrap gap-3 sm:col-span-2">
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving…" : "Save reference"}</Button>
        {saved ? <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => startTransition(async () => {
          const result = await saveSwingReferenceAction(sessionId, null);
          setMessage(result.message); setOk(result.ok); if (result.ok) router.refresh();
        })}>Remove reference</Button> : null}
      </div>
      {message ? <p role={ok ? "status" : "alert"} className={`text-[12px] sm:col-span-2 ${ok ? "text-good" : "text-bad"}`}>{message}</p> : null}
    </form>
  </details>;
}
