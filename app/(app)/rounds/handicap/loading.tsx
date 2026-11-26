import { Skeleton } from "@/components/ui/primitives";
import { SkCard, SkLine, SkPill, SkRound, SkScreen, SkTitle, SkTop } from "@/components/ui/skeletons";

/** Handicap while it loads: the index on the dark card and the classic stat tiles. */
export default function Loading() {
  return (
    <SkScreen label="Loading your handicap">
      <SkTop left={<SkRound />} />
      <SkTitle lines={["w-56"]} />
      <SkCard ink className="h-[200px]">
        <div className="flex items-end justify-between">
          <Skeleton className="skeleton-ink h-16 w-28 rounded-xl" />
          <SkPill ink className="h-[30px] w-28" />
        </div>
        <Skeleton className="skeleton-ink mt-auto h-16 w-full rounded-xl" />
      </SkCard>
      <div className="flex items-center justify-between px-1">
        <Skeleton className="h-6 w-40 rounded-lg" />
        <SkLine className="w-20" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex h-[84px] items-center justify-between gap-2 rounded-[22px] bg-surface p-3.5">
            <div className="flex flex-col gap-2">
              <SkLine className="w-16" />
              <SkLine className="h-2.5 w-10" />
            </div>
            <Skeleton className="h-14 w-14 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </SkScreen>
  );
}
