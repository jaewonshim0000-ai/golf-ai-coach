import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { SessionBuilder } from "@/components/practice/session-builder";
import {
  Badge,
  ButtonLink,
  EmptyState,
  MiniCard,
  PageHero,
  SectionHeading,
} from "@/components/ui/primitives";
import type { Skill } from "@/types/practice";
import type { SuggestedSession } from "@/lib/practice/session";
import { selectDrills } from "@/lib/practice/session";
import { benchmarkFor, benchmarkNote } from "@/lib/practice/benchmark";
import { DRILLS_BY_ID } from "@/lib/seed/drills";
import { diagnoseSwing } from "@/lib/golf/swing-metrics";
import * as repo from "@/lib/db/repo";
import { loadPlayerState } from "@/lib/player-state";

export const metadata: Metadata = { title: "Start practice" };
export const dynamic = "force-dynamic";

const SWING_GOAL = "swing";

export default async function StartPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ goal?: string }>;
}) {
  const user = await repo.currentUser();
  if (!user) return null;
  const [state, search] = await Promise.all([loadPlayerState(user.id), searchParams]);
  const { profile } = state;

  const diagnostic = diagnoseSwing(state.swingMeasurements);
  const swingSkills = [
    ...new Set(
      diagnostic.outOfRange
        .map((reading) => (reading.drillId ? DRILLS_BY_ID.get(reading.drillId)?.skill_trained : null))
        .filter((skill): skill is Skill => Boolean(skill)),
    ),
  ];

  /*
    A goal is either a ranked weakness or the swing itself. Both resolve to the
    same thing - a set of skills - so the drill selection below does not care
    which one the player picked.
  */
  const options = [
    ...state.weaknesses.slice(0, 4).map((weakness) => ({
      id: weakness.id,
      label: weakness.title,
      skills: weakness.related_skills,
      cost: weakness.strokes_lost_per_round,
    })),
    ...(swingSkills.length > 0
      ? [
          {
            id: SWING_GOAL,
            label: "Your swing",
            skills: swingSkills,
            cost: null,
          },
        ]
      : []),
  ];

  const goal = options.find((option) => option.id === search.goal) ?? options[0] ?? null;

  /*
    "Important" means this drill also hits the top-ranked priority. On the
    priority itself every drill would carry it, which marks nothing, so the
    badge only appears once the player has chosen some other goal.
  */
  const top = state.weaknesses[0];
  const prioritySkills = new Set(top && goal?.id !== top.id ? top.related_skills : []);

  const block = state.session?.block ?? "technical";
  const drills = profile && goal ? selectDrills(goal.skills, block, profile, 8) : [];
  const benchmarks = drills.map((drill) => benchmarkFor(drill, state.drillAttempts));

  const suggested: SuggestedSession | null =
    goal && drills.length > 0
      ? {
          title: goal.label,
          objective:
            goal.cost === null
              ? "Aimed at the positions that are outside their band."
              : `Aimed at the ${goal.cost.toFixed(2)} strokes a round you are losing here.`,
          block,
          duration: profile?.typical_practice_duration ?? 45,
          drills: drills.slice(0, 3),
          targets: state.weaknesses.find((weakness) => weakness.id === goal.id) ?? null,
        }
      : null;

  return (
    <div className="space-y-5">
      <PageHero
        art="range"
        size="sm"
        eyebrow="Choose goal"
        title="Start practice"
        topLeft={
          <ButtonLink href="/practice" variant="onHero" size="sm">
            <ArrowLeft className="h-3.5 w-3.5" /> Practice
          </ButtonLink>
        }
      />

      {options.length === 0 ? (
        <EmptyState
          title="No goal to pick yet"
          message="Log a round or measure a swing and the goals appear here, ranked by what they cost you."
          action={
            <ButtonLink href="/rounds/new" size="sm" variant="secondary">
              Log a round
            </ButtonLink>
          }
        />
      ) : (
        <>
          <nav className="no-bar relative flex gap-1.5 overflow-x-auto" aria-label="Practice goal">
            {options.map((option) => {
              const active = option.id === goal?.id;
              return (
                <Link
                  key={option.id}
                  href={`/practice/start?goal=${option.id}`}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "dsp shrink-0 rounded-full bg-[image:var(--grad-accent)] px-4 py-2 text-[10px] font-medium tracking-[0.15em] text-white"
                      : "dsp shrink-0 rounded-full border border-border-strong bg-surface px-4 py-2 text-[10px] font-medium tracking-[0.15em] text-fg-muted"
                  }
                >
                  {option.label}
                </Link>
              );
            })}
          </nav>

          <SectionHeading
            title="Drills for this goal"
            description="Ranked for the skills the goal needs. The standard is what counts as done."
          />
          <div className="grid gap-2.5 md:grid-cols-2">
            {benchmarks.map((benchmark) => {
              const note = benchmarkNote(benchmark);
              const important = prioritySkills.has(benchmark.drill.skill_trained);
              return (
                <MiniCard key={benchmark.drill.id} className="space-y-2 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-[13px] font-semibold">
                      {benchmark.drill.name}
                    </p>
                    {important ? <Badge tone="accent">important</Badge> : null}
                  </div>
                  <p className="tabular text-[15px] font-semibold text-accent">{benchmark.label}</p>
                  <p className="text-[11.5px] leading-[1.5] text-fg-muted">
                    {note ?? `${benchmark.drill.metric_to_track}. No result logged yet.`}
                  </p>
                </MiniCard>
              );
            })}
          </div>

          <SessionBuilder
            key={goal?.id}
            drills={state.drills}
            suggested={suggested}
            defaultDuration={profile?.typical_practice_duration ?? 45}
          />
        </>
      )}
    </div>
  );
}
