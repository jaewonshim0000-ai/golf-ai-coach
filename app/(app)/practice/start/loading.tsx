import { Skeleton } from "@/components/ui/primitives";
import { SkBar, SkCard, SkLine, SkPill, SkRound, SkScreen, SkTitle, SkTop } from "@/components/ui/skeletons";

/** Build a session while it loads: the goals, the lengths and the blocks card. */
export default function Loading() {
  return (
    <SkScreen label="Loading Build a session">
      <SkTop left={<SkRound />} right={<SkPill className="w-32" />} />
      <SkTitle lines={["w-44", "w-52"]} />
      <SkLine className="w-48" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((index) => (
          <div key={index} className={`flex h-[62px] items-center gap-3 rounded-[22px] px-3.5 ${index === 0 ? "bg-ink" : "bg-surface"}`}>
            <Skeleton className={`h-[22px] w-[22px] shrink-0 rounded-full ${index === 0 ? "skeleton-ink" : ""}`} />
            <div className="flex flex-1 flex-col gap-2">
              <SkLine ink={index === 0} className="h-2.5 w-24" />
              <SkLine ink={index === 0} className="w-36" />
            </div>
          </div>
        ))}
      </div>
      <SkLine className="w-44" />
      <div className="grid grid-cols-3 gap-2">
        <SkPill className="h-12" />
        <SkPill className="h-12" />
        <SkPill className="h-12" />
      </div>
      <SkCard className="rounded-[24px] p-3.5 shadow-[var(--shadow-card)]">
        <SkLine className="w-36" />
        <Skeleton className="h-[34px] w-full rounded-full" />
      </SkCard>
      <SkBar />
    </SkScreen>
  );
}
