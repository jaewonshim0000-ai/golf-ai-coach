import type { Metadata } from "next";
import Link from "next/link";

import { NewRoundForm } from "@/components/rounds/new-round-form";
import { UpgradePrompt } from "@/components/billing/plan";
import { limitMessage, remaining } from "@/lib/billing/plans";
import { ButtonLink, PageHero } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";

export const metadata: Metadata = { title: "Add round" };
export const dynamic = "force-dynamic";

export default async function NewRoundPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const [courses, billing] = await Promise.all([repo.getCourses(user.id), repo.getBilling(user.id)]);
  const left = remaining(billing, "round");

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
      {left === 0 ? (
        <UpgradePrompt title="No rounds left this month" message={limitMessage(billing.plan, "round")} />
      ) : (
        <>
          {left !== null ? (
            <p className="text-[13px] text-fg-muted">
              {left} of your free rounds left this month. <Link href="/profile#plan" className="text-accent">Premium is unlimited.</Link>
            </p>
          ) : null}
          <NewRoundForm courseNames={[...new Set(courses.map((course) => course.name))]} />
        </>
      )}
    </div>
  );
}
