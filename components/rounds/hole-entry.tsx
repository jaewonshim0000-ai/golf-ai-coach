"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, Flag, Loader2, Plus, Trash2 } from "lucide-react";

import { finishRoundAction, saveHoleShotsAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { START_OPTIONS, optionFor, unitFor, type StartOption } from "@/lib/golf/hole-entry";
import type { HoleSpec, Round, Shot } from "@/types/rounds";
import { cn, toParLabel } from "@/lib/utils";
import { Button, ButtonLink, HeroPill, MiniCard } from "@/components/ui/primitives";

/**
 * One hole at a time: pick the par, then list where each shot started from
 * and how far it was from the hole. The last shot finished in the hole.
 */

type Row = { start: StartOption; distance: string; penalty: number };
type HoleDraft = { par: number; rows: Row[] };

const PARS = [3, 4, 5];

function freshHole(hole: HoleSpec): HoleDraft {
  const par = Math.min(5, Math.max(3, hole.par));
  return { par, rows: [{ start: par >= 4 ? "tee_driver" : "tee", distance: String(hole.yards), penalty: 0 }] };
}

function nextStart(previous: Row | undefined): StartOption {
  return previous?.start === "green" ? "green" : "fairway";
}

const strokesOf = (draft: HoleDraft) => draft.rows.length + draft.rows.reduce((sum, row) => sum + row.penalty, 0);

export function HoleEntry({ round, holes, initialShots }: { round: Round; holes: HoleSpec[]; initialShots: Shot[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [saved, setSaved] = useState(() => {
    const byHole = new Map<number, HoleDraft>();
    for (const shot of initialShots) {
      const draft = byHole.get(shot.hole_number) ?? { par: shot.hole_par, rows: [] };
      draft.rows[shot.shot_number - 1] = {
        start: optionFor(shot),
        distance: String(Math.round(shot.starting_distance)),
        penalty: shot.penalty_strokes,
      };
      byHole.set(shot.hole_number, draft);
    }
    for (const draft of byHole.values()) draft.rows = draft.rows.filter(Boolean);
    return byHole;
  });

  const draftFor = (index: number) => {
    const hole = holes[index]!;
    return saved.get(hole.hole_number) ?? freshHole(hole);
  };

  const [holeIndex, setHoleIndex] = useState(() => {
    const next = holes.findIndex((hole) => !saved.has(hole.hole_number));
    return next === -1 ? 0 : next;
  });
  const [draft, setDraft] = useState<HoleDraft>(() => draftFor(holeIndex));
  const [dirty, setDirty] = useState(false);

  const hole = holes[holeIndex]!;
  const last = holeIndex === holes.length - 1;
  const strokes = strokesOf(draft);
  const played = new Map(saved);
  if (dirty) played.set(hole.hole_number, draft);
  const totalStrokes = [...played.values()].reduce((sum, item) => sum + strokesOf(item), 0);
  const totalPar = [...played.values()].reduce((sum, item) => sum + item.par, 0);

  function edit(change: (current: HoleDraft) => HoleDraft) {
    setDraft(change);
    setDirty(true);
    setError(null);
  }

  function editRow(index: number, patch: Partial<Row>) {
    edit((current) => ({
      ...current,
      rows: current.rows.map((row, k) => (k === index ? { ...row, ...patch } : row)),
    }));
  }

  /** Save the hole on screen if it changed. False when it could not be saved. */
  async function saveHole(): Promise<boolean> {
    if (!dirty) return true;
    const result = await saveHoleShotsAction({
      round_id: round.id,
      hole_number: hole.hole_number,
      par: draft.par,
      rows: draft.rows.map((row) => ({ start: row.start, distance: Number(row.distance), penalty: row.penalty })),
    });
    if (!result.ok) {
      setError(result.message ?? "Could not save this hole.");
      return false;
    }
    setSaved((current) => new Map(current).set(hole.hole_number, draft));
    setDirty(false);
    return true;
  }

  function goTo(index: number) {
    startTransition(async () => {
      if (!(await saveHole())) return;
      setHoleIndex(index);
      setDraft(draftFor(index));
      setDirty(false);
      setError(null);
      window.scrollTo({ top: 0 });
    });
  }

  function finish() {
    startTransition(async () => {
      if (!(await saveHole())) return;
      const form = new FormData();
      form.set("round_id", round.id);
      // Redirects to the round summary when it works.
      const result = await finishRoundAction(IDLE, form);
      if (result && !result.ok) setError(result.message ?? "Could not finish the round.");
    });
  }

  return (
    <div>
      <div className="hero-art relative -mx-4 -mt-5 flex min-h-[190px] flex-col justify-between overflow-hidden md:-mx-8 md:-mt-8">
        <div className="hero-scrim pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex items-start justify-between gap-3 p-5 pb-6">
          <Button type="button" variant="onHero" size="sm" onClick={() => router.push(`/rounds/${round.id}`)}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            {saved.size === 0 && !dirty ? (
              <ButtonLink href={`/rounds/${round.id}/score`} variant="onHero" size="sm">
                Score only
              </ButtonLink>
            ) : null}
            <HeroPill tone="solid">{round.course_name}</HeroPill>
          </div>
        </div>
        <div className="relative z-10 p-5 pt-0">
          <p className="dsp text-[11px] font-medium tracking-[0.2em] text-white/80">
            Par {draft.par} · {strokes} stroke{strokes === 1 ? "" : "s"}
          </p>
          <h1 className="dsp mt-1 text-[38px] font-semibold leading-[0.94] tracking-[-0.02em] text-white">
            Hole {hole.hole_number}
          </h1>
        </div>
      </div>

      <div className="mx-auto mt-4 max-w-xl space-y-5">
        <div className="no-bar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
          {holes.map((item, index) => {
            const active = index === holeIndex;
            const done = saved.has(item.hole_number);
            return (
              <button
                key={item.hole_number}
                type="button"
                onClick={() => (active ? undefined : goTo(index))}
                disabled={pending}
                aria-current={active ? "true" : undefined}
                aria-label={`Hole ${item.hole_number}${done ? ", saved" : ""}`}
                className={cn(
                  "tabular dsp flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-[14px] font-semibold transition-colors",
                  active
                    ? "border-transparent bg-[image:var(--grad-accent)] text-white"
                    : done
                      ? "border-transparent bg-[#3c4a3f] text-white"
                      : "border-border-strong text-fg-muted",
                )}
              >
                {item.hole_number}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="dsp text-[13px] font-semibold tracking-[0.12em]">PAR</p>
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Par">
            {PARS.map((par) => (
              <button
                key={par}
                type="button"
                aria-pressed={draft.par === par}
                onClick={() => edit((current) => ({ ...current, par }))}
                className={cn(
                  "tabular h-11 w-14 rounded-xl border text-[17px] font-semibold transition-colors",
                  draft.par === par
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border-strong bg-surface text-fg-muted hover:text-fg",
                )}
              >
                {par}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="grid grid-cols-[1rem_minmax(0,1fr)_5.5rem_3.75rem] items-center gap-2 pb-2 text-[11px] font-semibold tracking-[0.12em]">
            <span />
            <span>STARTING LIE</span>
            <span>LENGTH</span>
            <span />
          </div>
          <ol className="space-y-2.5">
            {draft.rows.map((row, index) => {
              const unit = unitFor(row.start) === "feet" ? "ft" : "yd";
              return (
                <li key={index} className="grid grid-cols-[1rem_minmax(0,1fr)_5.5rem_3.75rem] items-center gap-2">
                  <span className="tabular text-[13px] text-fg-muted">{index + 1}</span>
                  <div className="relative">
                    <select
                      value={row.start}
                      onChange={(event) => editRow(index, { start: event.target.value as StartOption })}
                      aria-label={`Shot ${index + 1} starting lie`}
                      className="h-12 w-full appearance-none truncate rounded-xl border border-border-strong bg-surface pl-3 pr-8 text-[15px]"
                    >
                      {START_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={700}
                      value={row.distance}
                      onChange={(event) => editRow(index, { distance: event.target.value })}
                      aria-label={`Shot ${index + 1} length in ${unit === "ft" ? "feet" : "yards"}`}
                      autoFocus={dirty && index === draft.rows.length - 1 && row.distance === ""}
                      className="tabular h-12 w-full rounded-xl border border-border-strong bg-surface pl-2.5 pr-7 text-[15px]"
                    />
                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] text-fg-muted">
                      {unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button"
                      onClick={() => editRow(index, { penalty: row.penalty ? 0 : 1 })}
                      aria-pressed={row.penalty > 0}
                      aria-label={`Penalty stroke on shot ${index + 1}`}
                      title="Penalty stroke: water, out of bounds, lost or unplayable"
                      className={cn(
                        "tabular h-8 rounded-lg border px-1.5 text-[11px] font-semibold",
                        row.penalty ? "border-bad bg-bad text-white" : "border-border-strong text-fg-subtle",
                      )}
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      onClick={() => edit((current) => ({ ...current, rows: current.rows.filter((_, k) => k !== index) }))}
                      disabled={draft.rows.length === 1}
                      aria-label={`Delete shot ${index + 1}`}
                      className="flex h-9 w-7 items-center justify-center text-fg-muted hover:text-bad disabled:opacity-30"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          <button
            type="button"
            onClick={() =>
              edit((current) => ({
                ...current,
                rows: [...current.rows, { start: nextStart(current.rows.at(-1)), distance: "", penalty: 0 }],
              }))
            }
            disabled={draft.rows.length >= 20}
            className="mt-3 flex items-center gap-5 py-2 text-[15px] font-semibold text-accent"
          >
            <Plus className="h-5 w-5 text-fg" /> Add Shot
          </button>

          <div className="mt-2 flex items-center gap-5">
            <Flag className="h-5 w-5 shrink-0 text-fg-muted" />
            <p className="flex-1 rounded-xl bg-accent-soft px-4 py-3 text-[15px] font-medium">In the hole</p>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={pending}
          onClick={() => (last ? finish() : goTo(holeIndex + 1))}
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {last ? "Finish round" : "Next hole"}
        </Button>

        <MiniCard className="flex items-center justify-between gap-3 p-4">
          <span className="text-[12px] text-fg-muted">
            {played.size} hole{played.size === 1 ? "" : "s"} ·{" "}
            <span className="tabular font-semibold text-fg">{totalStrokes}</span> strokes
            {played.size ? ` · ${toParLabel(totalStrokes - totalPar)}` : ""}
          </span>
          {!last ? (
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={finish}>
              End round
            </Button>
          ) : null}
        </MiniCard>
      </div>
    </div>
  );
}
