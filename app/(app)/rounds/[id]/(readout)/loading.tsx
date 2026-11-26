import { Skeleton } from "@/components/ui/primitives";
import { SkBar, SkCircles, SkHero, SkLine, SkPill, SkScreen, SkSheet, SkTitle } from "@/components/ui/skeletons";

/** A round while it loads: the hero with the score, the stat circles, strokes gained and the card. */
export default function Loading() {
  return (
    <SkScreen label="Loading the round" className="gap-0">
      <SkHero>
        <div className="flex items-end justify-between gap-3">
          <SkTitle ink lines={["w-48", "w-40"]} />
          <span className="h-[78px] w-[78px] shrink-0 rounded-full bg-white/90" />
        </div>
      </SkHero>
      <SkSheet>
        <SkCircles count={4} size="h-[60px] w-[60px]" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-44 rounded-lg" />
          <SkPill className="w-28" />
        </div>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <SkLine className="w-28" />
            <SkLine className="h-2.5 w-24" />
          </div>
        ))}
        <Skeleton className="h-6 w-36 rounded-lg" />
        <div className="h-[140px] rounded-[18px] bg-ink" />
        <SkBar count={2} fade="var(--c-surface)" />
      </SkSheet>
    </SkScreen>
  );
}
