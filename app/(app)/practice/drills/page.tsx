import type { Metadata } from "next";

import { DrillLibrary } from "@/components/practice/drill-library";
import { SectionHeading } from "@/components/ui/primitives";
import { getDrills } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Drill library" };

export default function DrillLibraryPage() {
  const drills = getDrills();

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Drill library"
        description={`${drills.length} drills, each with a metric you can actually record and a standard to beat.`}
      />
      <DrillLibrary drills={drills} />
    </div>
  );
}
