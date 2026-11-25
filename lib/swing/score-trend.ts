import * as repo from "@/lib/db/repo";
import { currentSwingModel } from "@/lib/golf/swing-reference";
import { GPP_VERSION } from "@/lib/golfposepro/result";
import { swingResult, type SwingResult } from "@/lib/swing/result";
import type { SwingSession } from "@/types/practice";

/** The score trend reads this many of the latest swings, from one camera side. */
const TREND_SWINGS = 12;

/**
 * The player's swing scores, newest side only. Scores are worked out from each
 * swing's tracks, so the trend always uses today's rubric. Camera sides score
 * different checks, so it keeps to one.
 */
// ponytail: ~40 KB of tracks a swing per visit; store the score on save if this gets slow.
export async function swingScores(userId: string, swingSessions: SwingSession[]) {
  const sessions = [...swingSessions].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const newest = sessions[0] ?? null;
  const sameSide = newest ? sessions.filter((session) => session.camera_angle === newest.camera_angle).slice(0, TREND_SWINGS) : [];
  const models = await repo.getSwingModels(userId, sameSide.map((session) => session.id));
  const results = new Map<string, SwingResult | null>(
    sameSide.map((session) => {
      const model = models.get(session.id) ?? null;
      const fresh = currentSwingModel(model, session) && model.golfPosePro?.version === GPP_VERSION;
      // A reference is someone else's swing, so it never counts toward yours.
      return [session.id, fresh && !model.reference ? swingResult(model) : null];
    }),
  );
  // Oldest first, for the line.
  const trend = sameSide
    .flatMap((session) => {
      const score = results.get(session.id)?.score ?? null;
      return score === null ? [] : [{ date: session.created_at, value: score }];
    })
    .reverse();
  return { sessions, newest, results, trend };
}
