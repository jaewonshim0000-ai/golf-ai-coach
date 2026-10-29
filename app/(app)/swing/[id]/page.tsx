import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { SwingVideo } from "@/components/swing/swing-video";
import { SwingReport } from "@/components/swing/swing-report";
import { DeleteSwingButton } from "@/components/swing/delete-swing";
import { ButtonLink, PageHero } from "@/components/ui/primitives";
import { slowMotionOf } from "@/lib/golf/pose";
import { rulesFeedback, savedSwingFeedback, swingFacts, swingFeedbackKey } from "@/lib/ai/swing-feedback";
import { getProvider } from "@/lib/ai/provider";
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
/** Room for the written feedback request, which this page's action runs. */
export const maxDuration = 60;

export default async function SwingPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reference?: string }>;
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
  const editingReference = search.reference === "new";
  const requestedReference = !editingReference && search.reference && search.reference.length <= 80 ? search.reference : undefined;
  const context = current && !editingReference ? await loadSwingComparison(user.id, session, current, requestedReference) : null;
  const selected = context?.selected;
  const facts = current && !editingReference ? swingFacts(current, session.club, context?.comparison) : null;
  const aiModel = getProvider().model;
  const key = current ? swingFeedbackKey(current, session.club, aiModel, selected ? { id: selected.session.id, model: selected.model } : undefined) : null;
  const saved = current && key ? savedSwingFeedback(current, key) : null;
  const feedback = facts ? saved ?? rulesFeedback(facts) : null;
  return <div className="space-y-5">
    <PageHero art="dusk" size="sm" className="mb-0" eyebrow={`Swing review · ${formatDate(session.created_at.slice(0, 10))}`}
      title={CLUB_LABELS[session.club]} action={editingReference && current ? <ButtonLink href="#swing-reference" variant="onHeroSolid" size="sm">Reference details</ButtonLink> : feedback ? <ButtonLink href="#swing-analysis" variant="onHeroSolid" size="sm">View analysis</ButtonLink> : undefined}
      topLeft={<ButtonLink href="/swing" variant="onHero" size="sm"><ArrowLeft className="h-3.5 w-3.5" /> Swings</ButtonLink>} />
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-lg"><SwingVideo id={id} videoUrl={session.video_url} clipStart={session.clip_start} clipEnd={session.clip_end}
        analysable model={model} /></div>
      {editingReference && current ? <SwingReferenceEditor sessionId={id} saved={current.reference} handedness={current.handedness} initiallyOpen /> : facts && feedback ? <SwingReport key={key} sessionId={id} referenceId={selected?.session.id}
        initial={feedback} pending={!saved && Boolean(aiModel) && feedback.status !== "needs_input"}
        breakdown={facts.breakdown} readings={facts.readings} /> : <div className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="text-[18px] font-semibold">Analyze your swing video</h2>
        <p className="mt-3 text-[13px] leading-relaxed text-fg-muted">Get a full breakdown of your swing phases and positions, with detailed coaching on what to fix and how.</p>
        <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">Camera view, slow-motion speed and swing timing are detected automatically. The review starts as soon as the video loads.</p>
      </div>}
    </div>
    {current && context ? <SwingComparisonPanel key={key}
      user={{ id, videoUrl: session.video_url, slowMotion: slowMotionOf(current) }}
      reference={selected ? { id: selected.session.id, videoUrl: selected.session.video_url, slowMotion: slowMotionOf(selected.model) } : null}
      comparison={context.comparison} requested={requestedReference} message={context.message}
      options={context.references.map((ref) => ({ id: ref.session.id, label: `${ref.metadata.name} · ${CLUB_LABELS[ref.session.club]} · ${ref.session.camera_angle.replaceAll("_", " ")}` }))} /> : null}
    {current && !editingReference ? <SwingReferenceEditor sessionId={id} saved={current.reference} handedness={current.handedness} /> : null}
    <div className="flex justify-end pt-2"><DeleteSwingButton swingSessionId={id} /></div>
  </div>;
}
