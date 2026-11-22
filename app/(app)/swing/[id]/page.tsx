import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";
import { SwingVideo } from "@/components/swing/swing-video";
import { SwingResultCard } from "@/components/swing/swing-result";
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
import { formatDate } from "@/lib/utils";

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

  return (
    <div className="flex flex-col">
      <div className="relative -mx-4 -mt-5 overflow-hidden bg-[linear-gradient(180deg,#2c3a20,#1f2a16_70%,#3e5426)] px-5 pb-12 pt-5 text-white md:-mx-8 md:-mt-8 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <RoundButton href="/swing" tone="hero" label="Back to Swing">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
          <Link
            href={context?.comparison ? "#compare" : "/swing/references"}
            className="press dsp inline-flex h-9 items-center rounded-full border-[1.5px] border-white/85 px-3.5 text-[11px] tracking-[0.1em]"
          >
            Compare to best
          </Link>
          <span className="w-11" aria-hidden />
        </div>
        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="dsp text-[11px] tracking-[0.1em] text-white/75">
              {labelize(session.camera_angle)} · {formatDate(session.created_at.slice(0, 10))}
            </p>
            <h1 className="dsp mt-1 text-[44px] leading-[0.98]">{CLUB_LABELS[session.club]}</h1>
          </div>
        </div>
        <div className="mx-auto mt-4 w-full max-w-sm">
          <SwingVideo id={id} videoUrl={session.video_url} clipStart={session.clip_start} clipEnd={session.clip_end} analysable model={model} />
        </div>
      </div>

      <Sheet className="[--bar-fade:var(--c-surface)]">
        {stops.length === 4 ? <PhaseStrip stops={stops} slowMotion={slowMotionOf(current)} /> : null}

        {editingReference && current ? (
          <SwingReferenceEditor sessionId={id} saved={current.reference} handedness={current.handedness} initiallyOpen />
        ) : result ? (
          <SwingResultCard result={result} />
        ) : (
          <section className="flex flex-col gap-2 rounded-[22px] bg-surface-2 p-5">
            <h2 className="dsp text-[22px] leading-none">Analysing your swing</h2>
            <p className="text-[14px] leading-relaxed text-fg-muted">
              We read every frame of your video, then give your swing a score out of 10, your main weakness and drills to fix it.
            </p>
            <p className="text-[12.5px] text-fg-subtle">The review starts as soon as the video loads.</p>
          </section>
        )}

        {current && context ? (
          <div id="compare" className="scroll-mt-4">
            <SwingComparisonPanel
              user={{ id, videoUrl: session.video_url, slowMotion: slowMotionOf(current) }}
              reference={selected ? { id: selected.session.id, videoUrl: selected.session.video_url, slowMotion: slowMotionOf(selected.model) } : null}
              comparison={context.comparison}
              requested={requestedReference}
              message={context.message}
              advice={
                context.comparison ? (
                  <Suspense fallback={<p role="status" className="text-[12px] text-fg-muted">Writing advice from the comparison…</p>}>
                    <ComparisonAdvice owner={user.id} comparison={context.comparison} club={session.club} />
                  </Suspense>
                ) : null
              }
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
              Build my fix session
            </ButtonLink>
          </ActionBar>
        ) : null}
      </Sheet>
    </div>
  );
}
