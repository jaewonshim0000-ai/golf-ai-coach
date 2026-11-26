import { Skeleton } from "@/components/ui/primitives";
import { SkCard, SkLine, SkPill, SkRound, SkScreen, SkTop } from "@/components/ui/skeletons";

/** Practice home while it loads: greeting, priority card, this week and swing score, today's session. */
export default function Loading() {
  return (
    <SkScreen label="Loading Practice">
      <SkTop
        left={
          <span className="flex h-11 w-[132px] items-center rounded-full bg-ink pl-1.5">
            <SkRound ink className="h-8 w-8" />
          </span>
        }
        right={<SkRound />}
      />
      <div className="flex flex-col gap-2">
        <SkLine className="w-36" />
        <Skeleton className="h-[42px] w-60 rounded-xl" />
      </div>
      <div className="hero-art relative h-[192px] shrink-0 overflow-hidden rounded-[28px]">
        <div className="hero-scrim absolute inset-0" />
        <SkPill ink className="absolute left-4 top-4 h-7 w-24" />
        <Skeleton className="skeleton-ink absolute right-3.5 top-3.5 h-16 w-16 rounded-full" />
        <div className="absolute inset-x-[18px] bottom-4 flex flex-col gap-2">
          <Skeleton className="skeleton-ink h-6 w-56 rounded-lg" />
          <SkLine ink className="w-64" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SkCard className="h-[118px] rounded-[26px] p-3.5 shadow-[var(--shadow-card)]">
          <SkLine className="h-2.5 w-20" />
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-16 w-16 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <SkLine className="w-14" />
              <SkLine className="h-2.5 w-10" />
            </div>
          </div>
        </SkCard>
        <SkCard ink className="h-[118px] rounded-[26px] p-3.5">
          <SkLine ink className="h-2.5 w-24" />
          <Skeleton className="skeleton-ink h-9 w-16 rounded-lg" />
          <SkLine ink className="h-2 w-full" />
        </SkCard>
      </div>
      <SkCard className="shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-44 rounded-lg" />
          <SkPill className="h-7 w-16" />
        </div>
        <Skeleton className="h-[30px] w-full rounded-full" />
        <SkLine className="w-48" />
        <Skeleton className="h-[50px] w-full rounded-full" />
      </SkCard>
    </SkScreen>
  );
}
