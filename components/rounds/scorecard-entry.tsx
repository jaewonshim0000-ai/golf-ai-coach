"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Loader2, Minus, Plus } from "lucide-react";

import { finishScorecardAction, saveHoleAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { lineFromStat } from "@/lib/analytics/classic";
import type { HoleSpec, HoleStat, Round } from "@/types/rounds";
import { cn, signed } from "@/lib/utils";
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

/**
 * The live scorecard. One hole at a time, sized for a thumb on a tee box:
 * everything starts at the likely answer (par, two putts, no penalties), so a
 * routine hole is one tap on Save. Each hole is stored the moment it is saved.
 */

const NAMES: Record<number, string> = { [-3]: "Albatross", [-2]: "Eagle", [-1]: "Birdie", 0: "Par", 1: "Bogey", 2: "Double bogey", 3: "Triple bogey" };

function scoreName(toPar: number): string {
  return NAMES[toPar] ?? (toPar < 0 ? `${-toPar} under` : `${toPar} over`);
}

function toParTone(toPar: number): string {
  if (toPar < 0) return "bg-good text-white";
  if (toPar === 1) return "bg-warn-soft text-warn";
  if (toPar >= 2) return "bg-bad-soft text-bad";
  return "text-fg";
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

  return (
    <div className="space-y-5">
      <PageHero
        art="course"
        size="sm"
        eyebrow={`${holes.length} holes · ${round.tees ? `${round.tees} tees` : "Scorecard"}`}
        title={
          <>
            Live
            <br />
            scorecard
          </>
        }
        pills={<HeroPill tone="solid">{round.course_name}</HeroPill>}
        topLeft={
          <ButtonLink href={`/rounds/${round.id}`} variant="onHero" size="sm">
            Round
          </ButtonLink>
        }
      />

      <Card>
        <CardContent className="grid grid-cols-3 gap-4 p-5">
          <Stat label="Thru" value={played.length} sub={`of ${holes.length}`} />
          <Stat label="Score" value={total || "—"} sub={complete ? "final" : "so far"} />
          <Stat
            label="To par"
            value={played.length ? (toPar === 0 ? "E" : signed(toPar, 0)) : "—"}
            tone={toPar > 0 ? "bad" : toPar < 0 ? "good" : "neutral"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <Button type="button" variant="secondary" size="icon" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous hole">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-center">
            <CardTitle className="text-[22px]">Hole {hole.hole_number}</CardTitle>
            <p className="tabular text-[12px] text-fg-muted">
              Par {hole.par} · {hole.yards} yd{stats[index] ? " · saved" : ""}
            </p>
          </div>
          <Button type="button" variant="secondary" size="icon" onClick={() => go(index + 1)} disabled={index === holes.length - 1} aria-label="Next hole">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="text-center">
            <Stepper label="Strokes" value={draft.score} min={1} max={20} onChange={(score) => set({ score })} big />
            <p className={cn("mt-2 text-[13px] font-medium", draft.score < hole.par ? "text-good" : draft.score > hole.par ? "text-bad" : "text-fg-muted")}>
              {scoreName(draft.score - hole.par)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Stepper label="Putts" value={draft.putts} min={0} max={draft.score - draft.penalties} onChange={(putts) => set({ putts })} />
            <Stepper label="Penalties" value={draft.penalties} min={0} max={draft.score - 1} onChange={(penalties) => set({ penalties })} />
          </div>

          {hole.par >= 4 ? (
            <div>
              <p className="dsp mb-1.5 text-[9px] tracking-[0.15em] text-fg-subtle">Tee shot</p>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Fairway">
                {(["left", "hit", "right"] as const).map((side) => (
                  <Button
                    key={side}
                    type="button"
                    variant={draft.fairway === side ? "primary" : "secondary"}
                    aria-pressed={draft.fairway === side}
                    onClick={() => set({ fairway: draft.fairway === side ? null : side })}
                  >
                    {side === "hit" ? "Fairway" : side === "left" ? "Left" : "Right"}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] text-fg-muted" aria-live="polite">
            {live.gir ? "Green in regulation." : `Missed the green in regulation${draft.score <= hole.par ? " — but scrambled for par or better." : "."}`}
          </p>

          {error ? <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{error}</p> : null}

          <Button type="button" className="w-full" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {stats[index] ? `Update hole ${hole.hole_number}` : `Save hole ${hole.hole_number}`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scorecard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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
                      <tr className="text-fg-subtle">
                        <th scope="row" className="w-10 text-left font-normal">Hole</th>
                        {side.map((h) => (
                          <th key={h.hole_number} scope="col" className="font-normal">
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
                        <th scope="col" className="font-normal">{sideIndex === 0 ? "Out" : "In"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-fg-subtle">
                        <th scope="row" className="text-left font-normal">Par</th>
                        {side.map((h) => <td key={h.hole_number}>{h.par}</td>)}
                        <td>{side.reduce((sum, h) => sum + h.par, 0)}</td>
                      </tr>
                      <tr className="font-semibold">
                        <th scope="row" className="text-left font-normal text-fg-subtle">Score</th>
                        {side.map((h, i) => {
                          const stat = sideStats[i];
                          return (
                            <td key={h.hole_number} className="py-1">
                              {stat ? (
                                <span className={cn("inline-flex h-6 w-6 items-center justify-center rounded-full", toParTone(stat.score - h.par))}>
                                  {stat.score}
                                </span>
                              ) : (
                                <span className="text-fg-subtle">·</span>
                              )}
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
        </CardContent>
      </Card>

      {round.status === "complete" ? (
        <ButtonLink href={`/rounds/${round.id}`} className="w-full">
          View round summary
        </ButtonLink>
      ) : (
        <form action={finishAction} className="space-y-2">
          <input type="hidden" name="round_id" value={round.id} />
          {finishState.message ? <p role="alert" className="text-sm text-bad">{finishState.message}</p> : null}
          <Button type="submit" variant={complete ? "primary" : "secondary"} className="w-full" disabled={!complete || finishing}>
            {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {complete ? "Finish round" : `Finish after hole ${holes.length}`}
          </Button>
        </form>
      )}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  big = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  big?: boolean;
}) {
  return (
    <div className={cn("space-y-1.5", big && "mx-auto max-w-[240px]")}>
      <span className="dsp block text-[9px] tracking-[0.15em] text-fg-subtle">{label}</span>
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="icon" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
          <Minus className="h-4 w-4" />
        </Button>
        <output aria-live="polite" aria-label={label} className={cn("tabular font-semibold", big ? "text-[44px] leading-none" : "text-[24px]")}>
          {value}
        </output>
        <Button type="button" variant="secondary" size="icon" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
