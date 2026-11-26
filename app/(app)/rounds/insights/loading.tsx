import { Skeleton } from "@/components/ui/primitives";
import { SkCard, SkChips, SkLine, SkPill, SkRound, SkScreen, SkTitle, SkTop } from "@/components/ui/skeletons";

/** Strokes gained while it loads: the tabs, the chart and the miss pattern. */
export default function Loading() {
  return (
    <SkScreen label="Loading strokes gained">
      <SkTop left={<SkRound />} right={<SkPill className="h-11 w-32" />} />
      <div className="flex flex-col gap-2">
        <span className="h-[26px] w-24 rounded-full bg-ink" />
        <SkTitle lines={["w-48", "w-40"]} />
      </div>
      <SkChips count={3} />
      <SkCard className="shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-44 rounded-lg" />
          <SkLine className="w-28" />
        </div>
        <Skeleton className="h-[170px] w-full rounded-2xl" />
      </SkCard>
      <SkCard ink className="flex-row items-center gap-3.5">
        <Skeleton className="skeleton-ink h-[132px] w-[132px] shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="skeleton-ink h-5 w-32 rounded-lg" />
          <SkLine ink className="w-full" />
          <SkLine ink className="w-3/4" />
        </div>
      </SkCard>
    </SkScreen>
  );
}
