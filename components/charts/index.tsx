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

/**
 * The five-sided game profile from the Play tab: two filled shapes, earlier
 * in coral under recent in olive, on a two-ring pentagon grid.
 */
export function RadarChart({
  axes,
  label,
  earlierColor = "#F2B59B",
  recentColor = "#6F8F37",
}: {
  axes: { label: string; recent: number | null; earlier: number | null }[];
  label: string;
  earlierColor?: string;
  recentColor?: string;
}) {
  const cx = 130;
  const cy = 110;
  const radius = 85;
  const n = axes.length;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index * 2 * Math.PI) / n;
    return [cx + Math.cos(angle) * radius * value, cy + Math.sin(angle) * radius * value] as const;
  };
  const ring = (value: number) =>
    axes.map((_, index) => point(index, value).map((v) => v.toFixed(1)).join(",")).join(" ");
  // A missing value sits at the centre, so the shape still closes.
  const shape = (pick: (axis: (typeof axes)[number]) => number | null) =>
    axes.map((axis, index) => point(index, Math.max(0.04, pick(axis) ?? 0)).map((v) => v.toFixed(1)).join(",")).join(" ");
  const hasEarlier = axes.some((axis) => axis.earlier !== null);
  const anchor = (index: number) => {
    const [x] = point(index, 1);
    return Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
  };
  return (
    <svg role="img" aria-label={label} viewBox="-16 0 292 205" className="mx-auto block w-full max-w-[330px]">
      <g fill="none" stroke="var(--c-track)" strokeWidth="1">
        <polygon points={ring(1)} />
        <polygon points={ring(0.5)} />
        <path d={axes.map((_, index) => `M${cx} ${cy} L${point(index, 1).map((v) => v.toFixed(1)).join(" ")}`).join(" ")} />
      </g>
      {hasEarlier ? <polygon points={shape((axis) => axis.earlier)} fill={earlierColor} fillOpacity="0.75" /> : null}
      <polygon points={shape((axis) => axis.recent)} fill={recentColor} fillOpacity="0.8" />
      <g fontSize="10" fontWeight="600" className="fill-fg-muted">
        {axes.map((axis, index) => {
          const [x, y] = point(index, 1.1);
          return (
            <text key={axis.label} x={x} y={y + (y > cy ? 10 : y < cy - 60 ? -2 : 3)} textAnchor={anchor(index)}>
              {axis.label}
            </text>
          );
        })}
      </g>
    </svg>
  );
}

/**
 * Strokes gained as columns from a centre line, the way the design draws
 * approach by distance: gains rise in olive, losses hang in stone, and the
 * worst loss is red with its value printed over it.
 */
export function ColumnBars({ data, label }: { data: BarDatum[]; label: string }) {
  if (data.length === 0) return <NoData height={170} />;
  const max = Math.max(0.2, ...data.map((d) => Math.abs(d.value)));
  const worst = data.reduce((low, d) => (d.value < low.value ? d : low), data[0]!);
  const up = 34;
  const down = 100;
  return (
    <div role="img" aria-label={label} className="flex flex-col gap-2">
      <div className="relative grid items-start gap-2" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, height: up + down + 22 }}>
        {data.map((datum) => {
          const isWorst = datum === worst && datum.value < -0.05;
          const height = Math.max(2, (Math.abs(datum.value) / max) * (datum.value >= 0 ? up : down));
          return (
            <div key={datum.label} className="relative h-full">
              <div className="absolute inset-x-0 border-t-[1.5px] border-fg" style={{ top: up + 22 }} aria-hidden />
              {isWorst ? (
                <span className="font-display tabular absolute inset-x-0 text-center text-[15px] text-bad" style={{ top: 0 }}>
                  {signedText(datum.value, 1)}
                </span>
              ) : null}
              <div
                className={cn("absolute inset-x-[15%]", datum.value >= 0 ? "rounded-t-md" : "rounded-b-md")}
                style={{
                  top: datum.value >= 0 ? up + 22 - height : up + 22,
                  height,
                  background: isWorst ? BAD : datum.value >= 0 ? ACCENT : "var(--c-track)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="grid gap-2 text-center text-[10px] font-bold leading-tight text-fg-subtle" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` }}>
        {data.map((datum) => (
          <span key={datum.label} className={cn(datum === worst && datum.value < -0.05 && "font-bold text-fg")}>
            {datum.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- ink card

const MONTH_ONLY = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A trend on the dark ink card, as on Handicap: a gold line, one dot on the latest value, month or day labels. */
export function InkTrendLine({ points, label, dates = "month" }: { points: { date: string; value: number }[]; label: string; dates?: "month" | "day" }) {
  const format = dates === "day" ? DAY : MONTH_ONLY;
  const width = 314;
  const height = 110;
  const top = 14;
  const bottom = 90;
  const values = points.map((point) => point.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const x = (index: number) => (points.length === 1 ? width / 2 : (index / (points.length - 1)) * (width - 6));
  const y = (value: number) => top + ((max - value) / span) * (bottom - top);
  const last = points.at(-1)!;
  const middle = points[Math.floor((points.length - 1) / 2)]!;
  const grid = [Math.ceil(max), Math.floor(min)].filter((value, index, all) => all.indexOf(value) === index && value <= max && value >= min);
  return (
    <svg
      role="img"
      aria-label={`${label} from ${points[0]!.value.toFixed(1)} in ${format.format(new Date(points[0]!.date))} to ${last.value.toFixed(1)} in ${format.format(new Date(last.date))}`}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
    >
      {grid.map((value) => (
        <line key={value} x1="0" x2={width - 22} y1={y(value)} y2={y(value)} stroke="rgb(255 255 255 / 0.08)" />
      ))}
      <polyline
        points={points.map((point, index) => `${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ")}
        fill="none"
        stroke="#E8C547"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(points.length - 1)} cy={y(last.value)} r="5" fill="#E8C547" stroke="#23271F" strokeWidth="2" />
      <g fontSize="10" fontWeight="700" fill="#A9AD9F">
        <text x="0" y="106">{format.format(new Date(points[0]!.date)).toUpperCase()}</text>
        {points.length > 2 ? (
          <text x={width / 2} y="106" textAnchor="middle">
            {format.format(new Date(middle.date)).toUpperCase()}
          </text>
        ) : null}
        <text x={width} y="106" textAnchor="end">
          {format.format(new Date(last.date)).toUpperCase()}
        </text>
        {grid.map((value) => (
          <text key={value} x={width} y={y(value) + 4} textAnchor="end">
            {value}
          </text>
        ))}
      </g>
    </svg>
  );
}

/** A small gold line with no axes: the shape of a trend on a stat card. */
export function MiniSpark({ values, label, width = 130, height = 28 }: { values: number[]; label: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => `${((index / (values.length - 1)) * width).toFixed(1)},${(3 + ((max - value) / span) * (height - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full">
      <polyline className="spark-draw" points={points} fill="none" stroke="#E8C547" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The swing score over the latest swings: a gold line on a baseline, with the recent average dashed. */
export function ScoreLine({ values, recent, label }: { values: number[]; recent: number; label: string }) {
  const width = 314;
  const top = 6;
  const bottom = 50;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const x = (index: number) => (values.length === 1 ? width / 2 : (index / (values.length - 1)) * width);
  const y = (value: number) => top + ((max - value) / span) * (bottom - top);
  const window = values.slice(-recent);
  const average = window.reduce((sum, value) => sum + value, 0) / window.length;
  const last = values.length - 1;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} 62`} className="block w-full">
      <line x1="0" y1="56" x2={width} y2="56" stroke="#3A3F33" strokeWidth="1" />
      <line x1={x(values.length - window.length)} y1={y(average)} x2={width} y2={y(average)} stroke="#E8C547" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
      <polyline
        className="spark-draw"
        style={{ "--line-length": 900 } as React.CSSProperties}
        points={values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ")}
        fill="none"
        stroke="#E8C547"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={Math.min(x(last), width - 4)} cy={y(values[last]!)} r="4.5" fill="#E8C547" stroke="#23271F" strokeWidth="2" />
    </svg>
  );
}
