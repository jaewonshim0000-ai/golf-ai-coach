import type { DispersionPoint, TrendPoint } from "@/types/analytics";
import { cn, formatShortDate } from "@/lib/utils";

/**
 * Charts, drawn with CSS and inline SVG.
 *
 * The mobile design renders every measurement as a flat bar, a sparkline or a
 * plain number, with the value printed next to it rather than hidden behind a
 * hover tooltip - which is the only thing that works on a phone anyway. That is
 * cheap enough to draw by hand, so these are server components with no charting
 * dependency and no client JavaScript.
 *
 * Colour comes from the CSS tokens, so light and dark are the same component.
 */

const GOOD = "var(--c-good)";
const BAD = "var(--c-bad)";
const ACCENT = "var(--c-accent)";

export type BarDatum = { label: string; value: number; sub?: string };

const signedText = (value: number, digits = 2) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;

/**
 * Diverging bars. Strokes gained is signed, so the track has a centre line and
 * bars grow out from it in the direction of the sign.
 */
export function DivergingBars({
  data,
  compact = false,
  digits = 2,
}: {
  data: BarDatum[];
  /** Short labels (distance bands) sit beside the track instead of above it. */
  compact?: boolean;
  digits?: number;
}) {
  if (data.length === 0) return <NoData />;

  // One shared scale, so a -2.4 bar is visibly twice a -1.2 bar.
  const max = Math.max(0.01, ...data.map((d) => Math.abs(d.value)));

  return (
    <div className={cn("flex flex-col", compact ? "gap-2.5" : "gap-3")}>
      {data.map((datum) => {
        const width = (Math.min(1, Math.abs(datum.value) / max) * 50).toFixed(1);
        const positive = datum.value >= 0;
        const style = {
          left: positive ? "50%" : `${50 - Number(width)}%`,
          width: `${width}%`,
          background: positive ? GOOD : BAD,
        };
        const value = (
          <span
            className="tabular shrink-0 text-[11px] font-semibold"
            style={{ color: positive ? GOOD : BAD }}
          >
            {signedText(datum.value, digits)}
          </span>
        );

        if (compact) {
          return (
            <div key={datum.label} className="flex items-center gap-2.5">
              <span className="tabular w-[70px] shrink-0 truncate text-[11px] text-fg-muted">
                {datum.label}
              </span>
              <Track style={style} />
              <span className="w-[46px] shrink-0 text-right">{value}</span>
            </div>
          );
        }

        return (
          <div key={datum.label}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12px]">
              <span className="min-w-0 truncate text-fg-muted">
                {datum.label}
                {datum.sub ? <span className="ml-1.5 text-fg-subtle">{datum.sub}</span> : null}
              </span>
              {value}
            </div>
            <Track style={style} />
          </div>
        );
      })}
    </div>
  );
}

function Track({ style }: { style: React.CSSProperties }) {
  return (
    <div className="relative h-2 flex-1 rounded-full bg-track">
      <div className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
      <div className="absolute inset-y-0 rounded-full" style={style} />
    </div>
  );
}

// ------------------------------------------------------------- sparklines

type Series = { points: TrendPoint[]; color: string; name?: string };

/**
 * Shared geometry for every line chart. The SVG stretches to the container with
 * `preserveAspectRatio="none"` and a non-scaling stroke, and the dots are
 * positioned as percentages outside the SVG so they stay circular at any width.
 */
function project(series: Series[], height: number) {
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  if (values.length === 0) return null;

  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    // A flat line still needs a band to sit in, or it lands on the edge.
    min -= 1;
    max += 1;
  }
  const padY = 6;
  const span = max - min;
  const x = (index: number, count: number) => (count <= 1 ? 50 : (index / (count - 1)) * 100);
  const y = (value: number) => padY + ((max - value) / span) * (height - padY * 2);

  return { min, max, span, x, y, height };
}

export function TrendLine({
  points,
  height = 150,
  unit = "",
  invert = false,
  zeroLine = false,
}: {
  points: TrendPoint[];
  height?: number;
  unit?: string;
  /** For scoring, lower is better - flip the colour logic. */
  invert?: boolean;
  zeroLine?: boolean;
}) {
  if (points.length === 0) return <NoData height={height} />;

  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const improving = invert ? last <= first : last >= first;
  const color = improving ? GOOD : BAD;

  return (
    <Sparkline
      series={[{ points, color }]}
      height={height}
      zeroLine={zeroLine}
      footer={
        <>
          <span>{formatShortDate(points[0]!.date)}</span>
          <span className="tabular font-medium" style={{ color }}>
            {points.length === 1
              ? `${last}${unit}`
              : `${first}${unit} → ${last}${unit}`}
          </span>
          <span>{formatShortDate(points[points.length - 1]!.date)}</span>
        </>
      }
    />
  );
}

export type MultiSeries = { name: string; color: string; points: TrendPoint[] };

/** Practice metrics over time. Each drill is its own series on a 0-100% axis. */
export function PracticeTrendChart({
  series,
  height = 190,
}: {
  series: MultiSeries[];
  height?: number;
}) {
  const withData = series.filter((s) => s.points.length > 0);
  if (withData.length === 0) return <NoData height={height} />;

  // Percentages are stored 0-1; the axis reads better in whole points.
  const scaled = withData.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p, value: Math.round(p.value * 100) })),
  }));

  return <Sparkline series={scaled} height={height} unit="%" />;
}

function Sparkline({
  series,
  height,
  zeroLine = false,
  unit = "",
  footer,
}: {
  series: Series[];
  height: number;
  zeroLine?: boolean;
  unit?: string;
  footer?: React.ReactNode;
}) {
  const geo = project(series, height);
  if (!geo) return <NoData height={height} />;

  const single = series.length === 1;
  const zeroY = zeroLine && geo.min < 0 && geo.max > 0 ? geo.y(0) : null;

  return (
    <div>
      <div className="relative" style={{ height }}>
        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          {zeroY !== null ? (
            <line
              x1="0"
              x2="100"
              y1={zeroY}
              y2={zeroY}
              stroke="var(--c-border-strong)"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {series.map((s, index) => {
            const count = s.points.length;
            const d = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"}${geo.x(i, count)} ${geo.y(p.value)}`)
              .join(" ");
            return (
              <g key={s.name ?? index}>
                {single ? (
                  <path
                    d={`${d} L100 ${height} L0 ${height} Z`}
                    fill={s.color}
                    fillOpacity={0.12}
                    stroke="none"
                  />
                ) : null}
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            );
          })}
        </svg>

        {series.map((s, index) =>
          s.points.map((p, i) => (
            <span
              key={`${s.name ?? index}-${p.date}-${i}`}
              className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${geo.x(i, s.points.length)}%`,
                top: geo.y(p.value),
                background: s.color,
              }}
              title={`${formatShortDate(p.date)}: ${p.value}${unit}`}
            />
          )),
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2 text-[10px] text-fg-subtle">
        {footer ?? (
          <>
            <span className="tabular">
              {geo.min}
              {unit}
            </span>
            <span className="tabular">
              {geo.max}
              {unit}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export const SERIES_COLORS = [
  "var(--c-chart-1)",
  "var(--c-chart-2)",
  "var(--c-chart-3)",
  "var(--c-chart-4)",
  "var(--c-chart-5)",
];

/**
 * Shot dispersion: distance against lateral tendency, coloured by whether the
 * shot gained or lost strokes. Three discrete columns, because a recorded miss
 * direction is a bucket and pretending it is a coordinate would be a lie.
 */
export function DispersionChart({
  points,
  height = 260,
}: {
  points: DispersionPoint[];
  height?: number;
}) {
  const plotted = points.filter((p) => p.lateral !== null);
  if (plotted.length === 0) return <NoData height={height} label="No miss directions recorded yet" />;

  const distances = plotted.map((p) => p.distance);
  const min = Math.min(...distances);
  const max = Math.max(...distances);
  const span = Math.max(1, max - min);

  const COLUMN = { left: 18, centre: 50, right: 82 } as const;

  return (
    <div>
      <div className="relative rounded-xl bg-surface-2/70" style={{ height }}>
        <div className="absolute inset-y-3 left-1/2 w-px bg-border-strong" />
        {plotted.map((point, index) => {
          const base = COLUMN[point.lateral as keyof typeof COLUMN] ?? 50;
          // Jitter keeps the columns readable without faking precision.
          const jitter = ((index % 7) - 3) * 1.6;
          return (
            <span
              key={index}
              className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-75"
              style={{
                left: `${base + jitter}%`,
                top: `${8 + ((max - point.distance) / span) * 84}%`,
                background: point.strokes_gained >= 0 ? GOOD : BAD,
              }}
              title={`${point.club ?? "shot"} · ${point.distance} yd · ${signedText(point.strokes_gained)}`}
            />
          );
        })}
        <span className="tabular absolute left-2 top-2 text-[10px] text-fg-subtle">{max} yd</span>
        <span className="tabular absolute bottom-2 left-2 text-[10px] text-fg-subtle">{min} yd</span>
      </div>
      <div className="mt-2 grid grid-cols-3 text-center text-[10px] text-fg-subtle">
        <span>Left</span>
        <span>Centre</span>
        <span>Right</span>
      </div>
    </div>
  );
}

/** Plain counts - miss directions, shot tallies. No sign, so no centre line. */
export function CountBars({ data, height = 140 }: { data: BarDatum[]; height?: number }) {
  if (data.length === 0) return <NoData height={height} />;
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((datum) => (
        <div
          key={datum.label}
          className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
        >
          <span className="tabular text-[10px] text-fg-muted">{datum.value}</span>
          <div
            className="w-full rounded-t"
            style={{
              height: `${Math.max(2, (datum.value / max) * 100)}%`,
              background: ACCENT,
            }}
          />
          <span className="w-full truncate text-center text-[9px] text-fg-subtle">
            {datum.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function NoData({ height = 120, label = "Not enough data yet" }: { height?: number; label?: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-border-strong text-xs text-fg-subtle"
      style={{ height }}
    >
      {label}
    </div>
  );
}
