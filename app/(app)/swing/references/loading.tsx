import { SkLine, SkRound, SkScreen, SkTitle, SkTop } from "@/components/ui/skeletons";

/** The reference library while it loads. */
export default function Loading() {
  return (
    <SkScreen label="Loading the reference library">
      <SkTop left={<SkRound />} />
      <SkTitle lines={["w-48", "w-40"]} />
      <div className="flex flex-col gap-2">
        <SkLine className="w-full" />
        <SkLine className="w-2/3" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1].map((index) => (
          <div key={index} className="flex flex-col gap-2">
            <div className="aspect-[3/4] rounded-[22px] bg-[#2b3a1f]" />
            <SkLine className="w-28" />
          </div>
        ))}
      </div>
    </SkScreen>
  );
}
