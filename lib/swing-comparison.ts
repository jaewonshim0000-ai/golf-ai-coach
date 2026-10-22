import type { PoseModel } from "./golf/pose";
import type { SwingSession } from "../types/practice";
import * as repo from "./db/repo";
import { compareSwingToReference, matchSwingReferences } from "./golf/swing-comparison";

/** Server-only ownership boundary shared by the page and the optional AI request. */
export async function loadSwingComparison(userId: string, session: SwingSession, model: PoseModel, requested?: string) {
  const references = (await repo.getSwingReferences(userId)).filter((ref) => ref.session.id !== session.id);
  const matches = matchSwingReferences(model, session.club, references);
  const selected = requested ? references.find((ref) => ref.session.id === requested) :
    matches.find((ref) => compareSwingToReference(model, session.club, ref).status === "ready") ?? matches[0];
  return { references, selected: selected ?? null,
    comparison: selected ? compareSwingToReference(model, session.club, selected) : null,
    message: requested && !selected ? "That reference is unavailable. Choose another from your library." :
      !references.length ? "Add a professional or coach recording to start comparing." :
        !matches.length ? "Add a reference with this camera view and club to make a matched comparison." : null };
}
