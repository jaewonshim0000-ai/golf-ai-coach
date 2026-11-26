import { Skeleton } from "@/components/ui/primitives";
import { SkCard, SkChips, SkLine, SkRound, SkRows, SkScreen, SkTitle, SkTop } from "@/components/ui/skeletons";

/** Practice history while it loads: this week's strip, the tabs and the sessions. */
export default function Loading() {
  return (
    <SkScreen label="Loading practice history">
      <SkTop left={<SkRound />} />
      <SkTitle lines={["w-48", "w-44"]} />
      <SkCard ink className="gap-3.5">
        <div className="flex items-center justify-between">
          <Skeleton className="skeleton-ink h-5 w-28 rounded-lg" />
          <SkLine ink className="w-28" />
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="skeleton-ink aspect-square rounded-full" />
          ))}
        </div>
      </SkCard>
      <SkChips count={2} />
      <SkRows count={5} />
    </SkScreen>
  );
}
