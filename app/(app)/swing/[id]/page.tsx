import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Box } from "lucide-react";
import { SwingVideo } from "@/components/swing/swing-video";
import { SwingModel } from "@/components/swing/swing-model";
import { SwingAnalysis } from "@/components/swing/swing-analysis";
import { SwingStudio } from "@/components/swing/swing-studio";
import { SwingDiagnostic } from "@/components/swing/diagnostic";
import { MeasurementForm } from "@/components/swing/measurement-form";
import { DeleteSwingButton } from "@/components/swing/delete-swing";
import { ButtonLink, Card, CardContent, CardHeader, CardTitle, PageHero } from "@/components/ui/primitives";
import { analyseMotion } from "@/lib/golf/motion-analysis";
import { unpackFrames } from "@/lib/golf/pose";
import { CLUB_LABELS, labelize } from "@/types/golf";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Swing" };
export const dynamic = "force-dynamic";

export default async function SwingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await repo.currentUser();
  if (!user) return null;
  const state = await loadPlayerState(user.id);
  const session = state.swingSessions.find((candidate) => candidate.id === id);
  if (!session) notFound();
  const model = await repo.getSwingModel(user.id, session.id);
  const trimChanged = Boolean(model?.clip &&
    (Math.abs(model.clip[0] - (session.clip_start ?? 0)) > 0.1 || (session.clip_end !== null && Math.abs(model.clip[1] - session.clip_end) > 0.1)));
  const reconstruction = !trimChanged && model?.reconstructionVersion === 1 && model.frames.length === model.t.length ? model : null;
  const motion = reconstruction?.imageFrames && reconstruction.aspect ? analyseMotion(unpackFrames(reconstruction), reconstruction.aspect,
    reconstruction.cameraAngle ?? "other", reconstruction.handedness, reconstruction.phasesConfirmed ? reconstruction.phases : undefined) : null;
  const measurements = state.swingMeasurements.filter((row) => row.swing_session_id === id && row.source === "manual");
  const findings = state.swingFindings.filter((row) => row.swing_session_id === id && row.source === "manual");
  return <div className="space-y-5">
    <PageHero art="dusk" size="sm" className="mb-0" eyebrow={`${labelize(session.camera_angle)} · ${formatDate(session.created_at.slice(0, 10))}`}
      title={CLUB_LABELS[session.club]}
      action={reconstruction ? <ButtonLink href="#swing-analysis" variant="onHeroSolid" size="sm">View analysis</ButtonLink> : undefined}
      topLeft={<ButtonLink href="/swing" variant="onHero" size="sm"><ArrowLeft className="h-3.5 w-3.5" /> Swings</ButtonLink>}
    />
    <SwingStudio ready={Boolean(reconstruction)} video={<div className="mx-auto max-w-lg"><SwingVideo id={id} videoUrl={session.video_url} clipStart={session.clip_start} clipEnd={session.clip_end}
        trimmable analysable model={model}
        cameraAngle={session.camera_angle === "face_on" || session.camera_angle === "down_the_line" ? session.camera_angle : "other"}
      /></div>} reconstruction={reconstruction ? <SwingModel model={reconstruction} sessionId={id} /> : <Card>
        <CardHeader><CardTitle>Your swing in 3D</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex aspect-[16/10] flex-col items-center justify-center gap-3 rounded-xl bg-ink p-6 text-center text-ink-fg/70">
            <Box className="h-10 w-10" aria-hidden />
            <p className="text-[16px] font-semibold">Reconstruct your swing</p>
            <p className="max-w-xs text-[12px] leading-relaxed">Build a rotatable 3D body replay from your video, then see your swing score and coaching analysis.</p>
          </div>
          <p className="text-[12px] leading-relaxed text-fg-muted">{trimChanged ? "The trim changed. " : ""}Choose <strong>{model?.reconstructionVersion === 1 ? "Rebuild swing" : "Build 3D swing"}</strong> under the video. Include setup through follow-through with your full body in view.</p>
          <p className="text-[11px] leading-relaxed text-fg-subtle">The reconstruction uses an open-source body model on your device. Depth and hidden limbs are estimated from one camera.</p>
        </CardContent>
      </Card>} />
    {reconstruction && motion ? <SwingAnalysis model={reconstruction} report={motion} /> : null}
    <details className="rounded-2xl border border-border bg-surface p-4">
      <summary className="cursor-pointer text-[13px] font-medium text-accent">Coach notes and manual measurements</summary>
      <div className="mt-4 space-y-4">
        {findings.map((finding) => <div key={finding.id}><p className="text-[13px] font-semibold">{finding.issue}</p><p className="mt-1 text-[12px] text-fg-muted">{finding.description}</p></div>)}
        {measurements.length > 0 ? <SwingDiagnostic session={session} measurements={measurements} /> : null}
        <MeasurementForm sessionId={id} />
      </div>
    </details>
    <div className="flex justify-end pt-2"><DeleteSwingButton swingSessionId={id} /></div>
  </div>;
}
