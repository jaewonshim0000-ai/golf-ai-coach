import { cachedCoach } from "@/lib/ai/reconstruction-coach";
import { coachComparison, comparisonFingerprint } from "@/lib/ai/comparison-coach";
import { getProvider } from "@/lib/ai/provider";
import type { SwingComparison } from "@/lib/golf/swing-comparison";
import { Sparkle } from "@/components/ui/primitives";

/** Server-rendered and streamed, so the videos never wait for Claude. */
export async function ComparisonAdvice({ owner, comparison, club }: { owner: string; comparison: SwingComparison; club: string }) {
  const { data, source, note } = await cachedCoach(owner, comparisonFingerprint(comparison, club, getProvider().model),
    () => coachComparison(comparison, club));
  const name = comparison.referenceName;
  return (
    <section aria-label={`Advice from comparing with ${name}`} className="flex flex-col gap-3.5 rounded-[28px] bg-ink p-[18px] text-white">
      <div className="flex items-center justify-between gap-2.5">
        <h2 className="dsp text-[20px] leading-[1.05]">{data.points.length ? `Where you differ from ${name}` : `Compared with ${name}`}</h2>
        <a href="#compare" className="press dsp inline-flex h-9 shrink-0 items-center rounded-full border-[1.5px] border-white/70 px-3.5 text-[11px]">
          Side by side
        </a>
      </div>
      <p className="text-[14px] leading-normal text-[#e6e7df]">{data.summary}</p>
      {data.points.length ? (
        <ol className="flex flex-col gap-3.5">
          {data.points.map((point, index) => (
            <li key={point.id} className="flex flex-col gap-2 border-t border-[#3a3f33] pt-3.5">
              <span className="text-[14px] font-bold">
                <span className="text-gold">{index + 1}</span> · {point.label}
              </span>
              <span className="flex flex-wrap gap-1.5">
                <span className="tabular inline-flex h-7 items-center rounded-full bg-[#3a3f33] px-2.5 text-[12px] font-bold text-[#f2b59b]">You {point.you}</span>
                <span className="tabular inline-flex h-7 items-center rounded-full bg-white px-2.5 text-[12px] font-bold text-[#1e211b]">
                  {name} {point.reference}
                </span>
              </span>
              <span className="text-[13px] leading-normal text-[#c9ccbf]">{point.advice}</span>
              {point.steps.length ? (
                <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-normal text-[#c9ccbf]">
                  {point.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      <span className="inline-flex items-center gap-1.5 text-[11px] text-[#a9ad9f]">
        {source === "ai" ? <Sparkle className="h-3 w-3 shrink-0 text-gold" /> : null}
        {note ?? (source === "ai" ? "Advice written by Claude from the measured positions in both videos." : "Advice from the measured positions in both videos.")}
      </span>
    </section>
  );
}
