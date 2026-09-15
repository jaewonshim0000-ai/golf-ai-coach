import type { Metadata } from "next";

import { NewRoundForm } from "@/components/rounds/new-round-form";
import { SectionHeading } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";

export const metadata: Metadata = { title: "New round" };
export const dynamic = "force-dynamic";

export default async function NewRoundPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const courses = await repo.getCourses(user.id);

  return (
    <div className="space-y-6">
      <SectionHeading
        title="New round"
        description="Set the round up here, then record shots hole by hole. It is built to be usable on your phone while you play."
      />
      <NewRoundForm courses={courses} />
    </div>
  );
}
