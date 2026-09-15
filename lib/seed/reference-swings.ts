import type { ReferenceSwing } from "../../types/practice";
import type { SwingPattern } from "../../types/golf";

/**
 * Reference swings are teaching examples of ball-flight patterns, not templates
 * to copy. They live in data, never in business logic, so adding a reference is
 * a row rather than a code change.
 */
export const REFERENCE_SWINGS: ReferenceSwing[] = [
  {
    id: "ref_rory_2011",
    name: "Rory McIlroy",
    year: 2011,
    pattern: "draw",
    summary:
      "A powerful right-to-left pattern built on a deep pressure shift and a late, aggressive release. Useful as an illustration of how a draw player sequences the change of direction, not as a swing to imitate.",
    useful_similarities: [
      "Transition sequencing: lower body starts down while the club is still completing the backswing",
      "Release pattern: the club exits low and left after a full rotation through impact",
      "Path tendencies: a slightly in-to-out delivery matched to a face that closes late",
    ],
    potential_differences: [
      "Setup: significantly more athletic posture and width than most amateurs can hold",
      "Pressure shift: the magnitude and timing require considerable mobility",
      "Face control: the face stays open longer than a recreational player can usually manage",
    ],
    features: {
      tempo_ratio: "approximately 3:1 backswing to downswing",
      transition: "lower body leads, arms follow",
      typical_path: "in-to-out, 2 to 4 degrees",
      face_to_path: "closed 1 to 3 degrees",
      release: "full rotational, low and left exit",
    },
  },
  {
    id: "ref_adam_scott",
    name: "Adam Scott",
    year: null,
    pattern: "fade",
    summary:
      "A tall, rotational pattern with quiet hands and an exceptionally stable clubface. A useful reference for players whose natural shape is a controlled left-to-right shot.",
    useful_similarities: [
      "Clubface stability: very little face rotation through the hitting area",
      "Body rotation: chest continues to turn through impact rather than the hands flipping",
      "Width: the trail arm stays extended deep into the downswing",
    ],
    potential_differences: [
      "Height and leverage produce a swing arc most players cannot replicate",
      "Weight shift is subtle rather than dramatic and is easy to misread",
      "Shaft lean at impact is more aggressive than it appears on camera",
    ],
    features: {
      tempo_ratio: "approximately 3:1 backswing to downswing",
      transition: "smooth, rotation-led",
      typical_path: "neutral to slightly out-to-in",
      face_to_path: "open 1 to 2 degrees",
      release: "body-driven, minimal hand rotation",
    },
  },
  {
    id: "ref_neutral_framework",
    name: "Neutral Pattern Framework",
    year: null,
    pattern: "neutral",
    summary:
      "Not a player, but the reference set of positions a straight-ball pattern tends to share. Used when a player's shape is neutral or not yet established.",
    useful_similarities: [
      "Path close to zero with a face square to that path",
      "Low point consistently two to four inches ahead of the ball",
      "Balanced finish with pressure fully in the lead foot",
    ],
    potential_differences: [
      "A neutral pattern is a target, not a description of any one player",
      "Individual anatomy changes what neutral looks like on camera",
    ],
    features: {
      tempo_ratio: "3:1",
      transition: "sequential, ground up",
      typical_path: "-1 to +1 degrees",
      face_to_path: "within 1 degree",
      release: "matched to path",
    },
  },
];

/** Reference lookup is a data question, so it stays a lookup. */
export function referenceFor(pattern: SwingPattern): ReferenceSwing {
  return (
    REFERENCE_SWINGS.find((r) => r.pattern === pattern) ??
    REFERENCE_SWINGS.find((r) => r.pattern === "neutral")!
  );
}
