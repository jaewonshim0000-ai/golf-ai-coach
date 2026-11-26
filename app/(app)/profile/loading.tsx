import { Skeleton } from "@/components/ui/primitives";
import { SkCard, SkLine, SkScreen } from "@/components/ui/skeletons";

/** Profile while it loads: the name, the plan card and the settings list. */
export default function Loading() {
  return (
    <SkScreen label="Loading your profile" className="pt-1">
      <div className="flex items-center gap-3.5">
        <Skeleton className="h-[68px] w-[68px] shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <SkLine className="w-56" />
        </div>
      </div>
      <SkCard ink className="gap-3.5">
        <div className="flex items-center justify-between">
          <SkLine ink className="w-36" />
          <SkLine ink className="w-24" />
        </div>
        {[0, 1, 2].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <SkLine ink className="w-28" />
              <SkLine ink className="w-16" />
            </div>
            <SkLine ink className="h-2 w-full" />
          </div>
        ))}
        <Skeleton className="skeleton-ink h-11 w-full rounded-full" />
      </SkCard>
      <div className="rounded-[26px] bg-surface px-4 shadow-[var(--shadow-card)]">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className="flex min-h-14 items-center gap-3 border-b border-surface-2 py-2 last:border-0">
            <div className="flex flex-1 flex-col gap-2">
              <SkLine className="w-48" />
              <SkLine className="h-2.5 w-36" />
            </div>
            <Skeleton className="h-4 w-4 rounded" />
          </div>
        ))}
      </div>
    </SkScreen>
  );
}
