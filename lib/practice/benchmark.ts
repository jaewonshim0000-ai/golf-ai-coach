import type { Drill, DrillAttempt } from "../../types/practice";

/**
 * Drill benchmarks.
 *
 * A drill standard is stored as a rate (0-1), which is the right thing to
 * compare across sessions and the wrong thing to say to someone holding a
 * putter. "Make at least 6 of 10" is a target you can act on; "0.6 success
 * rate" is a number you have to translate first.
 *
 * So the rate is the source of truth and the count is the presentation, and
 * the count is rounded UP: a 60% standard over 10 balls is 6, and over 9 balls
 * it is 6, not 5. Rounding down would quietly hand out a standard nobody set.
 */

export type Benchmark = {
  drill: Drill;
  /** Successes needed out of `reps` to meet the standard. */
  target: number;
  reps: number;
  /** "Make at least 6 of 10." */
  label: string;
  /** Best recorded attempt, as a count out of its own attempt total. */
  best: { successes: number; attempts: number; score: number; on: string } | null;
  latest: { successes: number; attempts: number; score: number; on: string } | null;
  /** True once any recorded attempt has met or beaten the standard. */
  beaten: boolean;
  /** Successes above the standard on the best attempt, scaled to `reps`. */
  margin: number;
  sessions: number;
};

export function benchmarkFor(drill: Drill, attempts: DrillAttempt[]): Benchmark {
  const reps = drill.recommended_reps > 0 ? drill.recommended_reps : 10;
  const target = Math.max(1, Math.ceil(drill.success_threshold * reps));

  const mine = attempts
    .filter((attempt) => attempt.drill_id === drill.id)
    .sort((a, b) => a.completed_at.localeCompare(b.completed_at));

  const toResult = (attempt: DrillAttempt) => ({
    successes: attempt.successes,
    attempts: attempt.attempts,
    score: attempt.score,
    on: attempt.completed_at.slice(0, 10),
  });

  const bestAttempt = mine.reduce<DrillAttempt | null>(
    (best, attempt) => (best === null || attempt.score > best.score ? attempt : best),
    null,
  );
  const best = bestAttempt ? toResult(bestAttempt) : null;
  const last = mine[mine.length - 1];

  return {
    drill,
    target,
    reps,
    label: `Make at least ${target} of ${reps}`,
    best,
    latest: last ? toResult(last) : null,
    beaten: best !== null && best.score >= drill.success_threshold,
    // Compared on the rate, then expressed in reps, so a 7/9 and a 7/10 do not
    // claim the same margin.
    margin: best ? Math.round((best.score - drill.success_threshold) * reps) : 0,
    sessions: mine.length,
  };
}

/** One line about the best attempt, or nothing if there is not one yet. */
export function benchmarkNote(benchmark: Benchmark): string | null {
  if (!benchmark.best) return null;
  const { successes, attempts } = benchmark.best;
  if (!benchmark.beaten) {
    return `Best so far ${successes} of ${attempts}. Standard is ${benchmark.target} of ${benchmark.reps}.`;
  }
  if (benchmark.margin > 0) {
    return `Beat the standard: ${successes} of ${attempts}, ${benchmark.margin} clear.`;
  }
  return `Met the standard: ${successes} of ${attempts}.`;
}
