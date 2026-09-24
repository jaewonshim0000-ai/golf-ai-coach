import type { ClassicStats, HoleLine } from "@/lib/analytics/classic";
import { Card, CardContent, CardHeader, CardTitle, Stat } from "@/components/ui/primitives";
import { cn, toParLabel } from "@/lib/utils";

const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
const mark = (value: boolean | null) => (value === null ? "" : value ? "●" : "○");

/** A scorecard round read back: the classic numbers, then the card itself. */
export function ScorecardSummary({ lines, stats }: { lines: HoleLine[]; stats: ClassicStats }) {
  const score = lines.reduce((sum, line) => sum + line.score, 0);
  const par = lines.reduce((sum, line) => sum + line.par, 0);
  const threePutts = lines.filter((line) => (line.putts ?? 0) >= 3).length;
  return (
    <>
      <Card>
        <CardContent className="grid grid-cols-3 gap-x-3 gap-y-4 p-5 lg:grid-cols-6">
          <Stat label="Score" value={score || "—"} sub={lines.length ? toParLabel(score - par) : undefined} />
          <Stat label="Fairways" value={pct(stats.fairways.pct)} sub={`${stats.fairways.made}/${stats.fairways.chances}`} />
          <Stat label="Greens" value={pct(stats.greens.pct)} sub={`${stats.greens.made}/${stats.greens.chances}`} />
          <Stat
            label="Putts"
            value={lines.every((line) => line.putts !== null) ? lines.reduce((sum, line) => sum + (line.putts ?? 0), 0) : "—"}
            sub={threePutts ? `${threePutts} three-putt${threePutts === 1 ? "" : "s"}` : undefined}
          />
          <Stat label="Scrambling" value={pct(stats.scrambling.pct)} sub={`${stats.scrambling.made}/${stats.scrambling.chances}`} />
          <Stat label="Penalties" value={lines.reduce((sum, line) => sum + line.penalties, 0)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scorecard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[lines.filter((line) => line.hole <= 9), lines.filter((line) => line.hole > 9)]
            .filter((side) => side.length > 0)
            .map((side, index) => (
              <div key={index} className="overflow-x-auto">
                <table className="tabular w-full text-center text-[12px]">
                  <caption className="sr-only">{index === 0 ? "Front nine" : "Back nine"}</caption>
                  <tbody>
                    <Row label="Hole" cells={side.map((line) => line.hole)} muted />
                    <Row label="Par" cells={side.map((line) => line.par)} total={side.reduce((sum, line) => sum + line.par, 0)} muted />
                    <tr className="font-semibold">
                      <th scope="row" className="w-12 text-left font-normal text-fg-subtle">Score</th>
                      {side.map((line) => (
                        <td key={line.hole} className="py-1">
                          <span
                            className={cn(
                              "inline-flex h-6 w-6 items-center justify-center rounded-full",
                              line.score < line.par && "bg-good text-white",
                              line.score === line.par + 1 && "bg-warn-soft text-warn",
                              line.score >= line.par + 2 && "bg-bad-soft text-bad",
                            )}
                          >
                            {line.score}
                          </span>
                        </td>
                      ))}
                      <td>{side.reduce((sum, line) => sum + line.score, 0)}</td>
                    </tr>
                    <Row label="Putts" cells={side.map((line) => line.putts ?? "")} muted />
                    <Row label="FW" cells={side.map((line) => mark(line.fairway))} muted />
                    <Row label="GIR" cells={side.map((line) => mark(line.gir))} muted />
                  </tbody>
                </table>
              </div>
            ))}
          <p className="text-[11px] text-fg-subtle">● hit · ○ missed. Green in regulation is worked out from score and putts.</p>
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, cells, total, muted }: { label: string; cells: (string | number)[]; total?: number; muted?: boolean }) {
  return (
    <tr className={cn(muted && "text-fg-muted")}>
      <th scope="row" className="w-12 text-left font-normal text-fg-subtle">{label}</th>
      {cells.map((cell, index) => (
        <td key={index} className="py-0.5">{cell}</td>
      ))}
      <td>{total ?? ""}</td>
    </tr>
  );
}
