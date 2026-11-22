import type { Metadata } from "next";
import Link from "next/link";
import { X } from "lucide-react";

import { NewRoundForm } from "@/components/rounds/new-round-form";
import { UpgradePrompt } from "@/components/billing/plan";
import { limitMessage, remaining } from "@/lib/billing/plans";
import { ArtHero, RoundButton, Sheet } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";

export const metadata: Metadata = { title: "New round" };
export const dynamic = "force-dynamic";

export default async function NewRoundPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const [courses, rounds, billing] = await Promise.all([
    repo.getCourses(user.id),
    repo.getRounds(user.id),
    repo.getBilling(user.id),
  ]);
  const left = remaining(billing, "round");
  // Most recently played first, so the usual course is already filled in.
  const names = [
    ...new Set([
      ...[...rounds].sort((a, b) => b.played_on.localeCompare(a.played_on)).map((round) => round.course_name),
      ...courses.map((course) => course.name),
    ]),
  ];

  return (
    <div className="flex flex-col">
      <ArtHero
        art="course"
        height="sm"
        title="New round"
        topLeft={
          <RoundButton href="/rounds" tone="hero" label="Cancel">
            <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
      />
      <Sheet className="gap-3.5 pt-[22px]">
        {left === 0 ? (
          <UpgradePrompt title="No rounds left this month" message={limitMessage(billing.plan, "round")} />
        ) : (
          <>
            {left !== null ? (
              <p className="text-[13px] text-fg-muted">
                {left} of your free rounds left this month.{" "}
                <Link href="/profile#plan" className="text-accent">
                  Premium is unlimited.
                </Link>
              </p>
            ) : null}
            <NewRoundForm courseNames={names} />
          </>
        )}
      </Sheet>
    </div>
  );
}
