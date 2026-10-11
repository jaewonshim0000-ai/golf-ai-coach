import type { Metadata } from "next";

import { DrillLibrary } from "@/components/practice/drill-library";
import { ButtonLink, PageHero } from "@/components/ui/primitives";
import { TEST_DRILLS } from "@/lib/practice/tests";

export const metadata: Metadata = { title: "Practice tests" };

export default function DrillLibraryPage() {
  const drills = TEST_DRILLS;

  return (
    <div className="space-y-5">
      <PageHero
        art="range"
        size="sm"
        eyebrow="30 tests · 3 practice areas"
        title={<>Practice<br />tests</>}
        description="Ten range tests, ten chipping tests and ten putting tests. Choose one and record your result."
        topLeft={
          <ButtonLink href="/practice" variant="onHero" size="sm">
            Practice
          </ButtonLink>
        }
      />
      <DrillLibrary drills={drills} />
    </div>
  );
}
