import { Skeleton } from "@/components/ui/primitives";
import { SkBar, SkCard, SkLine, SkPill, SkRound, SkScreen, SkTop } from "@/components/ui/skeletons";

/** The quick scorecard while it loads: the holes, the score stepper and the putts. */
export default function Loading() {
  return (
    <SkScreen label="Loading the scorecard">
      <SkTop left={<SkRound />} right={<span className="h-9 w-40 rounded-full bg-ink" />} />
      <div className="grid grid-cols-6 gap-2 rounded-[22px] bg-ink p-2.5">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="skeleton-ink aspect-square rounded-full" />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-11 w-36 rounded-xl" />
        <SkPill className="w-28" />
      </div>
      <SkCard className="items-center gap-4 pb-5">
        <div className="flex w-full items-center justify-between">
          <Skeleton className="h-[60px] w-[60px] rounded-full" />
          <Skeleton className="h-[96px] w-20 rounded-2xl" />
          <Skeleton className="h-[60px] w-[60px] rounded-full" />
        </div>
        <SkPill className="h-7 w-24" />
      </SkCard>
      <SkLine className="w-24" />
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: 5 }, (_, index) => (
          <SkPill key={index} className="h-11" />
        ))}
      </div>
      <SkBar count={2} />
    </SkScreen>
  );
}
