import { SkChips, SkLine, SkPill, SkRound, SkRows, SkScreen, SkTitle, SkTop } from "@/components/ui/skeletons";

/** The drill library while it loads: search, area chips and the drill rows. */
export default function Loading() {
  return (
    <SkScreen label="Loading the drill library">
      <SkTop left={<SkRound />} right={<SkPill className="w-36" />} />
      <SkTitle lines={["w-36", "w-44"]} />
      <div className="h-[50px] rounded-full bg-surface" />
      <SkChips count={4} />
      <div className="flex items-center justify-between">
        <SkLine className="w-32" />
        <SkLine className="w-14" />
      </div>
      <SkRows count={5} height="h-[76px]" />
    </SkScreen>
  );
}
