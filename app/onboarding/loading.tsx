import { Skeleton } from "@/components/ui/primitives";
import { SkChips, SkLine, SkScreen, SkTitle } from "@/components/ui/skeletons";

/** Onboarding while it loads: the step bar, the question and the first fields. */
export default function Loading() {
  return (
    <SkScreen label="Loading setup" className="hero-grid min-h-svh px-5 pb-32 pt-[max(1.75rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <div className="flex gap-1.5">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-1.5 flex-1 rounded-full" />
          ))}
        </div>
        <SkLine className="w-44" />
        <SkTitle lines={["w-60", "w-52"]} />
        <SkLine className="w-24" />
        <div className="h-[50px] rounded-full bg-surface" />
        <SkLine className="w-32" />
        <SkChips count={4} />
      </div>
    </SkScreen>
  );
}
