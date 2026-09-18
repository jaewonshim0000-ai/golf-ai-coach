import type { Metadata } from "next";

import { DrillLibrary } from "@/components/practice/drill-library";
import { ButtonLink, PageHero } from "@/components/ui/primitives";
import { getDrills } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Drill library" };

export default function DrillLibraryPage() {
  const drills = getDrills();

  return (
    <div className="space-y-5">
      <PageHero
        art="range"
        size="sm"
        eyebrow={`${drills.length} drills`}
        title={<>Drill<br />library</>}
        description="Each one has a metric you can actually record and a standard to beat."
        topLeft={
          <ButtonLink href="/train" variant="onHero" size="sm">
            Practice
          </ButtonLink>
        }
      />
      <DrillLibrary drills={drills} />
    </div>
  );
}
