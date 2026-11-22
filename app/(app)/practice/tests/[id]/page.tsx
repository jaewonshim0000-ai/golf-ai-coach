import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { PriorityToggle, TestSetup } from "@/components/practice/test-setup";
import { ArtHero, RoundButton, Sheet } from "@/components/ui/primitives";
import * as repo from "@/lib/db/repo";
import { measuredTest, practiceTest, TEST_DRILLS } from "@/lib/practice/tests";
import { CLUB_LABELS } from "@/types/golf";

export const metadata: Metadata = { title: "Drill" };
export const dynamic = "force-dynamic";

const ART = { range: "range", chipping: "course", putting: "green" } as const;

export default async function PracticeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const test = practiceTest(id);
  if (!test) notFound();
  const user = await repo.currentUser();
  if (!user) return null;
  const [attempts, priorities] = await Promise.all([
    repo.getDrillAttempts(user.id),
    repo.getPracticeDrillPriorities(user.id),
  ]);

  const drill = TEST_DRILLS.find((candidate) => candidate.id === test.id);
  const measured = measuredTest(test);
  const reps = drill?.recommended_reps ?? 10;
  const target = measured ? null : Math.max(1, Math.ceil((drill?.success_threshold ?? 0.7) * reps));
  const mine = attempts
    .filter((attempt) => attempt.drill_id === test.id)
    .sort((a, b) => a.completed_at.localeCompare(b.completed_at));
  const lastSix = mine.slice(-6);
  // Bars are the count out of ten, or the measurement in yards.
  const value = (attempt: (typeof mine)[number]) => (measured ? (attempt.raw_value ?? 0) : attempt.successes);
  const top = Math.max(measured ? 1 : reps, ...lastSix.map(value));
  const best = mine.length
    ? measured
      ? Math.min(...mine.map((attempt) => attempt.raw_value ?? Infinity))
      : Math.max(...mine.map((attempt) => attempt.successes))
    : null;
  const words = test.name.split(" ");
  const tags = [
    test.group[0]!.toUpperCase() + test.group.slice(1),
    test.clubs[0] ? CLUB_LABELS[test.clubs[0]] : null,
    `${drill?.recommended_duration ?? 10} min`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col">
      <ArtHero
        art={ART[test.group]}
        height="sm"
        title={
          words.length > 2 ? (
            <>
              {words.slice(0, Math.ceil(words.length / 2)).join(" ")}
              <br />
              {words.slice(Math.ceil(words.length / 2)).join(" ")}
            </>
          ) : (
            test.name
          )
        }
        topLeft={
          <RoundButton href="/practice/drills" tone="hero" label="Back to drills">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
        topRight={<PriorityToggle drillId={test.id} priorities={priorities} />}
        className="[&_h1]:text-[40px]"
      />
      <Sheet className="[--bar-fade:var(--c-surface)]">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span key={tag} className="inline-flex h-[30px] items-center rounded-full bg-surface-2 px-3 text-[12px] font-semibold">
              {tag}
            </span>
          ))}
          <span className="inline-flex h-[30px] items-center rounded-full bg-accent-soft px-3 text-[12px] font-bold text-accent-strong">
            {test.focus}
          </span>
        </div>

        <TestSetup test={test} badge={target !== null ? `${target}/${reps}` : "YD"}>
          {lastSix.length > 0 ? (
            <section aria-labelledby="results" className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="results" className="dsp text-[22px] leading-none">
                  Your last {lastSix.length}
                </h2>
                {best !== null ? (
                  <span className="text-[12px] font-semibold text-fg-subtle">
                    Best {measured ? `${best.toFixed(1)} yd` : `${best} / ${reps}`}
                  </span>
                ) : null}
              </div>
              <div
                role="img"
                aria-label={`Last ${lastSix.length} results: ${lastSix.map(value).join(", ")}${measured ? " yards" : ` out of ${reps}`}.${target !== null ? ` Goal is ${target}.` : ""}`}
                className="relative grid h-24 items-end gap-2.5 border-b border-track"
                style={{ gridTemplateColumns: `repeat(${Math.max(6, lastSix.length)}, minmax(0, 1fr))` }}
              >
                {target !== null ? (
                  <div
                    className="absolute inset-x-0 border-t-[1.5px] border-dashed border-accent"
                    style={{ bottom: `${(target / top) * 96}px` }}
                    aria-hidden
                  />
                ) : null}
                {lastSix.map((attempt, index) => (
                  <div
                    key={attempt.id}
                    className={index === lastSix.length - 1 ? "rounded-t-lg bg-accent" : "rounded-t-lg bg-track"}
                    style={{ height: `${Math.max(4, (value(attempt) / top) * 96)}px` }}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section aria-labelledby="how" className="flex flex-col gap-2.5">
            <h2 id="how" className="dsp text-[22px] leading-none">
              How to run it
            </h2>
            <ol className="flex flex-col gap-2.5">
              {test.instructions.map((line, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-fg text-[13px]">
                    {index + 1}
                  </span>
                  <span className="pt-1 text-[14px] leading-[1.45]">{line}</span>
                </li>
              ))}
            </ol>
          </section>
        </TestSetup>
      </Sheet>
    </div>
  );
}
