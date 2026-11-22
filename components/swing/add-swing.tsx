"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Camera, Loader2, Lock, Plus, Upload, X } from "lucide-react";
import { createSwingSessionAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { putClip, deleteClip } from "@/lib/video-store";
import { browserClient } from "@/lib/db/supabase";
import { validateVideo, VIDEO_ACCEPT } from "@/lib/video-upload";
import { CLUBS, CLUB_LABELS, type Club } from "@/types/golf";
import { ActionBar, Button, barButton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { canRecordInApp, FilmingGuide, SwingCamera } from "@/components/swing/swing-camera";
import { UpgradeButton } from "@/components/billing/plan";
import { limitMessage, type Plan } from "@/lib/billing/plans";

/**
 * Camera view and slow-motion speed are detected when the swing is reviewed.
 * `left` is this month's remaining swing analyses (null: no cap); at zero the
 * dialog explains the limit before anything is uploaded.
 */
/* Short names for the club chips. */
const SHORT_CLUB: Partial<Record<Club, string>> = {
  driver: "Driver", "3_wood": "3W", "5_wood": "5W", "2_hybrid": "2H", "3_hybrid": "3H", "4_hybrid": "4H",
  "3_iron": "3-Iron", "4_iron": "4-Iron", "5_iron": "5-Iron", "6_iron": "6-Iron", "7_iron": "7-Iron", "8_iron": "8-Iron", "9_iron": "9-Iron",
  pw: "PW", gw: "GW", sw: "SW", lw: "LW",
};

export function AddSwing({ reference = false, left = null, plan = "premium", autoOpen = false }: { reference?: boolean; left?: number | null; plan?: Plan; autoOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  /** Recorded in the app (at this frame rate) rather than uploaded. */
  const [recorded, setRecorded] = useState<{ fps: number | null } | null>(null);
  const [filming, setFilming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  function chooseFile(next: File | null, fromCamera: { fps: number | null } | null = null) {
    setFile(next);
    setRecorded(next ? fromCamera : null);
    setError(next ? validateVideo(next) : null);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const validation = file ? validateVideo(file) : "Choose or record a video first.";
    if (validation || !file) { setError(validation); return; }
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const sb = browserClient();
    let storedPath: string | null = null;
    let localId: string | null = null;
    let saved = false;
    try {
      if (sb) {
        const { data: auth, error: authError } = await sb.auth.getUser();
        if (authError || !auth.user) throw new Error("Sign in again before uploading your swing.");
        const extension = file.name.split(".").pop()?.toLowerCase() || "mp4";
        storedPath = `${auth.user.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await sb.storage.from("swing-videos").upload(storedPath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
        data.set("video_url", `supabase://swing-videos/${storedPath}`);
      } else {
        localId = crypto.randomUUID();
        await putClip({ id: localId, blob: file, start: 0, end: 0 });
        data.set("video_url", `local://clip/${localId}`);
      }
      const result = await createSwingSessionAction(IDLE, data);
      if (!result.ok || !result.id) throw new Error(result.message || "Could not save the swing. Try again.");
      saved = true;
      setOpen(false);
      setFile(null);
      setRecorded(null);
      router.push(`/swing/${result.id}${reference ? "?reference=new" : ""}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your video. Please try again.");
      if (!saved && storedPath && sb) await sb.storage.from("swing-videos").remove([storedPath]);
      if (!saved && localId) await deleteClip(localId).catch(() => undefined);
    } finally { setPending(false); }
  }

  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const [club, setClub] = useState<Club>("7_iron");
  const steps = ["Video uploaded", "Swing phases found", "Measuring body positions", "Writing your report"];

  return <>
    {reference ? (
      <button type="button" onClick={() => setOpen(true)}
        className="press-lg flex aspect-[3/4] w-full flex-col items-center justify-center gap-3 rounded-[22px] border-[1.5px] border-dashed border-[#a9ad9f]">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white"><Plus className="h-5 w-5" strokeWidth={2.4} /></span>
        <span className="dsp text-[11px]">Add reference</span>
      </button>
    ) : (
      <Button type="button" onClick={() => setOpen(true)} className="h-[50px] px-5 text-[13px]">
        <Camera className="h-4 w-4" /> Record
      </Button>
    )}
    <dialog ref={dialog} aria-labelledby="new-swing-title" onClose={() => setOpen(false)} onCancel={(event) => { if (pending) event.preventDefault(); }}
      className="m-0 h-[100dvh] max-h-none w-full max-w-none overflow-y-auto bg-bg p-0 text-fg backdrop:bg-[rgb(9_14_10_/_0.5)] sm:m-auto sm:h-auto sm:max-h-[90svh] sm:max-w-[460px] sm:rounded-[28px]">
      <div className="flex min-h-full flex-col gap-4 px-5 pb-32 pt-[max(1.25rem,env(safe-area-inset-top))] sm:pb-6">
        <div className="flex items-center justify-between gap-3">
          <button type="button" disabled={pending} onClick={() => setOpen(false)} aria-label="Close"
            className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface disabled:opacity-40">
            <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </button>
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg-muted">
            <Lock className="h-3.5 w-3.5" /> {browserClient() ? "Saved privately to your account" : "Saved on this device only"}
          </span>
        </div>
        <h2 id="new-swing-title" className="dsp text-[46px] leading-[0.98]">
          {reference ? <>Add a<br />reference</> : file ? <>Analyse<br />your swing</> : <>Record a<br />swing</>}
        </h2>
        {left === 0 ? (
          <div className="flex flex-col gap-4 rounded-[22px] bg-surface p-5">
            <p className="text-[14px] leading-relaxed">{limitMessage(plan, "swing")}</p>
            {plan === "free" ? <UpgradeButton /> : null}
          </div>
        ) : (
        <form id="new-swing" onSubmit={save} className="flex flex-col gap-4">
          <input type="hidden" name="shot_type" value="full swing" />
          <input type="hidden" name="swing_pattern" value="unknown" />
          {/* Replaced by the detected view when the swing is reviewed. */}
          <input type="hidden" name="camera_angle" value="face_on" />
          <input type="hidden" name="club" value={club} />

          {preview ? (
            <div className="relative overflow-hidden rounded-[28px] bg-[#2b3a1f]">
              <video src={preview} muted playsInline loop autoPlay className="aspect-[16/9] w-full object-cover" />
              <span className="absolute bottom-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-bold text-white">
                {recorded ? `Recorded${recorded.fps ? ` · ${recorded.fps} fps` : ""}` : file?.name} · {((file?.size ?? 0) / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" disabled={pending} onClick={() => canRecordInApp() ? setFilming(true) : camera.current?.click()}
                className="press-lg flex flex-col items-start gap-1.5 rounded-[22px] bg-ink p-4 text-left text-white">
                <Camera className="h-5 w-5 text-gold" />
                <span className="font-display text-[18px] uppercase">Record</span>
                <span className="text-[12px] leading-snug text-[#c9ccbf]">In slow motion, phone on a stand</span>
              </button>
              <button type="button" disabled={pending} onClick={() => upload.current?.click()}
                className="press-lg flex flex-col items-start gap-1.5 rounded-[22px] bg-surface p-4 text-left">
                <Upload className="h-5 w-5" />
                <span className="font-display text-[18px] uppercase">Upload</span>
                <span className="text-[12px] leading-snug text-fg-subtle">A slow-mo video from your camera</span>
              </button>
            </div>
          )}
          <input ref={upload} aria-label="Upload swing video" type="file" accept={VIDEO_ACCEPT} hidden onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
          {/* Where the browser cannot record, the phone's own camera app does. Its speed is detected like an upload. */}
          <input ref={camera} aria-label="Record swing video" type="file" accept="video/*" capture="environment" hidden onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />

          <fieldset>
            <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">Club</legend>
            <div role="radiogroup" aria-label="Club" className="no-bar -mx-5 flex gap-2 overflow-x-auto px-5">
              {CLUBS.filter((option) => option !== "putter").map((option) => (
                <button key={option} type="button" role="radio" aria-checked={club === option} disabled={pending} onClick={() => setClub(option)}
                  className={cn("press h-10 shrink-0 rounded-full px-4 text-[13px] font-semibold", club === option ? "bg-accent text-white" : "border-[1.5px] border-fg")}>
                  {SHORT_CLUB[option] ?? CLUB_LABELS[option]}
                </button>
              ))}
            </div>
          </fieldset>

          {file ? (
            <ol aria-label="Analysis progress" className="flex flex-col gap-3 rounded-[28px] bg-surface p-4">
              {steps.map((step, index) => {
                const active = pending && index === 0;
                return (
                  <li key={step} className="flex items-center gap-3">
                    {active ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-surface-2 border-t-accent motion-safe:animate-spin" />
                    ) : (
                      <span className="h-7 w-7 rounded-full border-[1.5px] border-dashed border-[#a9ad9f]" />
                    )}
                    <span className={cn("text-[15px]", active ? "font-bold" : "text-fg-subtle")}>{step}</span>
                  </li>
                );
              })}
              <li className="text-[12px] text-fg-subtle">The rest runs on the review screen as soon as the video loads.</li>
            </ol>
          ) : null}

          {left !== null ? <p className="text-[12.5px] font-semibold">{left} swing {left === 1 ? "analysis" : "analyses"} left this month.</p> : null}
          <p className="text-[12px] leading-relaxed text-fg-subtle">MP4, MOV, or WebM, up to 50 MB. Camera view, slow-motion speed and swing timing are detected automatically after saving.</p>
          {error ? <p role="alert" className="rounded-2xl bg-bad-soft p-3 text-[13px] text-bad">{error}</p> : null}
          {file ? <button type="button" disabled={pending} onClick={() => chooseFile(null)} className="self-start text-[12.5px] font-semibold text-accent">Choose another video</button> : null}
          <details className="text-[13px]">
            <summary className="cursor-pointer font-semibold">How to film for the best analysis</summary>
            <div className="mt-3"><FilmingGuide /></div>
          </details>
          <ActionBar>
            <Button type="submit" form="new-swing" disabled={pending || !file} className={cn(barButton, pending && "bg-[#c9ccbf] text-fg")}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {pending ? "Uploading and saving…" : file ? "Save and analyse" : "Record or upload first"}
            </Button>
          </ActionBar>
        </form>
        )}
      </div>
    </dialog>
    <SwingCamera open={filming} onClose={() => setFilming(false)} onUse={(next, fps) => chooseFile(next, { fps })} onUpload={() => upload.current?.click()} />
  </>;
}
