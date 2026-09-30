import type { Club, Lie, ShotType } from "../../types/golf";
import type { Shot } from "../../types/rounds";
import { AROUND_GREEN_YARDS } from "./strokes-gained";

/**
 * A hole is entered as the list of places each shot started from: lie and
 * distance to the hole. Where one shot finished is where the next started, and
 * the last one finished in the hole, which is all strokes gained needs.
 */

export const START_OPTIONS = [
  { id: "tee_driver", label: "Tee (Driver)" },
  { id: "tee", label: "Tee (Other)" },
  { id: "fairway", label: "Fairway" },
  { id: "rough", label: "Rough" },
  { id: "sand", label: "Sand" },
  { id: "recovery", label: "Recovery" },
  { id: "fringe", label: "Fringe" },
  { id: "green", label: "Green" },
] as const;
export type StartOption = (typeof START_OPTIONS)[number]["id"];
export const START_OPTION_IDS = START_OPTIONS.map((option) => option.id) as [StartOption, ...StartOption[]];

export type HoleRow = { start: StartOption; distance: number; penalty: number };

/** Sand this close is a greenside bunker: the short-game radius used for up-and-downs. */
const GREENSIDE_SAND_YARDS = AROUND_GREEN_YARDS + 20;

export const unitFor = (start: StartOption) => (start === "green" ? "feet" : "yards");

function lieFor(row: HoleRow): Lie {
  if (row.start === "tee_driver") return "tee";
  if (row.start === "sand") return row.distance <= GREENSIDE_SAND_YARDS ? "greenside_bunker" : "fairway_bunker";
  return row.start;
}

/** The option a stored shot is shown as when the hole is opened again. */
export function optionFor(shot: Pick<Shot, "starting_location" | "club">): StartOption {
  switch (shot.starting_location) {
    case "tee":
      return shot.club === "driver" ? "tee_driver" : "tee";
    case "fairway_bunker":
    case "greenside_bunker":
      return "sand";
    case "first_cut":
      return "fairway";
    case "deep_rough":
    case "hazard":
    case "out_of_bounds":
      return "rough";
    case "holed":
      return "green";
    default:
      return shot.starting_location;
  }
}

function shotType(lie: Lie, yards: number, shotNumber: number, par: number): ShotType {
  if (lie === "green") return "putt";
  if (lie === "tee" && shotNumber === 1 && par >= 4) return "tee";
  if (lie === "recovery") return "recovery";
  if (lie === "greenside_bunker" && yards <= AROUND_GREEN_YARDS) return "bunker";
  if (yards <= 10) return "chip";
  if (yards <= AROUND_GREEN_YARDS) return "pitch";
  if (yards > 230 && par >= 5) return "layup";
  return "approach";
}

export type HoleShot = Omit<Shot, "id" | "user_id" | "created_at">;

export function holeShots(roundId: string, holeNumber: number, par: number, rows: HoleRow[]): HoleShot[] {
  return rows.map((row, index) => {
    const next = rows[index + 1];
    const lie = lieFor(row);
    const unit = unitFor(row.start);
    const yards = unit === "feet" ? row.distance / 3 : row.distance;
    return {
      round_id: roundId,
      hole_number: holeNumber,
      hole_par: par,
      shot_number: index + 1,
      starting_location: lie,
      starting_distance: row.distance,
      starting_unit: unit,
      lie,
      club: row.start === "tee_driver" ? ("driver" as Club) : lie === "green" ? "putter" : null,
      shot_type: shotType(lie, yards, index + 1, par),
      intended_target: null,
      ending_location: next ? lieFor(next) : "holed",
      ending_distance: next ? next.distance : 0,
      ending_unit: next ? unitFor(next.start) : "feet",
      penalty_strokes: row.penalty,
      // ponytail: the row does not ask which penalty it was; every one is filed as water.
      penalty_type: row.penalty > 0 ? "water" : "none",
      miss_direction: null,
      notes: null,
    };
  });
}
