import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ShotEntry } from "@/components/rounds/shot-entry";
import { CLUBS } from "@/types/golf";
import * as repo from "@/lib/db/repo";

export const metadata: Metadata = { title: "Record shots" };
export const dynamic = "force-dynamic";

export default async function PlayRoundPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await repo.currentUser();
  if (!user) return null;

  const round = await repo.getRound(user.id, id);
  if (!round) notFound();

  const [shots, courses, profile] = await Promise.all([
    repo.getShots(user.id, round.id),
    repo.getCourses(user.id),
    repo.getProfile(user.id),
  ]);

  const course = courses.find((c) => c.id === round.course_id);
  const holes =
    course?.holes ??
    Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, par: 4, yards: 400 }));

  return (
    <div>
      <ShotEntry
        round={round}
        holes={holes}
        initialShots={shots}
        bag={profile?.bag?.length ? profile.bag : [...CLUBS]}
      />
    </div>
  );
}
