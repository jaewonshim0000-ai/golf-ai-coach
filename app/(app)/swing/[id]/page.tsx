import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { SwingVideo } from "@/components/swing/swing-video";
import { SwingResultCard } from "@/components/swing/swing-result";
import { AnalysisProgress } from "@/components/swing/analysis-progress";
import { DeleteSwingButton } from "@/components/swing/delete-swing";
import { PhaseStrip } from "@/components/swing/phase-strip";
import { ActionBar, ButtonLink, RoundButton, Sheet, barButton } from "@/components/ui/primitives";
import { slowMotionOf } from "@/lib/golf/pose";
import { GPP_VERSION, frameTime } from "@/lib/golfposepro/result";
import { swingResult } from "@/lib/swing/result";
import { currentSwingModel } from "@/lib/golf/swing-reference";
import { loadSwingComparison } from "@/lib/swing-comparison";
import { SwingReferenceEditor } from "@/components/swing/reference-editor";
import { SwingComparisonPanel } from "@/components/swing/swing-comparison";
import { ComparisonAdvice } from "@/components/swing/comparison-advice";
import { CLUB_LABELS, labelize } from "@/types/golf";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { relativeDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Swing review" };
export const dynamic = "force-dynamic";

/* The four stops of the design's phase strip, from GolfPosePro's six phases. */
const STOPS = [
  ["Address", "Address"],
  ["Top", "Top"],
  ["Impact", "Impact"],
  ["Follow Through", "Finish"],
] as const;

export default async function SwingPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reference?: string }>;
}) {
  const [{ id }, search] = await Promise.all([params, searchParams]);
  const user = await repo.currentUser();
  if (!user) return null;
  const [state, model] = await Promise.all([loadPlayerState(user.id), repo.getSwingModel(user.id, id)]);
  const session = state.swingSessions.find((s) => s.id === id);
  if (!session) notFound();
  const view = session.camera_angle === "face_on" || session.camera_angle === "down_the_line" ? session.camera_angle : "other";
  const current = currentSwingModel(model, session)
    ? { ...model, cameraAngle: model.cameraAngle ?? view } : null;
  const editingReference = search.reference === "new";
  const requestedReference = !editingReference && search.reference && search.reference.length <= 80 ? search.reference : undefined;
  const context = current && !editingReference ? await loadSwingComparison(user.id, session, current, requestedReference) : null;
  const selected = context?.selected;
  // A swing read by anything older than the current GolfPosePro is read again by the player.
  const gpp = current?.golfPosePro?.version === GPP_VERSION ? current.golfPosePro : null;
  const result = gpp && !editingReference ? swingResult(current!) : null;
  const stops = gpp
    ? STOPS.flatMap(([phase, label]) => {
        const key = gpp.keyFrames.find((frame) => frame.phase === phase);
        return key ? [{ label, at: frameTime(gpp, key.frame) }] : [];
      })
    : [];
  const fixGoal = result?.drills[0]?.id;

  // The score against the player's previous swing from the same side.
  const previous = [...state.swingSessions]
    .filter((other) => other.camera_angle === session.camera_angle && other.created_at < session.created_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  let lastChange: number | null = null;
  if (result?.score != null && previous && !current?.reference) {
    const before = (await repo.getSwingModels(user.id, [previous.id])).get(previous.id) ?? null;
    const fresh = currentSwingModel(before, previous) && before.golfPosePro?.version === GPP_VERSION && !before.reference;
    const score = fresh ? swingResult(before).score : null;
    if (score !== null) lastChange = Math.round((result.score - score) * 10) / 10;
  }

  return (
    <div className="flex flex-col">
      <div className="relative -mx-4 -mt-5 overflow-hidden bg-[#2a3820] px-5 pb-12 pt-5 text-white md:-mx-8 md:-mt-8 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <RoundButton href="/swing" tone="hero" label="Back to Swing">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
          <h1 className="inline-flex h-9 min-w-0 items-center rounded-full bg-[rgb(20_24_15_/_0.55)] px-3.5 text-[11px] font-bold uppercase tracking-[0.1em]">
            <span className="truncate">
              {CLUB_LABELS[session.club]} · {labelize(session.camera_angle)} · {relativeDays(session.created_at.slice(0, 10))}
            </span>
          </h1>
          <RoundButton href={context?.comparison ? "#compare" : "/swing/references"} tone="hero" label="Compare with your best">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="8" height="14" rx="2" />
              <rect x="13" y="5" width="8" height="14" rx="2" />
            </svg>
          </RoundButton>
        </div>
        <div className="mx-auto mt-4 w-full max-w-sm">
          <SwingVideo id={id} videoUrl={session.video_url} clipStart={session.clip_start} clipEnd={session.clip_end} analysable model={model} />
        </div>
      </div>

      <Sheet className="[--bar-fade:var(--c-surface)]">
        {stops.length === 4 ? <PhaseStrip stops={stops} slowMotion={slowMotionOf(current)} /> : null}

        {editingReference && current ? (
          <SwingReferenceEditor sessionId={id} saved={current.reference} handedness={current.handedness} initiallyOpen />
        ) : (
          <AnalysisProgress id={id} hasResult={Boolean(result)}>
            {result ? (
              <SwingResultCard result={result} change={lastChange} />
            ) : (
              <section className="flex flex-col gap-2 rounded-[22px] bg-surface-2 p-5">
                <h2 className="dsp text-[22px] leading-none">Analysing your swing</h2>
                <p className="text-[14px] leading-relaxed text-fg-muted">
                  We read every frame of your video, then give your swing a score out of 10, your main weakness and drills to fix it.
                </p>
                <p className="text-[12.5px] text-fg-subtle">The review starts as soon as the video loads.</p>
              </section>
            )}
          </AnalysisProgress>
        )}

        {context?.comparison?.status === "ready" ? (
          <Suspense fallback={<p role="status" className="text-[12px] text-fg-muted">Writing advice from the comparison…</p>}>
            <ComparisonAdvice owner={user.id} comparison={context.comparison} club={session.club} />
          </Suspense>
        ) : null}
        {current && context ? (
          <div id="compare" className="scroll-mt-4">
            <SwingComparisonPanel
              user={{ id, videoUrl: session.video_url, slowMotion: slowMotionOf(current) }}
              reference={selected ? { id: selected.session.id, videoUrl: selected.session.video_url, slowMotion: slowMotionOf(selected.model) } : null}
              comparison={context.comparison}
              requested={requestedReference}
              message={context.message}
              options={context.references.map((ref) => ({
                id: ref.session.id,
                label: `${ref.metadata.name} · ${CLUB_LABELS[ref.session.club]} · ${ref.session.camera_angle.replaceAll("_", " ")}`,
              }))}
            />
          </div>
        ) : null}
        {current && !editingReference ? <SwingReferenceEditor sessionId={id} saved={current.reference} handedness={current.handedness} /> : null}
        <div className="flex justify-center pt-2">
          <DeleteSwingButton swingSessionId={id} />
        </div>

        {result ? (
          <ActionBar className="[--bar-fade:var(--c-surface)]">
            <ButtonLink href={fixGoal ? `/practice/start?goal=${fixGoal}` : "/practice/start"} className={barButton}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z" />
              </svg>
              Build a fix session
            </ButtonLink>
          </ActionBar>
        ) : null}
      </Sheet>
    </div>
  );
}
