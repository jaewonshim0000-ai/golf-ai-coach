import { Skeleton } from "@/components/ui/primitives";
import { SkCard, SkCircles, SkLine, SkRound, SkScreen, SkTop } from "@/components/ui/skeletons";

/** Plans while they load: the two plan cards and the comparison. */
export default function Loading() {
  return (
    <SkScreen label="Loading plans" className="mx-auto min-h-svh max-w-3xl gap-4 bg-bg px-5 pb-10 pt-4">
      <SkTop left={<SkRound />} />
      <Skeleton className="h-[50px] w-40 rounded-xl" />
      <div className="flex flex-col gap-2">
        <SkLine className="w-full" />
        <SkLine className="w-3/4" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SkCard className="gap-4 p-5 shadow-[var(--shadow-card)]">
          <SkLine className="h-2.5 w-12" />
          <Skeleton className="h-11 w-16 rounded-xl" />
          <SkLine className="w-56" />
          <SkCircles count={3} />
        </SkCard>
        <SkCard ink className="gap-4 p-5">
          <SkLine ink className="h-2.5 w-20" />
          <Skeleton className="skeleton-ink h-11 w-32 rounded-xl" />
          <SkLine ink className="w-56" />
          <SkCircles count={3} ink />
          <Skeleton className="skeleton-ink h-[54px] w-full rounded-full" />
        </SkCard>
      </div>
      <SkCard className="h-[300px] shadow-[var(--shadow-card)]" />
    </SkScreen>
  );
}
