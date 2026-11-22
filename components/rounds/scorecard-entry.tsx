"use client";

import { useActionState, useState, useTransition } from "react";
import { ChevronLeft, Loader2, Minus, Plus } from "lucide-react";

import { finishScorecardAction, saveHoleAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { lineFromStat } from "@/lib/analytics/classic";
import type { HoleSpec, HoleStat, Round } from "@/types/rounds";
import { cn, signed } from "@/lib/utils";
import {
  ActionBar,
  Button,
  ButtonLink,
  RoundButton,
  StepDot,
  StepStrip,
  TopBar,
  barButton,
  chip,
} from "@/components/ui/primitives";

/**
 * The live scorecard. One hole at a time, sized for a thumb on a tee box:
 * everything starts at the likely answer (par, two putts, no penalties), so a
 * routine hole is one tap on Save. Each hole is stored the moment it is saved.
 */

const NAMES: Record<number, string> = { [-3]: "Albatross", [-2]: "Eagle", [-1]: "Birdie", 0: "Par", 1: "Bogey", 2: "Double bogey", 3: "Triple bogey" };

function scoreName(toPar: number): string {
  return NAMES[toPar] ?? (toPar < 0 ? `${-toPar} under` : `${toPar} over`);
}

type Draft = { score: number; putts: number; fairway: HoleStat["fairway"]; penalties: number };

function draftFor(stat: HoleStat | null | undefined, hole: HoleSpec): Draft {
  return stat
    ? { score: stat.score, putts: stat.putts ?? 2, fairway: stat.fairway, penalties: stat.penalties }
    : { score: hole.par, putts: 2, fairway: null, penalties: 0 };
}

export function ScorecardEntry({ round, holes }: { round: Round; holes: HoleSpec[] }) {
  const [stats, setStats] = useState<(HoleStat | null)[]>(() =>
    holes.map(
      (_, index) =>
        round.hole_stats?.[index] ??
        (round.hole_scores?.[index]
          ? { score: round.hole_scores[index]!, putts: null, fairway: null, penalties: 0 }
          : null),
    ),
  );
  const [index, setIndex] = useState(() => Math.max(0, stats.findIndex((stat) => !stat)));
  const hole = holes[index]!;
  const [draft, setDraft] = useState<Draft>(() => draftFor(stats[index], hole));
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [finishState, finishAction, finishing] = useActionState(finishScorecardAction, IDLE);

  const played = stats.flatMap((stat, i) => (stat ? [{ stat, hole: holes[i]! }] : []));
  const total = played.reduce((sum, { stat }) => sum + stat.score, 0);
  const toPar = played.reduce((sum, { stat, hole }) => sum + stat.score - hole.par, 0);
  const complete = played.length === holes.length;

  const go = (next: number) => {
    const target = Math.max(0, Math.min(holes.length - 1, next));
    setIndex(target);
    setDraft(draftFor(stats[target], holes[target]!));
    setError(null);
  };

  const set = (patch: Partial<Draft>) =>
    setDraft((current) => {
      const next = { ...current, ...patch };
      // Keep the numbers possible as they change: putts and penalties can
      // never add up to more strokes than were taken.
      next.penalties = Math.max(0, Math.min(next.penalties, next.score - 1));
      next.putts = Math.max(0, Math.min(next.putts, next.score - next.penalties));
      return next;
    });

  const save = () =>
    startSaving(async () => {
      const result = await saveHoleAction({
        round_id: round.id,
        hole_number: hole.hole_number,
        score: draft.score,
        putts: draft.putts,
        fairway: hole.par >= 4 ? draft.fairway : null,
        penalties: draft.penalties,
      });
      if (!result.ok || !result.hole_stats) {
        setError(result.message ?? "Could not save this hole. Check your signal and try again.");
        return;
      }
      setStats(result.hole_stats);
      setError(null);
      const nextOpen = result.hole_stats.findIndex((stat, i) => !stat && i > index);
      const anyOpen = result.hole_stats.findIndex((stat) => !stat);
      const target = nextOpen !== -1 ? nextOpen : anyOpen !== -1 ? anyOpen : index;
      setIndex(target);
      setDraft(draftFor(result.hole_stats[target], holes[target]!));
    });

  const live = lineFromStat(
    { score: draft.score, putts: draft.putts, fairway: draft.fairway, penalties: draft.penalties },
    hole.par,
    hole.hole_number,
  );

  const stripStart = Math.max(0, Math.min(index - 2, holes.length - 5));
  const strip = holes.slice(stripStart, stripStart + 5);
  const toParText = played.length ? (toPar === 0 ? "E" : signed(toPar, 0)) : "E";
  const putts = [0, 1, 2, 3, 4];
  const finishable = complete && round.status !== "complete";
  const current = stats[index];

  return (
    <div className="flex flex-col gap-4">
      <TopBar
        left={
          <RoundButton href={`/rounds/${round.id}`} label="Back to the round">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
        center={<span className="text-[13px] normal-case tracking-normal text-fg">{round.course_name}</span>}
        right={
          <span className="dsp inline-flex h-9 items-center rounded-full bg-ink px-3.5 text-[11px] tracking-[0.1em] text-white">
            Thru {played.length} ·&nbsp;
            <span className={toPar > 0 ? "text-[#f2b59b]" : toPar < 0 ? "text-[#b5d27a]" : undefined}>{toParText}</span>
          </span>
        }
      />

      <StepStrip columns={5} role="navigation" aria-label="Holes" className="gap-2 p-2.5">
        {strip.map((item) => {
          const i = holes.indexOf(item);
          const stat = stats[i];
          const here = i === index;
          return (
            <button
              key={item.hole_number}
              type="button"
              onClick={() => go(i)}
              aria-current={here ? "step" : undefined}
              aria-label={`Hole ${item.hole_number}${here ? ", playing" : stat ? `, scored ${stat.score}` : ""}`}
              className="press min-w-0"
            >
              <StepDot
                tone={here ? "good" : stat ? "done" : "next"}
                value={item.hole_number}
                label={here ? "Hole" : stat ? `Score ${stat.score}` : "Hole"}
                className={here ? "step-now" : undefined}
              />
            </button>
          );
        })}
      </StepStrip>

      <div className="flex items-center justify-between gap-3">
        <h1 className="dsp text-[44px] leading-none">Hole {hole.hole_number}</h1>
        <span className="dsp inline-flex h-10 items-center rounded-full border-[1.5px] border-fg px-3.5 text-[11px]">
          Par {hole.par} · {hole.yards} yds
        </span>
      </div>

      <section aria-label="Score" className="flex flex-col items-center gap-3 rounded-[28px] bg-surface px-4 pb-5 pt-4">
        <div className="flex w-full items-center justify-between">
          <button
            type="button"
            onClick={() => set({ score: draft.score - 1 })}
            disabled={draft.score <= 1}
            aria-label="One fewer stroke"
            className="press flex h-[60px] w-[60px] items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"
          >
            <Minus className="h-6 w-6" strokeWidth={2.2} />
          </button>
          <output aria-live="polite" aria-label="Strokes" className="font-display tabular text-[96px] leading-none">
            {draft.score}
          </output>
          <button
            type="button"
            onClick={() => set({ score: draft.score + 1 })}
            disabled={draft.score >= 20}
            aria-label="One more stroke"
            className="press flex h-[60px] w-[60px] items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
          >
            <Plus className="h-6 w-6" strokeWidth={2.2} />
          </button>
        </div>
        <span className={cn("dsp inline-flex h-[30px] items-center rounded-full px-3.5 text-[11px]", scoreTone(draft.score - hole.par))}>
          {scoreName(draft.score - hole.par)}
        </span>
      </section>

      <fieldset>
        <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">Putts</legend>
        <div role="radiogroup" aria-label="Putts" className="grid grid-cols-5 gap-2">
          {putts.map((count) => {
            const active = count === 4 ? draft.putts >= 4 : draft.putts === count;
            const allowed = count <= draft.score - draft.penalties;
            return (
              <button
                key={count}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={!allowed}
                onClick={() => set({ putts: count === 4 && active ? draft.putts + 1 : count })}
                className={cn(
                  "press font-display flex h-11 items-center justify-center rounded-full text-[16px] disabled:opacity-30",
                  active ? "bg-accent text-white" : "border-[1.5px] border-fg",
                )}
              >
                {count === 4 ? (draft.putts > 4 ? draft.putts : "4+") : count}
              </button>
            );
          })}
        </div>
      </fieldset>

      {hole.par >= 4 ? (
        <fieldset>
          <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">Tee shot</legend>
          <div role="radiogroup" aria-label="Tee shot" className="grid grid-cols-[1fr_1.2fr_1fr] gap-2">
            {(["left", "hit", "right"] as const).map((side) => (
              <button
                key={side}
                type="button"
                role="radio"
                aria-checked={draft.fairway === side}
                onClick={() => set({ fairway: draft.fairway === side ? null : side })}
                className={chip(draft.fairway === side, "h-11 px-2")}
              >
                {side === "hit" ? "Fairway" : side === "left" ? "← Left" : "Right →"}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex items-center justify-between rounded-[22px] bg-surface py-2.5 pl-4 pr-2.5">
        <span className="text-[15px] font-semibold">Penalties</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => set({ penalties: draft.penalties - 1 })}
            disabled={draft.penalties <= 0}
            aria-label="Fewer penalties"
            className="press flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"
          >
            <Minus className="h-4 w-4" strokeWidth={2.4} />
          </button>
          <output aria-live="polite" aria-label="Penalties" className="font-display tabular w-5 text-center text-[22px]">
            {draft.penalties}
          </output>
          <button
            type="button"
            onClick={() => set({ penalties: draft.penalties + 1 })}
            disabled={draft.penalties >= draft.score - 1}
            aria-label="More penalties"
            className="press flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>
      </div>

      <p className="text-[12.5px] text-fg-subtle" aria-live="polite">
        {live.gir ? "Green in regulation." : `Missed the green in regulation${draft.score <= hole.par ? " — but scrambled for par or better." : "."}`}
        {current ? " · Saved" : ""}
      </p>

      {error ? (
        <p role="alert" className="rounded-2xl bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">
          {error}
        </p>
      ) : null}

      <section className="mt-4 flex flex-col gap-3">
        <h2 className="dsp text-[24px] leading-none">Scorecard</h2>
        <div className="flex flex-col gap-3 rounded-[22px] bg-ink p-3 text-white">
          {[holes.slice(0, 9), holes.slice(9)]
            .filter((side) => side.length > 0)
            .map((side, sideIndex) => {
              const sideStats = side.map((h) => stats[h.hole_number - 1]);
              const sideTotal = sideStats.reduce((sum, stat) => sum + (stat?.score ?? 0), 0);
              return (
                <div key={sideIndex} className="overflow-x-auto">
                  <table className="tabular w-full text-center text-[12px]">
                    <caption className="sr-only">{sideIndex === 0 ? "Front nine" : "Back nine"}</caption>
                    <thead>
                      <tr className="text-[#a9ad9f]">
                        <th scope="row" className="dsp w-10 text-left text-[10px] font-bold">
                          Hole
                        </th>
                        {side.map((h) => (
                          <th key={h.hole_number} scope="col" className="font-bold">
                            <button
                              type="button"
                              onClick={() => go(h.hole_number - 1)}
                              className={cn("w-full rounded-md py-0.5", h.hole_number - 1 === index && "bg-accent text-white")}
                              aria-label={`Go to hole ${h.hole_number}`}
                            >
                              {h.hole_number}
                            </button>
                          </th>
                        ))}
                        <th scope="col" className="dsp text-[10px] font-bold">
                          {sideIndex === 0 ? "Out" : "In"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-[#a9ad9f]">
                        <th scope="row" className="dsp text-left text-[10px] font-bold">
                          Par
                        </th>
                        {side.map((h) => (
                          <td key={h.hole_number}>{h.par}</td>
                        ))}
                        <td>{side.reduce((sum, h) => sum + h.par, 0)}</td>
                      </tr>
                      <tr className="font-display text-[15px]">
                        <th scope="row" className="dsp text-left font-sans text-[10px] font-bold text-[#a9ad9f]">
                          You
                        </th>
                        {side.map((h, i) => {
                          const stat = sideStats[i];
                          return (
                            <td key={h.hole_number} className="py-1">
                              {stat ? <ScoreMark score={stat.score} par={h.par} /> : <span className="text-[#6a6f60]">·</span>}
                            </td>
                          );
                        })}
                        <td>{sideTotal || "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              );
            })}
        </div>
        <p className="tabular text-[13px] text-fg-muted">
          {played.length} of {holes.length} holes · {total || "—"} strokes
        </p>
        {round.status === "complete" ? (
          <ButtonLink href={`/rounds/${round.id}`} variant="secondary" className="self-start">
            View round summary
          </ButtonLink>
        ) : null}
      </section>

      <form id="finish-round" action={finishAction}>
        <input type="hidden" name="round_id" value={round.id} />
        {finishState.message ? (
          <p role="alert" className="text-[13px] text-bad">
            {finishState.message}
          </p>
        ) : null}
      </form>

      <ActionBar>
        <Button
          type="button"
          variant="secondary"
          className={cn(barButton, "bg-bg")}
          onClick={() => go(index - 1)}
          disabled={index === 0 || saving}
        >
          Previous
        </Button>
        {finishable && current && draftUnchanged(draft, current) ? (
          <Button type="submit" form="finish-round" className={barButton} disabled={finishing}>
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Finish round
          </Button>
        ) : (
          <Button type="button" className={barButton} onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {index === holes.length - 1 || (complete && current) ? "Save hole" : "Next hole"}
          </Button>
        )}
      </ActionBar>
    </div>
  );
}

/** The design's scorecard marks: a circle under par, a box over, two boxes for a double. */
function ScoreMark({ score, par }: { score: number; par: number }) {
  const diff = score - par;
  if (diff < 0) {
    return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent">{score}</span>;
  }
  if (diff === 0) return <span>{score}</span>;
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-[5px] border-[1.5px] border-white",
        diff >= 2 && "shadow-[0_0_0_2px_#23271f,0_0_0_3.5px_#ffffff]",
      )}
    >
      {score}
    </span>
  );
}

function draftUnchanged(draft: Draft, stat: HoleStat): boolean {
  return (
    draft.score === stat.score &&
    draft.putts === (stat.putts ?? 2) &&
    draft.fairway === stat.fairway &&
    draft.penalties === stat.penalties
  );
}

function scoreTone(toPar: number): string {
  if (toPar < 0) return "bg-accent-soft text-accent-strong";
  if (toPar === 0) return "bg-surface-2 text-fg";
  if (toPar === 1) return "bg-warn-soft text-warn";
  return "bg-bad-soft text-bad";
}
