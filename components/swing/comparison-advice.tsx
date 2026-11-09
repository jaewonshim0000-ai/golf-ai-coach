import { cachedCoach } from "@/lib/ai/reconstruction-coach";
import { coachComparison, comparisonFingerprint } from "@/lib/ai/comparison-coach";
import { getProvider } from "@/lib/ai/provider";
import type { SwingComparison } from "@/lib/golf/swing-comparison";

/** Server-rendered and streamed, so the videos never wait for Claude. */
export async function ComparisonAdvice({ owner, comparison, club }: { owner: string; comparison: SwingComparison; club: string }) {
  const { data, source, note } = await cachedCoach(owner, comparisonFingerprint(comparison, club, getProvider().model),
    () => coachComparison(comparison, club));
  const name = comparison.referenceName;
  return <section aria-label={`Advice from comparing with ${name}`} className="space-y-3 rounded-xl border border-border bg-surface-2 p-4">
    <h3 className="text-[14px] font-semibold">{data.points.length ? `Where you differ from ${name}` : `Compared with ${name}`}</h3>
    <p className="text-[13px] leading-relaxed">{data.summary}</p>
    {data.points.length ? <ol className="space-y-4">{data.points.map((point, index) => <li key={point.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
      <p className="text-[13px] font-semibold"><span className="text-fg-subtle">{index + 1}.</span> {point.label}</p>
      <p className="tabular mt-1 text-[12px] text-fg-muted">You {point.you} · {name} {point.reference}</p>
      <p className="mt-2 text-[13px] leading-relaxed">{point.advice}</p>
      {point.steps.length ? <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed">{point.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
    </li>)}</ol> : null}
    <p className="text-[11px] text-fg-subtle">{note ?? (source === "ai" ? "Advice written by Claude from the measured positions in both videos." : "Advice from the measured positions in both videos.")}</p>
  </section>;
}
