import { Skeleton } from "@/components/ui/primitives";
import { SkCard, SkChips, SkHero, SkLine, SkScreen, SkTitle } from "@/components/ui/skeletons";

/** Play while it loads: the hero, the tabs, handicap and last round, and the game profile. */
export default function Loading() {
  return (
    <SkScreen label="Loading Play" className="gap-0">
      <SkHero height="min-h-[250px]" right="round" className="[&>div:last-child]:pb-7">
        <div className="flex items-end justify-between gap-3">
          <SkTitle ink lines={["w-32", "w-44"]} />
          <span className="h-11 w-36 shrink-0 rounded-full bg-white/90" />
        </div>
      </SkHero>
      <div className="relative z-10 -mx-4 -mt-[18px] flex flex-col gap-3.5 rounded-t-[24px] bg-bg px-4 pt-[18px] md:-mx-8 md:px-8">
        <SkChips count={3} />
        <div className="grid grid-cols-2 gap-3">
          <SkCard ink className="h-[112px] rounded-[26px] p-3.5">
            <SkLine ink className="h-2.5 w-20" />
            <Skeleton className="skeleton-ink h-9 w-20 rounded-lg" />
            <SkLine ink className="h-2 w-full" />
          </SkCard>
          <SkCard className="h-[112px] rounded-[26px] p-3.5 shadow-[var(--shadow-card)]">
            <SkLine className="h-2.5 w-24" />
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-[52px] w-[52px] shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <SkLine className="w-20" />
                <SkLine className="h-2.5 w-14" />
              </div>
            </div>
          </SkCard>
        </div>
        <SkCard className="shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-40 rounded-lg" />
            <SkLine className="w-24" />
          </div>
          <Skeleton className="mx-auto aspect-[292/205] w-full max-w-[330px] rounded-[24px]" />
        </SkCard>
      </div>
    </SkScreen>
  );
}
