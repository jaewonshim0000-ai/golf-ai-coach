"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ChevronLeft, Loader2, Minus, Plus } from "lucide-react";

import { finishRoundAction, saveHoleShotsAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { START_OPTIONS, optionFor, unitFor, type StartOption } from "@/lib/golf/hole-entry";
import type { HoleSpec, Round, Shot } from "@/types/rounds";
import { cn, toParLabel } from "@/lib/utils";
import { ActionBar, Button, RoundButton, StepDot, StepStrip, barButton } from "@/components/ui/primitives";

/**
 * One hole at a time, as the design's live-hole screen: the hole map with the
 * shots so far, the hole number with par and yards, a strip of the holes
 * around this one, the shots already logged, and the next shot being set up -
 * where it is played from and how far is left. Next shot adds it; Holed it
 * finishes the hole.
 *
 * Under the hood a hole is still the list of places each shot started from;
 * the last one finished in the hole, which is all strokes gained needs.
 */

type Row = { start: StartOption; distance: string; penalty: number };
type HoleDraft = { par: number; rows: Row[] };

const LABEL: Record<StartOption, string> = Object.fromEntries(START_OPTIONS.map((option) => [option.id, option.label])) as Record<StartOption, string>;
const SHORT: Record<StartOption, string> = {
  tee_driver: "Tee",
  tee: "Tee",
  fairway: "Fairway",
  rough: "Rough",
  sand: "Sand",
  recovery: "Recovery",
  fringe: "Fringe",
  green: "Green",
};

function freshHole(hole: HoleSpec): HoleDraft {
  const par = Math.min(5, Math.max(3, hole.par));
  return { par, rows: [{ start: par >= 4 ? "tee_driver" : "tee", distance: String(hole.yards), penalty: 0 }] };
}

function nextStart(previous: Row | undefined): StartOption {
  return previous?.start === "green" ? "green" : "fairway";
}

const strokesOf = (draft: HoleDraft) => draft.rows.length + draft.rows.reduce((sum, row) => sum + row.penalty, 0);
const yardsOf = (row: Row) => (unitFor(row.start) === "feet" ? Number(row.distance) / 3 : Number(row.distance));

/** The hole as a picture: fairway to the green, a dot where each shot was played from. */
function HoleMap({ draft, current, holeNumber }: { draft: HoleDraft; current: number; holeNumber: number }) {
  // Along the dashed line from the tee (0) to the flag (1), by distance covered.
  const path = (t: number) => {
    const a = [73, 258];
    const b = [168, 172];
    const c = [300, 104];
    const x = (1 - t) * (1 - t) * a[0]! + 2 * (1 - t) * t * b[0]! + t * t * c[0]!;
    const y = (1 - t) * (1 - t) * a[1]! + 2 * (1 - t) * t * b[1]! + t * t * c[1]!;
    return [x, y] as const;
  };
  const total = yardsOf(draft.rows[0]!) || 1;
  const stops = draft.rows.map((row, index) => {
    const left = Number.isFinite(yardsOf(row)) && row.distance !== "" ? yardsOf(row) : 0;
    return { index, at: index === 0 ? 0 : Math.min(0.98, Math.max(0.05, 1 - left / total)) };
  });
  return (
    <svg
      role="img"
      aria-label={`Map of hole ${holeNumber}: ${draft.rows.length} shot${draft.rows.length === 1 ? "" : "s"} so far`}
      viewBox="0 0 390 280"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
    >
      <rect width="390" height="280" fill="#34481F" />
      <g fill="#2B3C19">
        <circle cx="30" cy="120" r="26" />
        <circle cx="70" cy="96" r="22" />
        <circle cx="360" cy="200" r="30" />
        <circle cx="330" cy="240" r="24" />
        <circle cx="200" cy="40" r="22" />
        <circle cx="120" cy="40" r="18" />
        <circle cx="380" cy="120" r="20" />
      </g>
      <path
        d="M40 280 C60 230 90 200 140 180 C200 156 250 140 280 110 C300 92 320 84 340 92 C350 104 330 130 300 146 C260 168 210 186 170 206 C130 226 110 250 104 280Z"
        fill="#7C9C45"
      />
      <circle cx="308" cy="98" r="34" fill="#A6C266" />
      <ellipse cx="262" cy="70" rx="18" ry="9" fill="#E6DDBF" />
      <ellipse cx="352" cy="132" rx="14" ry="8" fill="#E6DDBF" />
      <ellipse cx="200" cy="200" rx="16" ry="7" fill="#E6DDBF" />
      <rect x="62" y="252" width="22" height="12" rx="3" fill="#A6C266" />
      <path d="M73 258 Q168 172 300 104" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="3 5" strokeLinecap="round" />
      <line x1="316" y1="74" x2="316" y2="100" stroke="#FFFFFF" strokeWidth="2" />
      <path className="flag-wave" d="M316 74 l14 4.5 -14 4.5z" fill="#E8C547" />
      <g fontFamily="var(--font-anton), Anton, sans-serif" fontSize="13" textAnchor="middle">
        {stops.slice(1).map(({ index, at }) => {
          const [x, y] = path(at);
          return (
            <g key={index}>
              <circle cx={x} cy={y} r="12" fill={index === current ? "#E8C547" : "#FFFFFF"} />
              <text x={x} y={y + 5} fill="#1E211B">
                {index}
              </text>
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function HoleEntry({ round, holes, initialShots }: { round: Round; holes: HoleSpec[]; initialShots: Shot[] }) {
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
  const [editing, setEditing] = useState(() => draftFor(holeIndex).rows.length - 1);
  const [dirty, setDirty] = useState(false);

  const hole = holes[holeIndex]!;
  const last = holeIndex === holes.length - 1;
  const played = new Map(saved);
  if (dirty) played.set(hole.hole_number, draft);
  const totalStrokes = [...played.values()].reduce((sum, item) => sum + strokesOf(item), 0);
  const totalPar = [...played.values()].reduce((sum, item) => sum + item.par, 0);
  const row = draft.rows[editing] ?? draft.rows.at(-1)!;
  const unit = unitFor(row.start) === "feet" ? "ft" : "yd";
  const distance = Number(row.distance);
  const valid = row.distance !== "" && Number.isFinite(distance) && distance >= 1;

  function edit(change: (current: HoleDraft) => HoleDraft) {
    setDraft(change);
    setDirty(true);
    setError(null);
  }

  function editRow(patch: Partial<Row>) {
    edit((current) => ({
      ...current,
      rows: current.rows.map((item, k) => (k === editing ? { ...item, ...patch } : item)),
    }));
  }

  /** Save the hole on screen if it changed. False when it could not be saved. */
  async function saveHole(): Promise<boolean> {
    if (!dirty) return true;
    const result = await saveHoleShotsAction({
      round_id: round.id,
      hole_number: hole.hole_number,
      par: draft.par,
      rows: draft.rows.map((item) => ({ start: item.start, distance: Number(item.distance), penalty: item.penalty })),
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
      const next = draftFor(index);
      setHoleIndex(index);
      setDraft(next);
      setEditing(next.rows.length - 1);
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

  function nextShot() {
    if (!valid) {
      setError(`How far from the hole was shot ${editing + 1}?`);
      return;
    }
    if (editing < draft.rows.length - 1) {
      setEditing(draft.rows.length - 1);
      return;
    }
    edit((current) => ({
      ...current,
      rows: [...current.rows, { start: nextStart(current.rows.at(-1)), distance: "", penalty: 0 }],
    }));
    setEditing(draft.rows.length);
  }

  function holedIt() {
    if (draft.rows.some((item) => item.distance === "" || !(Number(item.distance) >= 1))) {
      setError("Every shot needs its distance before the hole can be saved.");
      return;
    }
    if (last) finish();
    else goTo(holeIndex + 1);
  }

  // Five holes around this one, as in the design's strip.
  const start = Math.max(0, Math.min(holeIndex - 2, holes.length - 5));
  const strip = holes.slice(start, start + 5);
  const step = row.start === "green" ? 1 : 5;

  return (
    <div className="flex flex-col">
      <div className="relative -mx-4 -mt-5 h-[280px] overflow-hidden md:-mx-8 md:-mt-8">
        <HoleMap draft={draft} current={editing} holeNumber={hole.hole_number} />
        <div className="relative z-10 flex items-center justify-between gap-3 px-5 pt-5 md:px-8">
          <RoundButton href={`/rounds/${round.id}`} tone="hero" label="Back to the round">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
          <span className="dsp inline-flex h-9 max-w-[70%] items-center truncate rounded-full bg-[rgb(20_24_15_/_0.6)] px-3.5 text-[11px] tracking-[0.1em] text-white">
            {round.course_name.split(" ")[0]} · Thru {played.size}
            {played.size ? ` · ${toParLabel(totalStrokes - totalPar)}` : ""}
          </span>
        </div>
      </div>

      <div className="sheet-rise relative z-10 -mx-4 -mt-7 flex min-h-[calc(100svh-252px)] flex-col gap-3.5 rounded-t-[28px] bg-surface px-5 pb-36 pt-[22px] md:-mx-8 md:px-8 md:pb-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="dsp text-[44px] leading-none">Hole {hole.hole_number}</h1>
          <dl className="flex gap-1.5">
            <button
              type="button"
              onClick={() => edit((current) => ({ ...current, par: current.par === 5 ? 3 : current.par + 1 }))}
              aria-label={`Par ${draft.par}. Tap to change`}
              className="press flex h-[50px] w-[50px] flex-col items-center justify-center rounded-full bg-surface-2 leading-none"
            >
              <dt className="text-[9px] font-bold tracking-[0.08em] text-fg-subtle">PAR</dt>
              <dd className="font-display mt-0.5 text-[18px]">{draft.par}</dd>
            </button>
            <div className="flex h-[50px] w-[50px] flex-col items-center justify-center rounded-full bg-surface-2 leading-none">
              <dt className="text-[9px] font-bold tracking-[0.08em] text-fg-subtle">YDS</dt>
              <dd className="font-display tabular mt-0.5 text-[18px]">{hole.yards}</dd>
            </div>
            {hole.handicap_index ? (
              <div className="flex h-[50px] w-[50px] flex-col items-center justify-center rounded-full bg-surface-2 leading-none">
                <dt className="text-[9px] font-bold tracking-[0.08em] text-fg-subtle">SI</dt>
                <dd className="font-display mt-0.5 text-[18px]">{hole.handicap_index}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <StepStrip columns={5} aria-label="Holes" role="navigation" className="gap-2 p-2.5">
          {strip.map((item) => {
            const index = holes.indexOf(item);
            const done = played.get(item.hole_number);
            const current = index === holeIndex;
            return (
              <button
                key={item.hole_number}
                type="button"
                disabled={pending}
                onClick={() => (current ? undefined : goTo(index))}
                aria-current={current ? "step" : undefined}
                aria-label={`Hole ${item.hole_number}${done && !current ? `, scored ${strokesOf(done)}` : current ? ", playing" : ""}`}
                className="press min-w-0"
              >
                <StepDot
                  tone={current ? "good" : done ? "done" : "next"}
                  value={item.hole_number}
                  label={current ? "Hole" : done ? `Score ${strokesOf(done)}` : "Hole"}
                  className={cn(current && "step-now")}
                />
              </button>
            );
          })}
        </StepStrip>

        {draft.rows.length > 1 || editing > 0 ? (
          <ol aria-label="Shots on this hole" className="flex flex-col gap-2">
            {draft.rows.slice(0, -1).map((item, index) => {
              const next = draft.rows[index + 1]!;
              const covered = Math.round(yardsOf(item) - yardsOf(next));
              const isEditing = index === editing;
              return (
                <li key={index}>
                  <button
                    type="button"
                    onClick={() => setEditing(index)}
                    className={cn("flex w-full items-center gap-3 rounded-2xl text-left", isEditing && "bg-surface-2 px-2 py-1.5")}
                  >
                    <span
                      className={cn(
                        "font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[16px]",
                        index === draft.rows.length - 2 ? "bg-gold text-[#1e211b]" : "border-[1.5px] border-fg",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-bold">{LABEL[item.start]}</span>
                      <span className="block truncate text-[12.5px] text-fg-subtle">
                        {SHORT[item.start]} → {SHORT[next.start]}
                        {Number.isFinite(covered) && covered > 0 ? ` · ${covered} yds` : ""}
                      </span>
                    </span>
                    {item.penalty ? (
                      <span className="dsp inline-flex h-7 items-center rounded-full bg-bad-soft px-2.5 text-[11px] text-bad">+1</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        ) : null}

        <section className="flex flex-col gap-3 rounded-[22px] bg-surface-2 p-4">
          <h2 className="dsp text-[20px] leading-none">Shot {editing + 1} · from</h2>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Starting lie">
            {START_OPTIONS.filter((option) => (editing === 0 ? option.id.startsWith("tee") : !option.id.startsWith("tee") || option.id === row.start)).map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={row.start === option.id}
                onClick={() => editRow({ start: option.id })}
                className={cn(
                  "press dsp h-9 rounded-full px-3.5 text-[11px]",
                  row.start === option.id ? "bg-accent text-white" : "border-[1.5px] border-fg bg-surface",
                )}
              >
                {editing === 0 ? option.label.replace(/^Tee \((.*)\)$/, "$1") : option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-semibold">Distance to hole</span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label="Less"
                onClick={() => editRow({ distance: String(Math.max(1, (valid ? distance : 0) - step)) })}
                className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface"
              >
                <Minus className="h-4 w-4" strokeWidth={2.4} />
              </button>
              <label className="font-display flex items-baseline gap-1 text-[24px] uppercase">
                <span className="sr-only">Shot {editing + 1} distance in {unit === "ft" ? "feet" : "yards"}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={700}
                  value={row.distance}
                  placeholder="—"
                  onChange={(event) => editRow({ distance: event.target.value })}
                  autoFocus={dirty && row.distance === ""}
                  className="tabular w-[3.2ch] bg-transparent text-right outline-none [appearance:textfield] focus:underline [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span>{unit}</span>
              </label>
              <button
                type="button"
                aria-label="More"
                onClick={() => editRow({ distance: String(Math.min(700, (valid ? distance : 0) + step)) })}
                className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface"
              >
                <Plus className="h-4 w-4" strokeWidth={2.4} />
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => editRow({ penalty: row.penalty ? 0 : 1 })}
              aria-pressed={row.penalty > 0}
              title="Penalty stroke: water, out of bounds, lost or unplayable"
              className={cn(
                "press dsp h-8 rounded-full px-3 text-[10px]",
                row.penalty ? "bg-bad text-white" : "border-[1.5px] border-dashed border-[#a9ad9f] text-fg-muted",
              )}
            >
              {row.penalty ? "Penalty +1" : "+ Penalty"}
            </button>
            {draft.rows.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  edit((current) => ({ ...current, rows: current.rows.filter((_, k) => k !== editing) }));
                  setEditing((index) => Math.max(0, Math.min(index, draft.rows.length - 2)));
                }}
                className="text-[12px] font-semibold text-fg-subtle underline underline-offset-2"
              >
                Remove shot
              </button>
            ) : null}
          </div>
        </section>

        {error ? (
          <p role="alert" className="rounded-2xl bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-fg-subtle">
          <span>
            {played.size} hole{played.size === 1 ? "" : "s"} · <span className="tabular font-semibold text-fg">{totalStrokes}</span>{" "}
            strokes
          </span>
          <span className="flex gap-3">
            {saved.size === 0 && !dirty ? (
              <Link href={`/rounds/${round.id}/score`} className="font-semibold text-accent">
                Score only
              </Link>
            ) : null}
            {!last ? (
              <button type="button" onClick={finish} disabled={pending} className="font-semibold text-accent">
                End round
              </button>
            ) : null}
          </span>
        </div>

        <ActionBar className="[--bar-fade:var(--c-surface)]">
          <Button type="button" variant="secondary" className={cn(barButton, "bg-surface")} disabled={pending} onClick={holedIt}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {last ? "Holed · finish" : "Holed it"}
          </Button>
          <Button type="button" className={barButton} disabled={pending || draft.rows.length >= 20} onClick={nextShot}>
            Next shot
          </Button>
        </ActionBar>
      </div>
    </div>
  );
}
