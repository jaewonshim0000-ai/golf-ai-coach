import type { HoleLine } from "@/lib/analytics/classic";
import { cn, toParLabel } from "@/lib/utils";

const mark = (value: boolean | null) => (value === null ? "" : value ? "●" : "○");

/** The design's score marks: an olive circle under par, a box over it, a double box for a double. */
export function ScoreMark({ score, par }: { score: number; par: number }) {
  const diff = score - par;
  if (diff < 0) return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent">{score}</span>;
  if (diff === 0) return <span className="inline-flex h-6 w-6 items-center justify-center">{score}</span>;
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-[5px] border-[1.5px] border-white",
        diff >= 2 && "shadow-[0_0_0_2px_#23271f,0_0_0_3.5px_#ffffff]",
      )}
    >
      {score}
    </span>
  );
}

/**
 * A round's card as the design draws it: "Front nine" with the total, then
 * the ink table of hole, par and your score. Putts, fairways and greens follow
 * when the card has them.
 */
export function InkScorecard({ lines }: { lines: HoleLine[] }) {
  const sides = [lines.filter((line) => line.hole <= 9), lines.filter((line) => line.hole > 9)].filter((side) => side.length > 0);
  const detail = lines.some((line) => line.putts !== null || line.fairway !== null);
  return (
    <div className="flex flex-col gap-4">
      {sides.map((side, index) => {
        const score = side.reduce((sum, line) => sum + line.score, 0);
        const par = side.reduce((sum, line) => sum + line.par, 0);
        return (
          <section key={index} className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <h2 className="dsp text-[24px] leading-none">{index === 0 && side[0]!.hole <= 9 ? "Front nine" : "Back nine"}</h2>
              <span className="text-[13px] font-bold">
                {score} · {toParLabel(score - par)}
              </span>
            </div>
            <div className="overflow-x-auto rounded-[22px] bg-ink px-3 py-3 text-white">
              <table className="tabular w-full text-center text-[12px]">
                <caption className="sr-only">{index === 0 ? "Front nine" : "Back nine"}</caption>
                <tbody>
                  <tr className="text-[#a9ad9f]">
                    <th scope="row" className="dsp w-12 text-left text-[10px] font-bold">Hole</th>
                    {side.map((line) => (
                      <td key={line.hole} className="font-bold">{line.hole}</td>
                    ))}
                  </tr>
                  <tr className="text-[#a9ad9f]">
                    <th scope="row" className="dsp text-left text-[10px] font-bold">Par</th>
                    {side.map((line) => (
                      <td key={line.hole} className="py-1">{line.par}</td>
                    ))}
                  </tr>
                  <tr className="font-display text-[15px]">
                    <th scope="row" className="dsp text-left font-sans text-[10px] font-bold text-[#a9ad9f]">You</th>
                    {side.map((line) => (
                      <td key={line.hole} className="py-1">
                        <ScoreMark score={line.score} par={line.par} />
                      </td>
                    ))}
                  </tr>
                  {detail ? (
                    <>
                      <tr className="text-[#a9ad9f]">
                        <th scope="row" className="dsp text-left text-[10px] font-bold">Putts</th>
                        {side.map((line) => (
                          <td key={line.hole} className="pt-1">{line.putts ?? ""}</td>
                        ))}
                      </tr>
                      <tr className="text-[#a9ad9f]">
                        <th scope="row" className="dsp text-left text-[10px] font-bold">FW</th>
                        {side.map((line) => (
                          <td key={line.hole}>{mark(line.fairway)}</td>
                        ))}
                      </tr>
                      <tr className="text-[#a9ad9f]">
                        <th scope="row" className="dsp text-left text-[10px] font-bold">GIR</th>
                        {side.map((line) => (
                          <td key={line.hole}>{mark(line.gir)}</td>
                        ))}
                      </tr>
                    </>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {detail ? <p className="text-[11px] text-fg-subtle">● hit · ○ missed. Green in regulation is worked out from score and putts.</p> : null}
    </div>
  );
}
