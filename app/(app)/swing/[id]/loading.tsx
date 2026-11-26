import { Skeleton } from "@/components/ui/primitives";
import { SkLine, SkPill, SkRound, SkScreen, SkSheet } from "@/components/ui/skeletons";

/** A swing review while it loads: the dark hero with the video, then what was found. */
export default function Loading() {
  return (
    <SkScreen label="Loading the swing" className="gap-0">
      <div className="relative -mx-4 -mt-5 overflow-hidden bg-[#2a3820] px-5 pb-12 pt-5 md:-mx-8 md:-mt-8 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <SkRound ink />
          <SkPill ink className="h-9 w-52" />
          <SkRound ink />
        </div>
        <Skeleton className="skeleton-ink mx-auto mt-4 aspect-[3/4] w-full max-w-sm rounded-2xl" />
      </div>
      <SkSheet>
        <div className="flex items-center gap-4">
          <Skeleton className="h-[92px] w-[92px] shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-6 w-44 rounded-lg" />
            <SkLine className="w-full" />
            <SkLine className="w-2/3" />
          </div>
        </div>
        {[0, 1].map((index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <SkLine className="w-44" />
              <SkLine className="h-2.5 w-36" />
            </div>
            <SkPill className="h-9 w-16" />
          </div>
        ))}
        <Skeleton className="h-6 w-40 rounded-lg" />
        <Skeleton className="h-[60px] w-full rounded-[22px]" />
        <Skeleton className="h-[60px] w-full rounded-[22px]" />
      </SkSheet>
    </SkScreen>
  );
}
