import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { ScorecardEntry } from "@/components/rounds/scorecard-entry";
import * as repo from "@/lib/db/repo";

export const metadata: Metadata = { title: "Round scorecard" };
export const dynamic = "force-dynamic";

export default async function RoundScorecardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await repo.currentUser();
  if (!user) return null;

  const [round, courses, shots] = await Promise.all([
    repo.getRound(user.id, id),
    repo.getCourses(user.id),
    repo.getShots(user.id, id),
  ]);
  if (!round) notFound();
  if (shots.length > 0) redirect(`/rounds/${round.id}/play`);
  const course = courses.find((item) => item.id === round.course_id);
  if (!course) notFound();

  return <ScorecardEntry round={round} holes={course.holes} />;
}
