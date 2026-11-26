import { Skeleton } from "@/components/ui/primitives";
import { SkCard, SkChips, SkLine, SkPill, SkRound, SkScreen, SkTitle, SkTop } from "@/components/ui/skeletons";

/** The swing library while it loads: Record, the club chips, the latest swing and the score trend. */
export default function Loading() {
  return (
    <SkScreen label="Loading your swings">
      <SkTop left={<Skeleton className="h-4 w-6 rounded-md" />} right={<SkRound />} />
      <div className="flex items-end justify-between gap-3">
        <SkTitle lines={["w-32", "w-36"]} />
        <div className="flex flex-col items-end gap-1.5">
          <SkPill className="h-11 w-32" />
          <SkLine className="w-36" />
        </div>
      </div>
      <SkChips count={4} />
      <div className="relative h-[200px] overflow-hidden rounded-[28px] bg-[#2b3a1f]">
        <SkPill ink className="absolute left-4 top-4 h-[30px] w-32" />
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-3 rounded-[22px] bg-white/[0.12] p-3 pl-4">
          <div className="flex flex-col gap-2">
            <SkLine ink className="w-36" />
            <SkLine ink className="h-2.5 w-28" />
          </div>
          <Skeleton className="skeleton-ink h-[52px] w-[52px] shrink-0 rounded-full" />
        </div>
      </div>
      <SkCard ink className="px-[18px] py-4">
        <SkLine ink className="h-2.5 w-36" />
        <Skeleton className="skeleton-ink h-12 w-24 rounded-xl" />
        <SkLine ink className="h-2.5 w-32" />
        <Skeleton className="skeleton-ink h-[62px] w-full rounded-xl" />
      </SkCard>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-44 rounded-lg" />
        <SkLine className="w-16" />
      </div>
    </SkScreen>
  );
}
