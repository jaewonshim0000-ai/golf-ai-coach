import type { TrendPoint } from "../../types/analytics";
import type { HoleSpec, HoleStat, Round, Shot } from "../../types/rounds";
import { buildHoleResults } from "../golf/strokes-gained";

/**
 * The numbers golfers already know: fairways, greens, putts, scrambling.
 *
 * They come from either kind of round. A shot-tracked hole already knows all
 * of them; a scorecard hole knows them from score, putts and the fairway tap,
 * because a green in regulation is just "reached the green with two strokes
 * to spare" and the strokes to reach it are the score less the putts.
 */

export type HoleLine = {
  hole: number;
  par: number;
  score: number;
  putts: number | null;
  fairway: boolean | null;
  gir: boolean | null;
  penalties: number;
};

export function lineFromStat(stat: HoleStat, par: number, hole: number): HoleLine {
  return {
    hole,
    par,
    score: stat.score,
    putts: stat.putts,
    fairway: par >= 4 && stat.fairway ? stat.fairway === "hit" : null,
    gir: stat.putts === null ? null : stat.score - stat.putts <= par - 2,
    penalties: stat.penalties,
  };
}

export function holeLines(round: Round, holes: HoleSpec[], shots: Shot[]): HoleLine[] {
  if (shots.length > 0) {
    return buildHoleResults(shots).map((hole) => ({
      hole: hole.hole_number,
      par: hole.par,
      score: hole.strokes,
      putts: hole.putts,
      fairway: hole.fairway_hit,
      gir: hole.green_in_regulation,
      penalties: hole.penalties,
    }));
  }
  const parOf = (index: number) => holes[index]?.par ?? 4;
  if (round.hole_stats) {
    return round.hole_stats.flatMap((stat, index) =>
      stat ? [lineFromStat(stat, parOf(index), index + 1)] : [],
    );
  }
  return (round.hole_scores ?? []).map((score, index) => ({
    hole: index + 1,
    par: parOf(index),
    score,
    putts: null,
    fairway: null,
    gir: null,
    penalties: 0,
  }));
}

export type Rate = { made: number; chances: number; pct: number | null };

const rate = (made: number, chances: number): Rate => ({
  made,
  chances,
  pct: chances > 0 ? made / chances : null,
});

export type ClassicStats = {
  holes: number;
  fairways: Rate;
  greens: Rate;
  /** Par or better after missing the green in regulation. */
  scrambling: Rate;
  /** Per eighteen holes, over the holes where putts were counted. */
  puttsPerRound: number | null;
  threePuttsPerRound: number | null;
  penaltiesPerRound: number | null;
  parAverage: Record<3 | 4 | 5, number | null>;
  mix: { under: number; par: number; bogey: number; double: number };
};

export function classicStats(lines: HoleLine[]): ClassicStats {
  const withPutts = lines.filter((line) => line.putts !== null);
  const per18 = (total: number, holes: number) => (holes > 0 ? (total / holes) * 18 : null);
  const missed = lines.filter((line) => line.gir === false);
  const average = (par: number) => {
    const played = lines.filter((line) => line.par === par);
    return played.length ? played.reduce((sum, line) => sum + line.score, 0) / played.length : null;
  };
  const toPar = lines.map((line) => line.score - line.par);
  return {
    holes: lines.length,
    fairways: rate(
      lines.filter((line) => line.fairway === true).length,
      lines.filter((line) => line.fairway !== null).length,
    ),
    greens: rate(
      lines.filter((line) => line.gir === true).length,
      lines.filter((line) => line.gir !== null).length,
    ),
    scrambling: rate(missed.filter((line) => line.score <= line.par).length, missed.length),
    puttsPerRound: per18(withPutts.reduce((sum, line) => sum + line.putts!, 0), withPutts.length),
    threePuttsPerRound: per18(withPutts.filter((line) => line.putts! >= 3).length, withPutts.length),
    penaltiesPerRound: per18(lines.reduce((sum, line) => sum + line.penalties, 0), lines.length),
    parAverage: { 3: average(3), 4: average(4), 5: average(5) },
    mix: {
      under: toPar.filter((value) => value < 0).length,
      par: toPar.filter((value) => value === 0).length,
      bogey: toPar.filter((value) => value === 1).length,
      double: toPar.filter((value) => value >= 2).length,
    },
  };
}

export type ClassicTrends = {
  fairways: TrendPoint[];
  greens: TrendPoint[];
  putts: TrendPoint[];
  scrambling: TrendPoint[];
};

/** One point per round with enough of the stat to mean something, oldest first. */
export function classicTrends(rounds: { round: Round; lines: HoleLine[] }[]): ClassicTrends {
  const ordered = [...rounds]
    .filter(({ lines }) => lines.length >= 9)
    .sort((a, b) => a.round.played_on.localeCompare(b.round.played_on));
  const series = (pick: (stats: ClassicStats) => number | null) =>
    ordered.flatMap(({ round, lines }) => {
      const value = pick(classicStats(lines));
      return value === null
        ? []
        : [{ date: round.played_on, label: round.course_name, value: Math.round(value * 10) / 10 }];
    });
  const percent = (value: number | null) => (value === null ? null : value * 100);
  return {
    fairways: series((stats) => percent(stats.fairways.pct)),
    greens: series((stats) => percent(stats.greens.pct)),
    putts: series((stats) => stats.puttsPerRound),
    scrambling: series((stats) => percent(stats.scrambling.pct)),
  };
}
