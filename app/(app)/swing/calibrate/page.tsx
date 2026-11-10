import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteCalibrationSwingAction } from "@/app/calibration-actions";
import { CalibrationUpload } from "@/components/swing/calibration-upload";
import { ButtonLink, Card, PageHero } from "@/components/ui/primitives";
import { swingScoreChecks, tenPoint } from "@/lib/golf/swing-score";
import { appScore, calibrationSamples, loadCalibrationSwings, meanError } from "@/lib/swing/calibration";

export const metadata: Metadata = { title: "Score calibration" };
export const dynamic = "force-dynamic";

/** Local only: coach scores for swing clips, used by `npm run calibrate:swing` to tune the swing score. */
export default function CalibratePage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const { swings, skipped } = loadCalibrationSwings();
  const samples = calibrationSamples(swings).map((sample) => ({ ...sample, app: appScore(sample) }))
    // Largest disagreement first; clips the app cannot score last.
    .sort((a, b) => (b.app === null ? -1 : Math.abs(b.app - b.coach)) - (a.app === null ? -1 : Math.abs(a.app - a.coach)));
  const error = meanError(samples), scored = samples.filter((sample) => sample.app !== null).length;
  return <div className="space-y-5">
    <PageHero art="plain" size="sm" className="mb-0" eyebrow="Swing score" title="Score calibration"
      topLeft={<ButtonLink href="/swing" variant="onHero" size="sm">Back to swings</ButtonLink>} />
    <p className="text-[13px] leading-relaxed text-fg-muted">Give each clip the score out of 10 you think it deserves (like 9.8 or 4.6), and say why if you can. Each clip gets the same analysis as a swing upload. Its tracks and your score are saved in this project&apos;s calibration/swings folder, not to your account, and the video itself is not kept. Then run <code>npm run calibrate:swing</code> to tune the score&apos;s thresholds and weights to match yours.</p>
    <Card className="p-5"><CalibrationUpload /></Card>
    <Card className="p-5">
      <h2 className="text-[15px] font-semibold">Scored clips</h2>
      <p className="mt-1 text-[13px] text-fg-muted">{swings.length ? `${swings.length} ${swings.length === 1 ? "clip" : "clips"}, ${scored} scored by the app${error === null ? "" : `. Average difference from your scores: ${(error / 10).toFixed(2)}`}.` : "None yet."}
        {skipped.length ? ` Unreadable files skipped: ${skipped.join(", ")}.` : ""}</p>
      {samples.length ? <ul className="mt-3 divide-y divide-border">{samples.map((sample) => {
        const checks = sample.report ? swingScoreChecks(sample.report, sample.ballSide).components : [];
        return <li key={sample.file} className="flex items-start justify-between gap-3 py-3">
          <div className="min-w-0 space-y-1">
            <p className="break-words text-[14px] font-medium">{sample.name}</p>
            <p className="text-[12px] leading-relaxed text-fg-muted">{sample.app === null ? sample.reason
              : checks.map((check) => `${check.label} ${check.value}${check.unit}: ${tenPoint(check.score)}`).join(" · ")}</p>
            {sample.note ? <p className="break-words text-[12px] leading-relaxed">“{sample.note}”</p> : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="tabular text-[13px]">You <b>{tenPoint(sample.coach)}</b> · App <b>{sample.app === null ? "none" : tenPoint(sample.app)}</b></p>
            {sample.app !== null ? <p className="tabular text-[12px] text-fg-muted">{sample.app === sample.coach ? "Match" : `${sample.app > sample.coach ? "+" : "−"}${tenPoint(Math.abs(sample.app - sample.coach))}`}</p> : null}
            <form action={deleteCalibrationSwingAction.bind(null, sample.file)}>
              <button type="submit" aria-label={`Remove ${sample.name} from calibration`} className="min-h-9 text-[12px] text-fg-subtle underline-offset-2 hover:underline">Remove</button>
            </form>
          </div>
        </li>;
      })}</ul> : null}
    </Card>
  </div>;
}
