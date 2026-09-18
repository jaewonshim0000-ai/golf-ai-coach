"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

import { createSwingSessionAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { putClip } from "@/lib/video-store";
import { CLUBS, CLUB_LABELS } from "@/types/golf";
import { cn } from "@/lib/utils";
import { Button, Field, Select } from "@/components/ui/primitives";

const ANGLES = [
  { value: "face_on", label: "Face on" },
  { value: "down_the_line", label: "Down the line" },
] as const;

/**
 * Record a swing.
 *
 * `capture` on a file input opens the phone's camera directly, which is the
 * whole recording screen for free - no getUserMedia, no permissions dance, no
 * custom recorder. The file never goes in the FormData (the input has no name,
 * so it is not serialised): it is written to this device's clip store once the
 * row exists and has an id to key it by.
 */
export function AddSwing() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createSwingSessionAction, IDLE);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const handled = useRef<string | null>(null);
  const errors = state.errors ?? {};

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  useEffect(() => {
    const id = state.ok ? state.id : undefined;
    if (!id || handled.current === id) return;
    handled.current = id;
    (async () => {
      if (file) await putClip({ id, blob: file, start: 0, end: 0 }).catch(() => undefined);
      setOpen(false);
      setFile(null);
      router.push(`/swing/${id}`);
    })();
  }, [state, file, router]);

  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Add video
      </Button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialog.current) setOpen(false);
        }}
        className="m-0 mt-auto max-h-[86svh] w-full max-w-none overflow-y-auto rounded-t-[22px] border border-border bg-surface p-0 text-fg shadow-[var(--shadow-card)] backdrop:bg-[rgb(9_14_10_/_0.5)] sm:m-auto sm:max-w-[460px] sm:rounded-[22px]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="dsp text-[15px] font-semibold tracking-[0.02em]">New swing</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-full p-1.5 text-fg-subtle hover:bg-surface-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form action={formAction} className="space-y-4 p-5">
          <input type="hidden" name="shot_type" value="full swing" />
          <input type="hidden" name="swing_pattern" value="unknown" />

          <fieldset>
            <legend className="dsp mb-2 text-[10px] tracking-[0.17em] text-fg-muted">Angle</legend>
            <div className="flex gap-2">
              {ANGLES.map((angle, index) => (
                <label
                  key={angle.value}
                  className="dsp flex-1 cursor-pointer rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-center text-[11px] tracking-[0.1em] text-fg-muted has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent"
                >
                  <input
                    type="radio"
                    name="camera_angle"
                    value={angle.value}
                    defaultChecked={index === 0}
                    className="sr-only"
                  />
                  {angle.label}
                </label>
              ))}
            </div>
            {errors.camera_angle ? (
              <p className="mt-1 text-[11px] text-bad">{errors.camera_angle}</p>
            ) : null}
          </fieldset>

          <Field label="Club" error={errors.club}>
            <Select name="club" defaultValue="7_iron">
              {CLUBS.map((club) => (
                <option key={club} value={club}>
                  {CLUB_LABELS[club]}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <label className="dsp mb-1.5 block text-[10px] tracking-[0.17em] text-fg-muted">
              Video
            </label>
            <input
              type="file"
              accept="video/*"
              capture="environment"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="w-full rounded-xl border border-border-strong bg-surface px-3 py-2.5 text-[13px] file:mr-3 file:rounded-full file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-[11px] file:text-fg"
            />
            <p className="mt-1.5 text-[10.5px] leading-[1.5] text-fg-subtle">
              Records with the camera on a phone. Stored on this device, not uploaded.
            </p>
          </div>

          {state.message && !state.ok ? (
            <p className={cn("rounded-lg px-3 py-2 text-[12px]", "bg-bad-soft text-bad")}>
              {state.message}
            </p>
          ) : null}

          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save swing
          </Button>
        </form>
      </dialog>
    </>
  );
}
