import type { Metadata } from "next";

import { NewRoundForm } from "@/components/rounds/new-round-form";
import { ButtonLink, PageHero } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";

export const metadata: Metadata = { title: "Add round" };
export const dynamic = "force-dynamic";

export default async function NewRoundPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const courses = await repo.getCourses(user.id);

  return (
    <div className="space-y-5">
      <PageHero
        art="course"
        size="sm"
        eyebrow="Start playing"
        title={<>Add<br />round</>}
        description="Where, when and what kind of round. Shots go in hole by hole."
        topLeft={
          <ButtonLink href="/rounds" variant="onHero" size="sm">
            Rounds
          </ButtonLink>
        }
      />
      <NewRoundForm courseNames={[...new Set(courses.map((course) => course.name))]} />
    </div>
  );
}
