import type { Metadata } from "next";

import { saveProfileAction, signOutAction } from "@/app/actions";
import { ProfileForm } from "@/components/forms/profile-form";
import { TrendLine } from "@/components/charts";
import {
  Button,
  ButtonLink,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  HeroPill,
  PageHero,
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
    <div className="space-y-5">
      <PageHero
        art="dusk"
        eyebrow="Your profile"
        title={state.profile?.display_name ?? "Profile"}
        description="Everything the coaching engine knows about you before it looks at a single shot."
        pills={
          state.profile?.handicap_index !== null && state.profile?.handicap_index !== undefined ? (
            <HeroPill tone="solid">HCP {state.profile.handicap_index.toFixed(1)}</HeroPill>
          ) : null
        }
        topLeft={
          <ButtonLink href="/dashboard" variant="onHero" size="sm" className="md:hidden">
            Close
          </ButtonLink>
        }
      />

      <Card>
        <CardContent className="grid grid-cols-3 gap-3 p-5">
          <Stat
            label="Handicap"
            value={state.profile?.handicap_index ?? "—"}
            sub={`${state.rounds.length} rounds`}
          />
          <Stat
            label="SG / round"
            value={signed(state.summary.per_round, 1)}
            sub="vs Tour"
            tone={state.summary.per_round >= 0 ? "good" : "bad"}
          />
          <Stat
            label="Practice"
            value={state.volume.sessions_completed}
            sub={`${state.volume.total_minutes} min`}
          />
        </CardContent>
      </Card>

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
