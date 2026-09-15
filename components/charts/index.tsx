"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import type { DispersionPoint, TrendPoint } from "@/types/analytics";
import { formatShortDate } from "@/lib/utils";

/**
 * Charts. All colour comes from the CSS tokens, so light and dark are handled
 * by the same component and nothing hardcodes a hex value.
 */

const GOOD = "var(--c-good)";
const BAD = "var(--c-bad)";
const ACCENT = "var(--c-accent)";

const tooltipStyle = {
  background: "var(--c-surface)",
  border: "1px solid var(--c-border)",
  borderRadius: 10,
  fontSize: 12,
  color: "var(--c-fg)",
  boxShadow: "var(--shadow-raised)",
} as const;

export type BarDatum = { label: string; value: number; sub?: string };

/** Diverging bar chart: strokes gained is signed, so zero is the axis. */
export function DivergingBars({
  data,
  height = 200,
  layout = "vertical",
  unit = "",
}: {
  data: BarDatum[];
  height?: number;
  layout?: "vertical" | "horizontal";
  unit?: string;
}) {
  if (data.length === 0) return <NoData height={height} />;
  const vertical = layout === "vertical";

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart
        data={data}
        layout={vertical ? "vertical" : "horizontal"}
        margin={{ top: 4, right: 12, bottom: 4, left: vertical ? 8 : 0 }}
      >
        <CartesianGrid strokeDasharray="2 4" horizontal={!vertical} vertical={vertical} />
        {/*
          Axes must be DIRECT children: recharts inspects the chart's immediate
          children by type, so wrapping these in a fragment silently drops them
          and the bars collapse onto one band.
        */}
        <XAxis
          {...(vertical
            ? ({ type: "number" } as const)
            : ({ dataKey: "label", interval: 0 } as const))}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          {...(vertical
            ? ({ type: "category", dataKey: "label", width: 116, interval: 0 } as const)
            : ({ width: 40 } as const))}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ fill: "var(--c-surface-2)" }}
          formatter={(value: number) => [`${value > 0 ? "+" : ""}${value}${unit}`, "Strokes gained"]}
        />
        <ReferenceLine {...(vertical ? { x: 0 } : { y: 0 })} stroke="var(--c-border-strong)" />
        <Bar dataKey="value" radius={4} maxBarSize={28} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell key={entry.label} fill={entry.value >= 0 ? GOOD : BAD} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLine({
  points,
  height = 200,
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
  const stroke = improving ? GOOD : BAD;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id={`fill-${invert ? "inv" : "std"}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatShortDate}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} width={40} domain={["auto", "auto"]} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(value: string) => formatShortDate(value)}
          formatter={(value: number, _name, item) => [
            `${value}${unit}`,
            (item?.payload as TrendPoint | undefined)?.label ?? "Value",
          ]}
        />
        {zeroLine ? <ReferenceLine y={0} stroke="var(--c-border-strong)" /> : null}
        <Area
          type="monotone"
          dataKey="value"
          stroke={stroke}
          strokeWidth={2}
          fill={`url(#fill-${invert ? "inv" : "std"})`}
          dot={{ r: 2.5, fill: stroke, strokeWidth: 0 }}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export type MultiSeries = { name: string; color: string; points: TrendPoint[] };

/** Practice metrics over time. Each drill is its own series on a 0-100% axis. */
export function PracticeTrendChart({ series, height = 220 }: { series: MultiSeries[]; height?: number }) {
  if (series.length === 0 || series.every((s) => s.points.length === 0)) {
    return <NoData height={height} />;
  }

  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const rows = dates.map((date) => {
    const row: Record<string, number | string> = { date };
    for (const s of series) {
      const point = s.points.find((p) => p.date === date);
      if (point) row[s.name] = Math.round(point.value * 100);
    }
    return row;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatShortDate}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} width={40} domain={[0, 100]} unit="%" />
        <Tooltip
          contentStyle={tooltipStyle}
          labelFormatter={(value: string) => formatShortDate(value)}
          formatter={(value: number, name: string) => [`${value}%`, name]}
        />
        {series.map((s) => (
          <Line
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: s.color }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
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
 * shot gained or lost strokes.
 */
export function DispersionChart({
  points,
  height = 260,
}: {
  points: DispersionPoint[];
  height?: number;
}) {
  const plotted = points
    .filter((p) => p.lateral !== null)
    .map((p) => ({
      x: p.lateral === "left" ? -1 : p.lateral === "right" ? 1 : 0,
      y: p.distance,
      sg: p.strokes_gained,
      club: p.club,
    }));

  if (plotted.length === 0) return <NoData height={height} label="No miss directions recorded yet" />;

  // Jitter keeps three discrete columns readable without faking precision.
  const jittered = plotted.map((p, i) => ({ ...p, x: p.x + ((i % 7) - 3) * 0.045 }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 0 }}>
        <CartesianGrid strokeDasharray="2 4" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[-1.6, 1.6]}
          ticks={[-1, 0, 1]}
          tickFormatter={(v: number) => (v === -1 ? "Left" : v === 1 ? "Right" : "Centre")}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Distance"
          unit=" yd"
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <ZAxis range={[36, 36]} />
        <ReferenceLine x={0} stroke="var(--c-border-strong)" />
        <Tooltip
          contentStyle={tooltipStyle}
          cursor={{ strokeDasharray: "3 3" }}
          formatter={(value: number, name: string) =>
            name === "y" ? [`${value} yd`, "Distance"] : [value, name]
          }
        />
        <Scatter data={jittered} fillOpacity={0.75} isAnimationActive={false}>
          {jittered.map((point, index) => (
            <Cell key={index} fill={point.sg >= 0 ? GOOD : BAD} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

export function CountBars({ data, height = 180 }: { data: BarDatum[]; height?: number }) {
  if (data.length === 0) return <NoData height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval={0} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "var(--c-surface-2)" }} />
        <Bar dataKey="value" fill={ACCENT} radius={4} maxBarSize={36} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function NoData({ height, label = "Not enough data yet" }: { height: number; label?: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-border text-xs text-fg-subtle"
      style={{ height }}
    >
      {label}
    </div>
  );
}
