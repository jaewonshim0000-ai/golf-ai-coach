import { Skeleton } from "@/components/ui/primitives";
import { SkBar, SkChips, SkHero, SkLine, SkPill, SkScreen, SkSheet, SkTitle } from "@/components/ui/skeletons";

/** New round while it loads: the hero and the round form. */
export default function Loading() {
  return (
    <SkScreen label="Loading new round" className="gap-0">
      <SkHero right={false} height="min-h-[240px]">
        <SkTitle ink lines={["w-56"]} />
      </SkHero>
      <SkSheet>
        <SkLine className="w-20" />
        <Skeleton className="h-[50px] w-full rounded-full" />
        <div className="flex gap-2">
          <SkPill className="h-9 w-36" />
          <SkPill className="h-9 w-28" />
        </div>
        <SkLine className="w-12" />
        <Skeleton className="h-[50px] w-full rounded-full" />
        <SkLine className="w-28" />
        <SkChips count={4} />
        <SkLine className="w-32" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-[86px] rounded-[22px] bg-ink" />
          <Skeleton className="h-[86px] rounded-[22px]" />
        </div>
        <SkBar fade="var(--c-surface)" />
      </SkSheet>
    </SkScreen>
  );
}
