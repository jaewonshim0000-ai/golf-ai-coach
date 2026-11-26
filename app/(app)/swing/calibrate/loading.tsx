import { SkCard, SkLine, SkRows, SkScreen, SkTitle } from "@/components/ui/skeletons";

/** Score calibration while it loads. */
export default function Loading() {
  return (
    <SkScreen label="Loading score calibration">
      <SkLine className="w-24" />
      <SkTitle lines={["w-60"]} />
      <SkCard className="h-48" />
      <SkRows count={3} />
    </SkScreen>
  );
}
