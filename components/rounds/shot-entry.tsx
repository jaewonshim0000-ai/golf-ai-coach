"use client";

import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, Flag, Loader2, Trash2 } from "lucide-react";

import { addShotAction, deleteShotAction, finishRoundAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import type { Club, Lie, MissDirection, PenaltyType, ShotType } from "@/types/golf";
import { CLUBS, CLUB_LABELS, labelize } from "@/types/golf";
import type { HoleSpec, Round, Shot } from "@/types/rounds";
import { cn } from "@/lib/utils";
import { AROUND_GREEN_YARDS } from "@/lib/golf/strokes-gained";
import { Badge, Button, Card, CardContent, Field, Input, Select } from "@/components/ui/primitives";

/**
 * Shot entry.
 *
 * Designed to be usable standing on a tee box: the next shot is pre-filled from
 * where the last one finished, clubs are chips rather than a dropdown, and the
 * only thing you normally have to type is a distance.
 */

const RESULT_LIES: { lie: Lie; label: string }[] = [
  { lie: "fairway", label: "Fairway" },
  { lie: "first_cut", label: "First cut" },
  { lie: "rough", label: "Rough" },
  { lie: "deep_rough", label: "Deep rough" },
  { lie: "fairway_bunker", label: "Fairway bunker" },
  { lie: "greenside_bunker", label: "Greenside bunker" },
  { lie: "fringe", label: "Fringe" },
  { lie: "green", label: "Green" },
  { lie: "recovery", label: "Trees" },
  { lie: "hazard", label: "Hazard" },
  { lie: "out_of_bounds", label: "Out of bounds" },
  { lie: "holed", label: "Holed" },
];

const PUTT_RESULTS: { lie: Lie; label: string }[] = [
  { lie: "holed", label: "Holed" },
  { lie: "green", label: "Missed" },
];

const MISSES: MissDirection[] = ["left", "pull", "straight", "push", "right", "short", "long"];

const PENALTY_TYPES: PenaltyType[] = ["water", "out_of_bounds", "unplayable", "lost_ball"];

function deriveShotType(lie: Lie, distanceYards: number, shotNumber: number, par: number): ShotType {
  if (lie === "green") return "putt";
  if (lie === "tee" && shotNumber === 1 && par >= 4) return "tee";
  if (lie === "recovery") return "recovery";
  if (lie === "greenside_bunker" && distanceYards <= AROUND_GREEN_YARDS) return "bunker";
  if (distanceYards <= 10) return "chip";
  if (distanceYards <= AROUND_GREEN_YARDS) return "pitch";
  if (distanceYards > 230 && par >= 5) return "layup";
  return "approach";
}

function suggestClub(distanceYards: number, lie: Lie, bag: Club[]): Club | null {
  if (lie === "green") return bag.includes("putter") ? "putter" : null;
  // Off the tee on a long hole the default is the driver, not whatever club the
  // yardage ladder happens to top out at.
  if (lie === "tee" && distanceYards >= 240 && bag.includes("driver")) return "driver";
  const ladder: [number, Club][] = [
    [235, "3_wood"],
    [215, "5_wood"],
    [198, "3_hybrid"],
    [186, "4_hybrid"],
    [176, "4_iron"],
    [164, "5_iron"],
    [153, "6_iron"],
    [141, "7_iron"],
    [127, "8_iron"],
    [113, "9_iron"],
    [96, "pw"],
    [72, "gw"],
    [40, "sw"],
    [0, "lw"],
  ];
  for (const [min, club] of ladder) {
    if (distanceYards >= min && bag.includes(club)) return club;
  }
  return bag[0] ?? null;
}

type Draft = {
  startingLocation: Lie;
  startingDistance: number;
  club: Club | null;
  endingLocation: Lie;
  endingDistance: string;
  miss: MissDirection | null;
  penaltyStrokes: number;
  penaltyType: PenaltyType;
};

export function ShotEntry({
  round,
  holes,
  initialShots,
  bag,
}: {
  round: Round;
  holes: HoleSpec[];
  initialShots: Shot[];
  bag: Club[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [, finishAction, finishing] = useActionState(finishRoundAction, IDLE);
  const [shots, setShots] = useState<Shot[]>(initialShots);
  const [error, setError] = useState<string | null>(null);
  const [holeIndex, setHoleIndex] = useState(() => {
    const played = new Set(initialShots.filter((s) => s.ending_location === "holed").map((s) => s.hole_number));
    const next = holes.findIndex((h) => !played.has(h.hole_number));
    return next === -1 ? 0 : next;
  });

  const hole = holes[holeIndex]!;
  const holeShots = useMemo(
    () => shots.filter((s) => s.hole_number === hole.hole_number).sort((a, b) => a.shot_number - b.shot_number),
    [shots, hole.hole_number],
  );

  const lastShot = holeShots[holeShots.length - 1];
  const holedOut = lastShot?.ending_location === "holed";
  const shotNumber = holeShots.length + 1;

  const startingLocation: Lie = lastShot
    ? lastShot.ending_location === "hazard" || lastShot.ending_location === "out_of_bounds"
      ? "rough"
      : lastShot.ending_location
    : "tee";
  const startingUnit: "yards" | "feet" = startingLocation === "green" ? "feet" : "yards";
  const startingDistance = lastShot ? lastShot.ending_distance : hole.yards;
  const startingYards = startingUnit === "feet" ? startingDistance / 3 : startingDistance;

  const recentClubs = useMemo(() => {
    const seen: Club[] = [];
    for (const shot of [...shots].reverse()) {
      if (shot.club && !seen.includes(shot.club)) seen.push(shot.club);
      if (seen.length >= 5) break;
    }
    return seen;
  }, [shots]);

  const [draft, setDraft] = useState<Draft>(() => blankDraft(startingLocation, startingDistance, bag, startingYards));
  const [draftKey, setDraftKey] = useState("");

  // Re-seed the draft whenever the ball's position changes.
  const key = `${hole.hole_number}:${shotNumber}:${startingLocation}:${startingDistance}`;
  if (key !== draftKey) {
    setDraftKey(key);
    setDraft(blankDraft(startingLocation, startingDistance, bag, startingYards));
  }

  const isPutt = startingLocation === "green";
  const shotType = deriveShotType(startingLocation, startingYards, shotNumber, hole.par);
  const endingUnit: "yards" | "feet" =
    draft.endingLocation === "green" ? "feet" : draft.endingLocation === "holed" ? "feet" : "yards";

  const strokes = holeShots.length + holeShots.reduce((sum, s) => sum + s.penalty_strokes, 0);
  const totalStrokes = shots.length + shots.reduce((sum, s) => sum + s.penalty_strokes, 0);
  const holesDone = new Set(
    shots.filter((s) => s.ending_location === "holed").map((s) => s.hole_number),
  ).size;

  function submit() {
    setError(null);
    const distance =
      draft.endingLocation === "holed" ? 0 : Number(draft.endingDistance || 0);
    if (draft.endingLocation !== "holed" && !(distance > 0)) {
      setError("Enter the distance the ball finished from the hole.");
      return;
    }

    const penaltyStrokes =
      draft.endingLocation === "hazard" || draft.endingLocation === "out_of_bounds"
        ? Math.max(1, draft.penaltyStrokes)
        : draft.penaltyStrokes;

    const optimistic: Shot = {
      id: `local_${Date.now()}`,
      round_id: round.id,
      user_id: round.user_id,
      hole_number: hole.hole_number,
      hole_par: hole.par,
      shot_number: shotNumber,
      starting_location: startingLocation,
      starting_distance: startingDistance,
      starting_unit: startingUnit,
      lie: startingLocation,
      club: draft.club,
      shot_type: shotType,
      intended_target: null,
      ending_location: draft.endingLocation,
      ending_distance: distance,
      ending_unit: endingUnit,
      penalty_strokes: penaltyStrokes,
      penalty_type: penaltyStrokes > 0 ? draft.penaltyType : "none",
      miss_direction: draft.miss,
      notes: null,
      created_at: new Date().toISOString(),
    };

    setShots((current) => [...current, optimistic]);

    const form = new FormData();
    form.set("round_id", round.id);
    form.set("hole_number", String(hole.hole_number));
    form.set("hole_par", String(hole.par));
    form.set("shot_number", String(shotNumber));
    form.set("starting_location", startingLocation);
    form.set("starting_distance", String(startingDistance));
    form.set("starting_unit", startingUnit);
    if (draft.club) form.set("club", draft.club);
    form.set("shot_type", shotType);
    form.set("ending_location", draft.endingLocation);
    form.set("ending_distance", String(distance));
    form.set("ending_unit", endingUnit);
    form.set("penalty_strokes", String(penaltyStrokes));
    form.set("penalty_type", penaltyStrokes > 0 ? draft.penaltyType : "none");
    if (draft.miss) form.set("miss_direction", draft.miss);

    startTransition(async () => {
      const result = await addShotAction(IDLE, form);
      if (!result.ok) {
        setShots((current) => current.filter((s) => s.id !== optimistic.id));
        setError(result.message ?? Object.values(result.errors ?? {})[0] ?? "Could not save that shot.");
        return;
      }
      router.refresh();
    });
  }

  function removeShot(shot: Shot) {
    setShots((current) => current.filter((s) => s.id !== shot.id));
    const form = new FormData();
    form.set("shot_id", shot.id);
    form.set("round_id", round.id);
    startTransition(async () => {
      await deleteShotAction(IDLE, form);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 pb-4">
      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setHoleIndex((i) => Math.max(0, i - 1))}
            disabled={holeIndex === 0}
            aria-label="Previous hole"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <div className="text-center">
            <p className="text-[11px] uppercase tracking-wider text-fg-subtle">
              Hole {hole.hole_number}
            </p>
            <p className="text-lg font-semibold leading-tight">
              Par {hole.par} &middot; <span className="tabular">{hole.yards}</span> yd
            </p>
            <p className="tabular text-xs text-fg-muted">
              {strokes} shot{strokes === 1 ? "" : "s"} this hole
              {holedOut ? ` · ${strokes - hole.par >= 0 ? "+" : ""}${strokes - hole.par}` : ""}
            </p>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setHoleIndex((i) => Math.min(holes.length - 1, i + 1))}
            disabled={holeIndex === holes.length - 1}
            aria-label="Next hole"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </CardContent>
      </Card>

      {holeShots.length > 0 ? (
        <ol className="space-y-1.5">
          {holeShots.map((shot) => (
            <li
              key={shot.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="tabular w-4 shrink-0 text-xs text-fg-subtle">{shot.shot_number}</span>
                <span className="truncate">
                  <span className="font-medium">{shot.club ? CLUB_LABELS[shot.club] : "—"}</span>
                  <span className="text-fg-muted">
                    {" "}
                    from <span className="tabular">{Math.round(shot.starting_distance)}</span>
                    {shot.starting_unit === "feet" ? " ft" : " yd"} {labelize(shot.starting_location).toLowerCase()}
                  </span>
                  <span className="text-fg-muted">
                    {" → "}
                    {shot.ending_location === "holed"
                      ? "holed"
                      : `${Math.round(shot.ending_distance)}${shot.ending_unit === "feet" ? " ft" : " yd"} ${labelize(shot.ending_location).toLowerCase()}`}
                  </span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                {shot.penalty_strokes > 0 ? <Badge tone="bad">+{shot.penalty_strokes}</Badge> : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeShot(shot)}
                  aria-label={`Delete shot ${shot.shot_number}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {holedOut ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <p className="text-sm text-fg-muted">
              Hole {hole.hole_number} complete in <span className="tabular font-semibold">{strokes}</span>.
            </p>
            {holeIndex < holes.length - 1 ? (
              <Button type="button" onClick={() => setHoleIndex((i) => i + 1)}>
                Next hole <ChevronRight className="h-4 w-4" />
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Shot {shotNumber}</h3>
              <p className="tabular text-xs text-fg-muted">
                {Math.round(startingDistance)}
                {startingUnit === "feet" ? " ft" : " yd"} from {labelize(startingLocation).toLowerCase()}
                {shotType === startingLocation ? "" : ` · ${labelize(shotType).toLowerCase()}`}
              </p>
            </div>

            {!isPutt ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Club</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...new Set([...recentClubs, ...bag])]
                    .filter((club) => club !== "putter")
                    .map((club) => (
                      <Chip
                        key={club}
                        active={draft.club === club}
                        onClick={() => setDraft((d) => ({ ...d, club }))}
                      >
                        {CLUB_LABELS[club]}
                      </Chip>
                    ))}
                </div>
              </div>
            ) : (
              <input type="hidden" value="putter" readOnly />
            )}

            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-muted">Result</p>
              <div className="flex flex-wrap gap-1.5">
                {(isPutt ? PUTT_RESULTS : RESULT_LIES).map(({ lie, label }) => (
                  <Chip
                    key={lie}
                    active={draft.endingLocation === lie}
                    tone={lie === "holed" ? "good" : lie === "out_of_bounds" || lie === "hazard" ? "bad" : "default"}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        endingLocation: lie,
                        endingDistance: lie === "holed" ? "0" : d.endingDistance,
                        penaltyStrokes: lie === "out_of_bounds" || lie === "hazard" ? 1 : 0,
                      }))
                    }
                  >
                    {label}
                  </Chip>
                ))}
              </div>
            </div>

            {draft.endingLocation !== "holed" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={`Distance left (${endingUnit === "feet" ? "feet" : "yards"})`}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={endingUnit === "feet" ? 1 : 1}
                    value={draft.endingDistance}
                    onChange={(e) => setDraft((d) => ({ ...d, endingDistance: e.target.value }))}
                    placeholder={endingUnit === "feet" ? "12" : "35"}
                    autoFocus
                  />
                </Field>

                {!isPutt ? (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-fg-muted">Miss direction</p>
                    <div className="flex flex-wrap gap-1.5">
                      {MISSES.map((miss) => (
                        <Chip
                          key={miss}
                          active={draft.miss === miss}
                          onClick={() =>
                            setDraft((d) => ({ ...d, miss: d.miss === miss ? null : miss }))
                          }
                        >
                          {labelize(miss)}
                        </Chip>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {draft.penaltyStrokes > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Penalty strokes">
                  <Input
                    type="number"
                    min={0}
                    max={3}
                    value={draft.penaltyStrokes}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, penaltyStrokes: Number(e.target.value) }))
                    }
                  />
                </Field>
                <Field label="Penalty type">
                  <Select
                    value={draft.penaltyType}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, penaltyType: e.target.value as PenaltyType }))
                    }
                  >
                    {PENALTY_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {labelize(type)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : null}

            {error ? <p className="text-sm text-bad">{error}</p> : null}

            <Button type="button" className="w-full" onClick={submit} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Add shot {shotNumber}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex gap-6">
            <span className="text-xs text-fg-muted">
              Holes
              <span className="tabular ml-1.5 text-sm font-semibold text-fg">{holesDone}</span>
            </span>
            <span className="text-xs text-fg-muted">
              Strokes
              <span className="tabular ml-1.5 text-sm font-semibold text-fg">{totalStrokes}</span>
            </span>
          </div>
          <form action={finishAction}>
            <input type="hidden" name="round_id" value={round.id} />
            <Button type="submit" variant="secondary" size="sm" disabled={finishing}>
              {finishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flag className="h-3.5 w-3.5" />}
              Finish round
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function blankDraft(lie: Lie, distance: number, bag: Club[], yards: number): Draft {
  return {
    startingLocation: lie,
    startingDistance: distance,
    club: suggestClub(yards, lie, bag.length > 0 ? bag : [...CLUBS]),
    endingLocation: lie === "green" ? "holed" : "fairway",
    endingDistance: "",
    miss: null,
    penaltyStrokes: 0,
    penaltyType: "water",
  };
}

function Chip({
  active,
  onClick,
  children,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "good" | "bad";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? tone === "good"
            ? "border-good bg-good text-white"
            : tone === "bad"
              ? "border-bad bg-bad text-white"
              : "border-accent bg-accent text-accent-fg"
          : "border-border bg-surface text-fg-muted hover:border-border-strong hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
