import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SwingVideo } from "@/components/swing/swing-video";
import { SwingAnalysis } from "@/components/swing/swing-analysis";
import { DeleteSwingButton } from "@/components/swing/delete-swing";
import { ButtonLink, PageHero } from "@/components/ui/primitives";
import { parseSlowMotion, slowMotionOf } from "@/lib/golf/pose";
import { swingFocusFingerprint } from "@/lib/ai/swing-focus";
import { getSwingFocus } from "@/lib/golf/swing-focus";
import { analyseVideoModel } from "@/lib/golf/video-review";
import { currentSwingModel } from "@/lib/golf/swing-reference";
import { loadSwingComparison } from "@/lib/swing-comparison";
import { SwingReferenceEditor } from "@/components/swing/reference-editor";
import { SwingComparisonPanel } from "@/components/swing/swing-comparison";
import { CLUB_LABELS } from "@/types/golf";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Swing review" };
export const dynamic = "force-dynamic";

export default async function SwingPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  /** `speed`: the playback slowdown picked when the clip was added. */
  searchParams: Promise<{ speed?: string; reference?: string }>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const user = await repo.currentUser();
  if (!user) return null;
  const state = await loadPlayerState(user.id);
  const session = state.swingSessions.find((s) => s.id === id);
  if (!session) notFound();
  const model = await repo.getSwingModel(user.id, id);
  const view = session.camera_angle === "face_on" || session.camera_angle === "down_the_line" ? session.camera_angle : "other";
  const current = currentSwingModel(model, session)
    ? { ...model, cameraAngle: model.cameraAngle ?? view } : null;
  const report = current ? analyseVideoModel(current) : null;
  const editingReference = search.reference === "new";
  const requestedReference = !editingReference && search.reference && search.reference.length <= 80 ? search.reference : undefined;
  const context = current && !editingReference ? await loadSwingComparison(user.id, session, current, requestedReference) : null;
  const selected = context?.selected;
  const focus = context?.comparison?.focus ?? (report ? getSwingFocus(report, current?.ballSide) : null);
  return <div className="space-y-5">
    <PageHero art="dusk" size="sm" className="mb-0" eyebrow={`Swing review · ${formatDate(session.created_at.slice(0, 10))}`}
      title={CLUB_LABELS[session.club]} action={editingReference && current ? <ButtonLink href="#swing-reference" variant="onHeroSolid" size="sm">Reference details</ButtonLink> : focus ? <ButtonLink href="#swing-analysis" variant="onHeroSolid" size="sm">View analysis</ButtonLink> : undefined}
      topLeft={<ButtonLink href="/swing" variant="onHero" size="sm"><ArrowLeft className="h-3.5 w-3.5" /> Swings</ButtonLink>} />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-lg"><SwingVideo id={id} videoUrl={session.video_url} clipStart={session.clip_start} clipEnd={session.clip_end}
        trimmable analysable model={model} cameraAngle={view} initialSlowMotion={parseSlowMotion(search.speed)} /></div>
      {editingReference && current ? <SwingReferenceEditor sessionId={id} saved={current.reference} handedness={current.handedness} initiallyOpen /> : focus && current ? <SwingAnalysis focus={focus} sessionId={id}
        referenceId={selected?.session.id}
        coachingKey={swingFocusFingerprint(current, session.club, null, selected ? { id: selected.session.id, model: selected.model } : undefined)} /> : <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-[18px] font-semibold">Analyze your swing video</h2>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">Get the biggest problem visible in your swing and step-by-step instructions to fix it.</p>
        <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">Use a face-on or down-the-line view, with setup and follow-through included.</p>
      </div>}
    </div>
    {current && context ? <SwingComparisonPanel key={swingFocusFingerprint(current, session.club, null, selected ? { id: selected.session.id, model: selected.model } : undefined)}
      user={{ id, videoUrl: session.video_url, slowMotion: slowMotionOf(current) }}
      reference={selected ? { id: selected.session.id, videoUrl: selected.session.video_url, slowMotion: slowMotionOf(selected.model) } : null}
      comparison={context.comparison} requested={requestedReference} message={context.message}
      options={context.references.map((ref) => ({ id: ref.session.id, label: `${ref.metadata.name} · ${CLUB_LABELS[ref.session.club]} · ${ref.session.camera_angle.replaceAll("_", " ")}` }))} /> : null}
    {current && !editingReference ? <SwingReferenceEditor sessionId={id} saved={current.reference} handedness={current.handedness} /> : null}
    <div className="flex justify-end pt-2"><DeleteSwingButton swingSessionId={id} /></div>
  </div>;
}
