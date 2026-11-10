"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, X } from "lucide-react";
import { saveCalibrationSwingAction } from "@/app/calibration-actions";
import { captureGolfPosePro } from "@/lib/golfposepro/capture";
import { packFrames } from "@/lib/golf/pose";
import { detectView } from "@/lib/golf/framing";
import { VIDEO_ACCEPT } from "@/lib/video-upload";
import { cn } from "@/lib/utils";
import { Button, Input, Select } from "@/components/ui/primitives";

type Row = { id: string; file: File; score: string; note: string; handedness: "right" | "left"; status: string | null; saved: boolean };

/** Pick many clips, score each out of 100, then read and save them one by one
 * with the same GolfPosePro analysis a swing upload gets. */
export function CalibrationUpload() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const update = (id: string, change: Partial<Row>) => setRows((all) => all.map((row) => row.id === id ? { ...row, ...change } : row));

  async function read(row: Row) {
    const element = video.current!;
    const url = URL.createObjectURL(row.file);
    try {
      update(row.id, { status: "Loading the video" });
      await new Promise<void>((resolve, reject) => {
        element.onloadeddata = () => resolve();
        element.onerror = () => reject(new Error("This browser cannot play this video. Try an MP4."));
        element.src = url;
      });
      // Frame callbacks stop when the player is offscreen or the tab is hidden.
      element.scrollIntoView({ block: "center", behavior: "instant" });
      const { fps, analysed } = await captureGolfPosePro(element, 0, element.duration,
        (done, total) => update(row.id, { status: `Reading frame ${done} of ${total}` }));
      if (!analysed || analysed.track.length < 8) throw new Error("No swing found. Keep the whole body and hands in view from setup through the finish.");
      const packed = packFrames(analysed.track);
      const aspect = element.videoWidth / element.videoHeight;
      const address = analysed.result.keyFrames[0]!.pose?.map(([x, y, visibility]) => ({ x, y, z: 0, visibility }));
      const saved = await saveCalibrationSwingAction({
        name: row.file.name, score: Number(row.score), note: row.note.trim() || undefined, handedness: row.handedness,
        t: packed.t, imageFrames: packed.imageFrames, aspect,
        cameraAngle: (address && detectView([address], aspect)) ?? "face_on",
        clip: [0, element.duration], golfPosePro: analysed.result,
      });
      update(row.id, { status: `${saved.message} Read at ${fps} fps.`, saved: saved.ok });
      if (saved.ok) router.refresh();
    } catch (error) {
      update(row.id, { status: error instanceof Error ? error.message : "Could not read this clip." });
    } finally {
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
    }
  }

  async function run(event: FormEvent) {
    event.preventDefault();
    setRunning(true);
    for (const row of rows.filter((item) => !item.saved)) await read(row);
    setRunning(false);
  }

  const waiting = rows.filter((row) => !row.saved).length;
  return <form onSubmit={run} className="space-y-4">
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant={rows.length ? "secondary" : "primary"} disabled={running} onClick={() => picker.current?.click()}><Upload className="h-4 w-4" /> Choose clips</Button>
      {rows.some((row) => row.saved) && !running ? <Button type="button" variant="ghost" size="sm" onClick={() => setRows((all) => all.filter((row) => !row.saved))}>Clear saved</Button> : null}
    </div>
    <input ref={picker} aria-label="Choose swing clips" type="file" multiple accept={VIDEO_ACCEPT} hidden onChange={(event) => {
      const files = [...(event.target.files ?? [])];
      setRows((all) => [...all, ...files.map((file): Row => ({ id: crypto.randomUUID(), file, score: "", note: "", handedness: "right", status: null, saved: false }))]);
      event.target.value = "";
    }} />
    {rows.length ? <ul className="divide-y divide-border">{rows.map((row) => <li key={row.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_96px_140px_36px] sm:items-center">
      <p className="break-words text-[13px] font-medium">{row.file.name}</p>
      <Input type="number" inputMode="numeric" min={0} max={100} step={1} required placeholder="Score" aria-label={`Your score for ${row.file.name}`}
        value={row.score} disabled={running || row.saved} onChange={(event) => update(row.id, { score: event.target.value })} />
      <Select aria-label={`Golfer's hand in ${row.file.name}`} value={row.handedness} disabled={running || row.saved}
        onChange={(event) => update(row.id, { handedness: event.target.value as Row["handedness"] })}>
        <option value="right">Right-handed</option><option value="left">Left-handed</option>
      </Select>
      <Button type="button" variant="ghost" size="icon" disabled={running} aria-label={`Remove ${row.file.name}`}
        onClick={() => setRows((all) => all.filter((item) => item.id !== row.id))}><X className="h-4 w-4" /></Button>
      <Input className="sm:col-span-4" maxLength={1000} placeholder="Why this score? (optional)" aria-label={`Why you gave ${row.file.name} this score`}
        value={row.note} disabled={running || row.saved} onChange={(event) => update(row.id, { note: event.target.value })} />
      {row.status ? <p role="status" className={cn("text-[12px] sm:col-span-4", row.saved ? "text-fg-muted" : "text-fg")}>{row.status}</p> : null}
    </li>)}</ul> : <p className="text-[13px] text-fg-muted">Choose one or more swing videos, each with one full swing and the whole body in view.</p>}
    {/* Visible while reading: browsers only report frames for a player on screen. */}
    <video ref={video} muted playsInline preload="auto" className={cn("w-full max-w-sm rounded-xl bg-black", !running && "hidden")} />
    {waiting ? <Button type="submit" disabled={running}>{running ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {running ? "Reading clips. Keep this tab in view." : `Analyze and save ${waiting} ${waiting === 1 ? "clip" : "clips"}`}</Button> : null}
  </form>;
}
