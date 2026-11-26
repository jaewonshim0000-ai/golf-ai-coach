/**
 * How far a swing analysis has got, as the player sees it: 0 to 100.
 *
 * Only reading the frames reports real progress (frame N of M), so it gets
 * most of the bar. Getting the model ready and saving the review report
 * nothing while they run; the screen creeps through their small share instead
 * of sitting still, and never past it until the next stage really begins.
 */
export type AnalysisStage = "preparing" | "reading" | "saving" | "done";
export type AnalysisStep = { stage: AnalysisStage; done?: number; total?: number };

/** Where each stage starts and the most it may creep to before the next one begins. */
export const STAGE_SPAN: Record<AnalysisStage, [from: number, to: number]> = {
  preparing: [0, 8],
  reading: [8, 88],
  saving: [88, 98],
  done: [100, 100],
};

/** The percent a step stands for; reading frames moves through its share frame by frame. */
export function analysisPercent(step: AnalysisStep): number {
  const [from, to] = STAGE_SPAN[step.stage];
  if (step.stage !== "reading") return from;
  const share = step.total ? Math.min(1, Math.max(0, (step.done ?? 0) / step.total)) : 0;
  return Math.round(from + (to - from) * share);
}

/** One small move toward the stage's ceiling, for stages that report nothing: fast at first, then slower. */
export function creep(shown: number, step: AnalysisStep): number {
  const floor = analysisPercent(step);
  const ceiling = step.stage === "reading" ? floor : STAGE_SPAN[step.stage][1] - 1;
  const next = Math.max(shown, floor);
  if (step.stage === "done") return 100;
  return Math.max(next, Math.min(ceiling, next + Math.max(0.15, (ceiling - next) * 0.06)));
}

const ORDER: Record<AnalysisStage, number> = { preparing: 0, reading: 1, saving: 2, done: 3 };

/** A step earlier than the last one (Review again after a finished run) starts the bar from zero. */
export function isRestart(before: AnalysisStep | null, step: AnalysisStep): boolean {
  return !before || ORDER[step.stage] < ORDER[before.stage];
}
