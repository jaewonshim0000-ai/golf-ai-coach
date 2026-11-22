import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AddSwing } from "@/components/swing/add-swing";
import { SwingVideo } from "@/components/swing/swing-video";
import { RoundButton, ScreenTitle, TopBar } from "@/components/ui/primitives";
import { ShowMore } from "@/components/ui/show-more";
import { CLUB_LABELS, labelize } from "@/types/golf";
import * as repo from "@/lib/db/repo";
import { remaining } from "@/lib/billing/plans";

export const metadata: Metadata = { title: "Reference library" };
export const dynamic = "force-dynamic";

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default async function SwingReferencesPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const [references, sessions, billing] = await Promise.all([
    repo.getSwingReferences(user.id),
    repo.getSwingSessions(user.id),
    repo.getBilling(user.id),
  ]);
  const existing = sessions.filter((session) => !references.some((ref) => ref.session.id === session.id));

  return (
    <div className="flex flex-col gap-4">
      <TopBar
        left={
          <RoundButton href="/swing" label="Back to swings">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
      />
      <ScreenTitle>
        Reference
        <br />
        library
      </ScreenTitle>
      <p className="text-[14px] leading-relaxed text-fg-muted">
        Swings you want to match. New recordings are compared against them automatically, by club, camera view and setup.
      </p>

      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {references.map(({ session, metadata }, index) => (
          <li key={session.id} className="flex flex-col gap-2">
            <Link href={`/swing/${session.id}?reference=new`} className="press-lg relative block overflow-hidden rounded-[22px] bg-[#2b3a1f]">
              <SwingVideo id={session.id} videoUrl={session.video_url} className="aspect-[3/4] rounded-none bg-[#2b3a1f]" />
              {index === 0 ? (
                <span className="dsp pointer-events-none absolute left-2.5 top-2.5 inline-flex h-7 items-center rounded-full bg-gold px-2.5 text-[10px] text-[#1e211b]">
                  Default
                </span>
              ) : null}
            </Link>
            <div className="px-1">
              <p className="truncate text-[14px] font-bold">
                {metadata.name} · {SHORT.format(new Date(session.created_at))}
              </p>
              <p className="truncate text-[12px] text-fg-subtle">
                {CLUB_LABELS[session.club]} · {labelize(session.camera_angle)} · {metadata.handedness} handed
              </p>
              {metadata.source ? <p className="truncate text-[11px] text-fg-subtle">Credit: {metadata.source}</p> : null}
            </div>
          </li>
        ))}
        <li className="flex flex-col gap-2">
          <AddSwing reference left={remaining(billing, "swing")} plan={billing.plan} />
          <p className="px-1 text-[12.5px] text-fg-subtle">Record or use a saved swing</p>
        </li>
      </ul>

      {existing.length ? (
        <section className="flex flex-col gap-2.5">
          <h2 className="dsp text-[22px] leading-none">Use a saved recording</h2>
          <ShowMore as="ul" limit={5} className="flex flex-col gap-2">
            {existing.map((session) => (
              <li key={session.id}>
                <Link
                  className="press-lg flex items-center justify-between gap-3 rounded-[22px] bg-surface px-4 py-3.5 text-[15px] font-semibold"
                  href={`/swing/${session.id}?reference=new`}
                >
                  <span className="truncate">
                    {CLUB_LABELS[session.club]} · {labelize(session.camera_angle)}
                  </span>
                  <span className="shrink-0 text-[12.5px] font-normal text-fg-subtle">{SHORT.format(new Date(session.created_at))}</span>
                </Link>
              </li>
            ))}
          </ShowMore>
        </section>
      ) : null}
    </div>
  );
}
