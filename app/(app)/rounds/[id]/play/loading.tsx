import { Skeleton } from "@/components/ui/primitives";
import { SkBar, SkChips, SkLine, SkPill, SkRound, SkScreen, SkSheet } from "@/components/ui/skeletons";

/** A live hole while it loads: the hole map, the hole and its strip, the shots and the two buttons. */
export default function Loading() {
  return (
    <SkScreen label="Loading the hole" className="gap-0">
      <div className="relative -mx-4 -mt-5 h-[280px] overflow-hidden bg-[#3e5426] md:-mx-8 md:-mt-8">
        <div className="flex items-center justify-between px-5 pt-5 md:px-8">
          <SkRound ink />
          <SkPill ink className="h-9 w-48" />
        </div>
      </div>
      <SkSheet>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-11 w-36 rounded-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-[52px] w-[52px] rounded-full" />
            <Skeleton className="h-[52px] w-[52px] rounded-full" />
            <Skeleton className="h-[52px] w-[52px] rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1.5 rounded-[22px] bg-ink p-2.5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="skeleton-ink aspect-square rounded-full" />
          ))}
        </div>
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <SkLine className="w-24" />
              <SkLine className="h-2.5 w-40" />
            </div>
            <SkPill className="h-8 w-14" />
          </div>
        ))}
        <div className="flex flex-col gap-3 rounded-[22px] bg-surface-2 p-4">
          <Skeleton className="h-6 w-36 rounded-lg" />
          <SkChips count={4} />
        </div>
        <SkBar count={2} fade="var(--c-surface)" />
      </SkSheet>
    </SkScreen>
  );
}
