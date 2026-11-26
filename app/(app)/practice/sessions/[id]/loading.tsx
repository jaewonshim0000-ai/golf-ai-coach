import { Skeleton } from "@/components/ui/primitives";
import { SkBar, SkHero, SkLine, SkPill, SkScreen, SkSheet, SkTitle } from "@/components/ui/skeletons";

/** A practice session while it loads: the range hero, the drill, the strip of balls and the two buttons. */
export default function Loading() {
  return (
    <SkScreen label="Loading the session" className="gap-0">
      <SkHero art="hero-art-range" height="min-h-[300px]" center>
        <SkTitle ink lines={["w-52", "w-40"]} className="items-center" />
        <SkPill ink className="h-9 w-44" />
      </SkHero>
      <SkSheet>
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-44 rounded-lg" />
            <SkLine className="w-52" />
          </div>
          <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-full" />
        </div>
        <div className="grid grid-cols-6 gap-1.5 rounded-[22px] bg-ink p-2.5">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="skeleton-ink aspect-square rounded-full" />
          ))}
        </div>
        <div className="flex items-center justify-between">
          <SkLine className="w-40" />
          <SkPill className="h-9 w-20" />
        </div>
        <SkBar count={2} fade="var(--c-surface)" />
      </SkSheet>
    </SkScreen>
  );
}
