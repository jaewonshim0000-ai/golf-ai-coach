import type { Metadata } from "next";

import { saveProfileAction, signOutAction } from "@/app/actions";
import { ProfileForm } from "@/components/forms/profile-form";
import { TrendLine } from "@/components/charts";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  SectionHeading,
  Stat,
} from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";
import { signed } from "@/lib/utils";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const state = await loadPlayerState(user.id);

  const handicapPoints = state.handicapHistory.map((entry) => ({
    date: entry.recorded_on,
    label: "Handicap index",
    value: entry.handicap_index,
  }));

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Profile"
        description="Everything the coaching engine knows about you before it looks at a single shot."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <Stat
              label="Handicap index"
              value={state.profile?.handicap_index ?? "—"}
              sub={`${state.rounds.length} rounds logged`}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Stat
              label="Strokes gained"
              value={signed(state.summary.per_round, 1)}
              sub="per round vs Tour baseline"
              tone={state.summary.per_round >= 0 ? "good" : "bad"}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Stat
              label="Practice"
              value={state.volume.sessions_completed}
              sub={`${state.volume.total_minutes} minutes logged`}
            />
          </CardContent>
        </Card>
      </div>

      {handicapPoints.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Handicap trend</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendLine points={handicapPoints} height={170} invert />
          </CardContent>
        </Card>
      ) : null}

      <ProfileForm profile={state.profile} action={saveProfileAction} />

      {repo.mode() === "supabase" ? (
        <form action={signOutAction}>
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      ) : null}
    </div>
  );
}
