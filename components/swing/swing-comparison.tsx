"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button, ButtonLink, Select } from "@/components/ui/primitives";
import { browserClient } from "@/lib/db/supabase";
import { getClip } from "@/lib/video-store";
import { comparisonProgress, comparisonTime, type SwingComparison } from "@/lib/golf/swing-comparison";

export type ComparisonClip = { id: string; videoUrl: string | null; slowMotion: number };
export type ReferenceOption = { id: string; label: string };

function useClipSource(clip: ComparisonClip) {
  const [source, setSource] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true, objectUrl: string | null = null;
    const path = clip.videoUrl?.startsWith("supabase://swing-videos/") ? clip.videoUrl.slice("supabase://swing-videos/".length) : null;
    setSource(null); setError(null);
    async function load() {
      try {
        if (path) {
          const client = browserClient();
          if (!client) throw new Error("Sign in again to load this recording.");
          const result = await client.storage.from("swing-videos").createSignedUrl(path, 3600);
          if (result.error) throw new Error("This recording could not be loaded. Refresh to retry.");
          if (live) setSource(result.data.signedUrl);
        } else if (clip.videoUrl?.startsWith("https://")) {
          if (live) setSource(clip.videoUrl);
        } else {
          const id = clip.videoUrl?.startsWith("local://clip/") ? clip.videoUrl.slice("local://clip/".length) : clip.id;
          const found = await getClip(id);
          if (!found) throw new Error("This recording is unavailable on this device. Open the saved video and upload it again.");
          if (live) { objectUrl = URL.createObjectURL(found.blob); setSource(objectUrl); }
        }
      } catch (cause) { if (live) setError(cause instanceof Error ? cause.message : "The video could not be loaded."); }
    }
    void load();
    const refresh = path ? window.setInterval(() => void load(), 50 * 60 * 1000) : null;
    return () => { live = false; if (refresh) window.clearInterval(refresh); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [clip.id, clip.videoUrl]);
  return { source, error };
}

function ReferencePicker({ options, requested }: { options: ReferenceOption[]; requested?: string }) {
  const router = useRouter(), pathname = usePathname(), params = useSearchParams();
  const [pending, startTransition] = useTransition();
  return <label className="block text-[12px] text-fg-muted">Reference
    <Select aria-label="Comparison reference" className="mt-1" disabled={pending || !options.length} value={requested ?? ""} onChange={(event) => {
      const next = new URLSearchParams(params.toString());
      if (event.target.value) next.set("reference", event.target.value); else next.delete("reference");
      startTransition(() => router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false }));
    }}><option value="">Automatic match</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</Select>
    {pending ? <span role="status" className="mt-1 block">Matching reference…</span> : null}
  </label>;
}

function SynchronizedVideos({ user, reference, comparison }: { user: ComparisonClip; reference: ComparisonClip; comparison: SwingComparison }) {
  const userSource = useClipSource(user), referenceSource = useClipSource(reference);
  const userVideo = useRef<HTMLVideoElement>(null), refVideo = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState<[boolean, boolean]>([false, false]);
  const [progress, setProgress] = useState(0), [playing, setPlaying] = useState(false), [error, setError] = useState<string | null>(null);
  const a = comparison.userAnchors!, b = comparison.referenceAnchors!;
  const ready = loaded.every(Boolean) && !userSource.error && !referenceSource.error;
  function pause() { userVideo.current?.pause(); refVideo.current?.pause(); setPlaying(false); }
  function seek(next: number) {
    pause(); setProgress(next);
    if (userVideo.current) userVideo.current.currentTime = Math.min(userVideo.current.duration || Infinity, comparisonTime(a, next) * user.slowMotion);
    if (refVideo.current) refVideo.current.currentTime = Math.min(refVideo.current.duration || Infinity, comparisonTime(b, next) * reference.slowMotion);
  }
  async function play() {
    if (!ready || !userVideo.current || !refVideo.current) return;
    if (progress >= 2.99) seek(0);
    // Stop the separate main player so two copies do not play at once.
    document.querySelector<HTMLVideoElement>("video[data-swing-player]")?.pause();
    userVideo.current.playbackRate = user.slowMotion > 1 ? 1 : 0.5;
    try {
      setError(null);
      await Promise.all([userVideo.current.play(), refVideo.current.play()]);
      setPlaying(true);
    } catch { pause(); setError("Playback could not start. Use the synchronized slider to compare the frames."); }
  }
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const follow = () => {
      const left = userVideo.current, right = refVideo.current;
      if (!left || !right) return;
      const p = comparisonProgress(a, left.currentTime / user.slowMotion);
      setProgress(p);
      if (p >= 2.999 || left.ended) {
        left.pause(); right.pause(); left.currentTime = a[3] * user.slowMotion; right.currentTime = b[3] * reference.slowMotion;
        setProgress(3); setPlaying(false); return;
      }
      const section = Math.min(2, Math.floor(p));
      const rate = (b[section + 1]! - b[section]!) / (a[section + 1]! - a[section]!) * reference.slowMotion / user.slowMotion * left.playbackRate;
      right.playbackRate = Math.max(0.1, Math.min(4, rate));
      const target = comparisonTime(b, p) * reference.slowMotion;
      if (Math.abs(right.currentTime - target) > 0.08) right.currentTime = Math.min(right.duration, target);
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    const left = userVideo.current, right = refVideo.current;
    return () => { cancelAnimationFrame(frame); left?.pause(); right?.pause(); };
  }, [playing, a, b, user.slowMotion, reference.slowMotion]);
  const clips = [
    { clip: user, src: userSource, video: userVideo, label: "Your swing", anchors: a, mirror: false },
    { clip: reference, src: referenceSource, video: refVideo, label: comparison.referenceName, anchors: b, mirror: comparison.mirrorReference },
  ];
  return <div className="space-y-4">
    <div className="grid grid-cols-2 items-start gap-2 sm:gap-4">{clips.map((item, index) => <div key={item.clip.id}>
      <p className="mb-2 truncate text-[12px] font-semibold">{item.label}</p>
      <div className="overflow-hidden rounded-xl bg-black"><video ref={item.video} src={item.src.source ?? undefined} preload="metadata" muted playsInline
        aria-label={item.label} className="aspect-[3/4] w-full object-contain" style={item.mirror ? { transform: "scaleX(-1)" } : undefined}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          video.currentTime = Math.min(video.duration, item.anchors[0] * item.clip.slowMotion);
          setLoaded((previous) => index === 0 ? [true, previous[1]] : [previous[0], true]);
        }} onError={() => { pause(); setError(`The ${index === 0 ? "user" : "reference"} video cannot be played. Try an MP4 export.`); }} /></div>
      {item.src.error ? <p role="alert" className="mt-2 text-[12px] text-bad">{item.src.error}</p> : null}
    </div>)}
    </div>
    <label className="block text-[12px] text-fg-muted">Synchronized swing position
      <input aria-label="Synchronized swing position" type="range" min={0} max={3} step={0.01} value={progress} disabled={!ready} onChange={(event) => seek(Number(event.target.value))} className="mt-2 w-full accent-accent" />
    </label>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" disabled={!ready} onClick={() => playing ? pause() : void play()}>{playing ? "Pause" : "Play together"}</Button>
      {(["Setup", "Top", "Contact", "Follow-through"] as const).map((label, index) => <Button key={label} type="button" variant="secondary" size="sm" disabled={!ready} onClick={() => seek(index)}>{label}</Button>)}
    </div>
    {comparison.mirrorReference ? <p className="text-[11px] text-fg-subtle">Reference mirrored to line up the lead and trail sides.</p> : null}
    {error ? <p role="alert" className="text-[12px] text-bad">{error}</p> : null}
  </div>;
}

export function SwingComparisonPanel({ user, reference, comparison, options, requested, message }: {
  user: ComparisonClip; reference: ComparisonClip | null; comparison: SwingComparison | null;
  options: ReferenceOption[]; requested?: string; message?: string | null;
}) {
  const canReplay = comparison && reference && comparison.userAnchors && comparison.referenceAnchors && comparison.status !== "incompatible";
  return <details open={comparison?.status === "ready" || undefined} className="rounded-2xl border border-border bg-surface p-5">
    <summary className="min-h-10 cursor-pointer text-[15px] font-semibold">{comparison ? `Compare with ${comparison.referenceName}` : "Compare with a reference"}</summary>
    <div className="mt-3 space-y-4">
      <ReferencePicker options={options} requested={requested} />
      <p className="text-[12px] leading-relaxed text-fg-muted">{message ?? comparison?.message}</p>
      {canReplay ? <SynchronizedVideos key={`${user.id}:${reference.id}`} user={user} reference={reference} comparison={comparison} /> : null}
      {comparison && !canReplay ? <div className="flex flex-wrap gap-2"><ButtonLink href={`/swing/${comparison.referenceId}?reference=new`} variant="secondary" size="sm">Review reference timing</ButtonLink></div> : null}
      <ButtonLink href="/swing/references" variant="secondary" size="sm">Reference library</ButtonLink>
      {comparison?.status === "ready" ? <p className="text-[11px] text-fg-subtle">Differences describe this camera view. They do not by themselves establish a swing fault.</p> : null}
    </div>
  </details>;
}
