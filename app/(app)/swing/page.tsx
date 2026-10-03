import Link from "next/link";
import type { Metadata } from "next";

import { AddSwing } from "@/components/swing/add-swing";
import { SwingVideo } from "@/components/swing/swing-video";
import { Badge, EmptyState, HeroPill, PageHero } from "@/components/ui/primitives";
import { CLUB_LABELS, labelize } from "@/types/golf";
import { diagnoseSwing } from "@/lib/golf/swing-metrics";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Swing" };
export const dynamic = "force-dynamic";

export default async function SwingLibraryPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const state = await loadPlayerState(user.id);

  const swings = state.swingSessions.map((session) => {
    const measurements = state.swingMeasurements.filter((m) => m.swing_session_id === session.id && m.source === "manual");
    return { session, diagnostic: diagnoseSwing(measurements) };
  });

  return (
    <div className="space-y-5">
      <PageHero
        art="dusk"
        size="sm"
        eyebrow="Your swing"
        title="Swing"
        action={<AddSwing />}
        pills={
          <>
            <HeroPill tone="solid">{swings.length} videos</HeroPill>
            <HeroPill>{state.swingFindings.length} findings</HeroPill>
          </>
        }
      />

      {swings.length === 0 ? (
        <EmptyState
          title="No swings yet"
          message="Upload a swing or record one, then open it and choose Analyze movement to review your joints on the video."
        />
      ) : (
        <div className="relative grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {swings.map(({ session, diagnostic }) => (
            <Link key={session.id} href={`/swing/${session.id}`} className="group block">
              <SwingVideo
                id={session.id}
                videoUrl={session.video_url}
                className="aspect-[3/4] transition-opacity group-hover:opacity-90"
              />
              <div className="mt-2 space-y-1">
                <p className="truncate text-[12.5px] font-semibold">
                  {CLUB_LABELS[session.club]}
                </p>
                <p className="truncate text-[10.5px] text-fg-subtle">
                  {labelize(session.camera_angle)} &middot;{" "}
                  {formatDate(session.created_at.slice(0, 10))}
                </p>
                {diagnostic.measured === 0 ? (
                  <Badge tone="neutral">{session.analysis_status === "processed" ? "Review analysis" : "Analyze movement"}</Badge>
                ) : (
                  <Badge tone={diagnostic.outOfRange.length > 0 ? "warn" : "good"}>
                    {diagnostic.outOfRange.length > 0
                      ? `${diagnostic.outOfRange.length} out of band`
                      : "all in band"}
                  </Badge>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
