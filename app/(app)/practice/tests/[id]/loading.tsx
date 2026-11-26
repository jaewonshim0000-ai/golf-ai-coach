import { Skeleton } from "@/components/ui/primitives";
import { SkBar, SkHero, SkLine, SkPill, SkScreen, SkSheet } from "@/components/ui/skeletons";

/** A drill while it loads: the hero, the goal and how to run it. */
export default function Loading() {
  return (
    <SkScreen label="Loading the drill" className="gap-0">
      <SkHero right="round" />
      <SkSheet>
        <div className="flex gap-2">
          <SkPill className="h-8 w-16" />
          <SkPill className="h-8 w-16" />
          <SkPill className="h-8 w-16" />
          <SkPill className="h-8 w-20" />
        </div>
        <div className="flex items-center gap-3 rounded-[22px] bg-ink p-3.5">
          <Skeleton className="skeleton-ink h-14 w-14 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <SkLine ink className="h-2.5 w-20" />
            <SkLine ink className="w-48" />
          </div>
        </div>
        <Skeleton className="h-6 w-36 rounded-lg" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <SkLine className="w-full" />
              <SkLine className="w-3/4" />
            </div>
          </div>
        ))}
        <SkBar fade="var(--c-surface)" />
      </SkSheet>
    </SkScreen>
  );
}
