import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SwingVideo } from "@/components/swing/swing-video";
import { SwingAnalysis } from "@/components/swing/swing-analysis";
import { DeleteSwingButton } from "@/components/swing/delete-swing";
import { ButtonLink, PageHero } from "@/components/ui/primitives";
import { compareFaceOn, reviewFaceOn } from "@/lib/golf/face-on-review";
import { unpackFrames, type PoseModel } from "@/lib/golf/pose";
import { faceOnFingerprint } from "@/lib/ai/face-on-coach";
import { analyseVideoModel } from "@/lib/golf/video-review";
import { setupReadings } from "@/lib/golf/setup-marks";
import { CLUB_LABELS } from "@/types/golf";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Swing review" };
export const dynamic = "force-dynamic";

function matchesTrim(model: PoseModel, start: number | null, end: number | null) {
  return !model.clip || (Math.abs(model.clip[0] - (start ?? 0)) <= 0.1 && (end === null || Math.abs(model.clip[1] - end) <= 0.1));
}
export default async function SwingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await repo.currentUser();
  if (!user) return null;
  const state = await loadPlayerState(user.id);
  const session = state.swingSessions.find((s) => s.id === id);
  if (!session) notFound();
  const model = await repo.getSwingModel(user.id, id);
  const current = model?.imageFrames && model.aspect && matchesTrim(model, session.clip_start, session.clip_end) ? model : null;
  const view = session.camera_angle === "face_on" || session.camera_angle === "down_the_line" ? session.camera_angle : "other";
  const review = current ? reviewFaceOn(unpackFrames(current), current.aspect!, current.cameraAngle ?? view) : null;
  const report = current ? analyseVideoModel(current) : null;
  let comparison: string | null = null, previousHref: string | undefined;
  if (review && review.status !== "record_again" && review.scope === "backswing") {
    const candidates = state.swingSessions.filter((s) => s.id !== id && s.club === session.club && s.camera_angle === "face_on" && s.created_at < session.created_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
    const previous = await Promise.allSettled(candidates.map((s) => repo.getSwingModel(user.id, s.id)));
    for (let n = 0; n < previous.length; n++) {
      const result = previous[n]!, candidate = candidates[n]!;
      if (result.status !== "fulfilled") continue;
      const earlier = result.value;
      if (!earlier?.imageFrames || !earlier.aspect || !matchesTrim(earlier, candidate.clip_start, candidate.clip_end)) continue;
      comparison = compareFaceOn(review, reviewFaceOn(unpackFrames(earlier), earlier.aspect, earlier.cameraAngle ?? "face_on"));
      if (comparison) { previousHref = `/swing/${candidate.id}`; break; }
    }
  }
  const notes = state.swingFindings.filter((f) => f.swing_session_id === id && f.source === "manual");
  return <div className="space-y-5">
    <PageHero art="dusk" size="sm" className="mb-0" eyebrow={`Swing review · ${formatDate(session.created_at.slice(0, 10))}`}
      title={CLUB_LABELS[session.club]} action={review ? <ButtonLink href="#swing-analysis" variant="onHeroSolid" size="sm">View analysis</ButtonLink> : undefined}
      topLeft={<ButtonLink href="/swing" variant="onHero" size="sm"><ArrowLeft className="h-3.5 w-3.5" /> Swings</ButtonLink>} />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-lg"><SwingVideo id={id} videoUrl={session.video_url} clipStart={session.clip_start} clipEnd={session.clip_end}
        trimmable analysable model={model} cameraAngle={view} /></div>
      {review && report && current ? <SwingAnalysis review={review} report={report} phaseTimes={report.phases ? {
        address: current.t[report.phases.address]!, top: current.t[report.phases.top]!, impact: current.t[report.phases.impact]!,
      } : null} setup={setupReadings(current)} comparison={comparison} previousHref={previousHref} sessionId={id}
        coachingKey={faceOnFingerprint(review, session.club, null)} /> : <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-[18px] font-semibold">Analyze your swing video</h2>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">Your recording is reviewed automatically for visible posture, body movement and swing timing. The guides stay on your original video so you can check each observation.</p>
        <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">Use a face-on or down-the-line view, with setup and follow-through included.</p>
      </div>}
    </div>
    {notes.length ? <details className="rounded-2xl border border-border bg-surface p-4"><summary className="min-h-10 cursor-pointer text-[13px] font-medium text-accent">Saved coach notes</summary>
      {notes.map((f) => <div key={f.id} className="mt-3"><p className="text-[13px] font-semibold">{f.issue}</p><p className="mt-1 text-[12px] text-fg-muted">{f.description}</p></div>)}
    </details> : null}
    <div className="flex justify-end pt-2"><DeleteSwingButton swingSessionId={id} /></div>
  </div>;
}
