"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Loader2, Plus, Upload, X } from "lucide-react";
import { createSwingSessionAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { putClip, deleteClip } from "@/lib/video-store";
import { browserClient } from "@/lib/db/supabase";
import { validateVideo, VIDEO_ACCEPT } from "@/lib/video-upload";
import { CLUBS, CLUB_LABELS } from "@/types/golf";
import { Button, Field, Select } from "@/components/ui/primitives";

export function AddSwing() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  function chooseFile(next: File | null) {
    setFile(next);
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
      router.push(`/swing/${result.id}`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your video. Please try again.");
      if (!saved && storedPath && sb) await sb.storage.from("swing-videos").remove([storedPath]);
      if (!saved && localId) await deleteClip(localId).catch(() => undefined);
    } finally { setPending(false); }
  }

  return <>
    <Button type="button" size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add video</Button>
    <dialog ref={dialog} aria-labelledby="new-swing-title" onClose={() => setOpen(false)} onCancel={(event) => { if (pending) event.preventDefault(); }}
      className="m-0 mt-auto max-h-[86svh] w-full max-w-none overflow-y-auto rounded-t-[22px] border border-border bg-surface p-0 text-fg shadow-[var(--shadow-card)] backdrop:bg-[rgb(9_14_10_/_0.5)] sm:m-auto sm:max-w-[460px] sm:rounded-[22px]">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 id="new-swing-title" className="font-semibold">New swing</h2>
        <Button type="button" variant="ghost" size="icon" disabled={pending} onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></Button>
      </div>
      <form onSubmit={save} className="space-y-4 p-5">
        <input type="hidden" name="shot_type" value="full swing" />
        <input type="hidden" name="swing_pattern" value="unknown" />
        <Field label="Camera angle"><Select name="camera_angle" disabled={pending}><option value="face_on">Face on</option><option value="down_the_line">Down the line</option></Select></Field>
        <Field label="Club"><Select name="club" defaultValue="7_iron" disabled={pending}>{CLUBS.map((club) => <option key={club} value={club}>{CLUB_LABELS[club]}</option>)}</Select></Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={() => upload.current?.click()}><Upload className="h-4 w-4" /> Upload video</Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={() => camera.current?.click()}><Camera className="h-4 w-4" /> Record video</Button>
        </div>
        <input ref={upload} aria-label="Upload swing video" type="file" accept={VIDEO_ACCEPT} hidden onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
        <input ref={camera} aria-label="Record swing video" type="file" accept="video/*" capture="environment" hidden onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
        {file ? <p className="break-words text-sm">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</p> : null}
        <p className="text-xs text-fg-muted">MP4, MOV, or WebM, up to 50 MB. {browserClient() ? "Saved privately to your account." : "Demo clips are saved on this device only."} After saving, choose Analyze movement to track your joints on the video. Use a fixed camera and keep your whole body visible.</p>
        {error ? <p role="alert" className="rounded-lg bg-bad-soft p-3 text-sm text-bad">{error}</p> : null}
        <Button type="submit" disabled={pending || !file}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{pending ? "Uploading and saving…" : "Save swing"}</Button>
      </form>
    </dialog>
  </>;
}
