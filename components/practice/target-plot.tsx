"use client";

import { useState } from "react";
import { Keyboard, Undo2, X } from "lucide-react";

import { missPattern, offsetFor, type PracticeGoal } from "@/lib/practice/goals";
import { cn } from "@/lib/utils";
import { Button, Input } from "@/components/ui/primitives";

type Point = [number, number];

/**
 * Where did it finish? Tap it.
 *
 * A top-down target: left and right across, short and long up and down, on
 * one scale so the picture is honest about shape. Full-swing goals draw the
 * band as a corridor down the target line; a chip draws it as a circle round
 * the hole. Tapping is faster than typing and gives depth for free; typing is
 * still there for keyboards and screen readers.
 */
export function TargetPlot({
  goal,
  tolerance,
  points,
  onChange,
  balls,
  disabled = false,
  measurement = false,
  landing = false,
}: {
  goal: PracticeGoal;
  tolerance: number;
  points: Point[];
  onChange: (points: Point[]) => void;
  balls: number;
  disabled?: boolean;
  measurement?: boolean;
  landing?: boolean;
}) {
  const [typing, setTyping] = useState(false);
  const chip = goal.id === "chip_accuracy";
  const unit = goal.unit === "feet" ? "ft" : "yd";
  // Half the plot's width in the goal's unit: room for a wide miss either side.
  const reach = tolerance * 2.5;
  const scale = 50 / reach;
  const toSvg = ([x, y]: Point) => [50 + x * scale, 50 - y * scale] as const;
  const full = points.length >= balls;
  const pattern = missPattern(points, goal, tolerance);
  const ticks = [-2, -1, 1, 2].map((step) => step * tolerance);
  const tickLabel = (value: number) => `${value > 0 ? "+" : "−"}${Number(Math.abs(value).toFixed(1))}`;

  function place(event: React.PointerEvent<SVGSVGElement>) {
    if (disabled || full) return;
    const box = event.currentTarget.getBoundingClientRect();
    const sx = ((event.clientX - box.left) / box.width) * 100;
    const sy = ((event.clientY - box.top) / box.height) * 100;
    const snap = (value: number) => Math.round(value * 2) / 2;
    onChange([...points, [snap((sx - 50) / scale), snap((50 - sy) / scale)]]);
  }

  function edit(index: number, axis: 0 | 1, raw: string) {
    const value = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(value)) return;
    const next = points.map((point) => [...point] as Point);
    if (index === next.length) next.push([0, 0]);
    next[index]![axis] = Math.max(-300, Math.min(300, value));
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-[360px]">
        <svg
          viewBox="0 0 100 100"
          className={cn(
            "aspect-square w-full touch-none select-none rounded-2xl bg-surface-2",
            !disabled && !full && "cursor-crosshair",
          )}
          onPointerDown={place}
          role="img"
          aria-label={`${landing ? "Landing spot" : "Target"}, ${points.length} of ${balls} balls plotted${measurement ? `. X axis: left negative, right positive. Y axis: short negative, long positive. Both axes in ${unit}.` : pattern ? `. ${pattern.successes} inside ${tolerance} ${unit}` : ""}`}
        >
          {measurement ? ticks.map((value) => {
            const [x, y] = toSvg([value, value]);
            return <g key={`grid-${value}`} className="stroke-border" strokeWidth={0.25} strokeDasharray="1 1.5">
              <line x1={x} x2={x} y1={0} y2={100} />
              <line x1={0} x2={100} y1={y} y2={y} />
            </g>;
          }) : null}
          {measurement ? null : chip ? (
            <>
              <circle cx={50} cy={50} r={tolerance * 2 * scale} className="fill-none stroke-border-strong" strokeDasharray="1.5 1.5" strokeWidth={0.4} />
              <circle cx={50} cy={50} r={tolerance * scale} className="fill-good-soft stroke-good" strokeWidth={0.5} />
            </>
          ) : (
            <>
              <rect x={50 - tolerance * scale} y={0} width={tolerance * 2 * scale} height={100} className="fill-good-soft" />
              {[-1, 1].map((side) => (
                <line key={side} x1={50 + side * tolerance * scale} x2={50 + side * tolerance * scale} y1={0} y2={100} className="stroke-good" strokeWidth={0.4} />
              ))}
              <line x1={50} x2={50} y1={0} y2={100} className="stroke-border-strong" strokeWidth={0.3} strokeDasharray="1.5 1.5" />
            </>
          )}
          <line x1={0} x2={100} y1={50} y2={50} className={measurement ? "stroke-fg-muted" : "stroke-border"} strokeWidth={measurement ? 0.5 : 0.3} />
          {measurement ? <>
            <line x1={50} x2={50} y1={7} y2={93} className="stroke-fg-muted" strokeWidth={0.5} />
            {ticks.map((value) => {
              const [x, y] = toSvg([value, value]);
              return <g key={`tick-${value}`}>
                <path d={`M ${x} 48.5 V 51.5 M 48.5 ${y} H 51.5`} className="fill-none stroke-fg-muted" strokeWidth={0.4} />
                <text x={x} y={55} textAnchor="middle" className="fill-fg-muted text-[3px]">{tickLabel(value)}</text>
                <text x={52.5} y={y + 1} className="fill-fg-muted text-[3px]">{tickLabel(value)}</text>
              </g>;
            })}
            <text x={53} y={54.5} className="fill-fg-muted text-[3px]">0</text>
          </> : null}
          {/* The target: a flag for a full swing, the hole for a chip. */}
          <circle cx={50} cy={50} r={chip ? 1.4 : 1.8} className="fill-fg" />
          <text x={50} y={4.5} textAnchor="middle" className="fill-fg-subtle text-[3.2px]">{measurement ? `Long + (${unit})` : "Long"}</text>
          <text x={50} y={98} textAnchor="middle" className="fill-fg-subtle text-[3.2px]">{measurement ? `Short − (${unit})` : "Short"}</text>
          <text x={2} y={measurement ? 46 : 51.2} className="fill-fg-subtle text-[3.2px]">{measurement ? `Left − (${unit})` : "Left"}</text>
          <text x={98} y={measurement ? 46 : 51.2} textAnchor="end" className="fill-fg-subtle text-[3.2px]">{measurement ? `Right + (${unit})` : "Right"}</text>
          {!measurement ? <text x={50 + tolerance * scale + 1} y={97} className="fill-good text-[3px]">
            {tolerance} {unit}
          </text> : null}
          {points.map((point, index) => {
            const [cx, cy] = toSvg(point);
            const good = Math.abs(offsetFor(goal, point)) <= tolerance;
            return (
              <g key={index}>
                <circle
                  cx={Math.max(2, Math.min(98, cx))}
                  cy={Math.max(2, Math.min(98, cy))}
                  r={index === points.length - 1 ? 3 : 2.4}
                  className={measurement ? "fill-accent" : good ? "fill-good" : "fill-bad"}
                  stroke="white"
                  strokeWidth={0.5}
                />
                <text
                  x={Math.max(2, Math.min(98, cx))}
                  y={Math.max(2, Math.min(98, cy)) + 1.1}
                  textAnchor="middle"
                  className="pointer-events-none fill-white text-[2.8px] font-semibold"
                >
                  {index + 1}
                </text>
              </g>
            );
          })}
        </svg>
        {measurement ? <p className="mt-2 text-center text-[11px] text-fg-muted">X: left / right · Y: short / long · Both in {unit}. Target = (0, 0).</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="tabular text-[12.5px] font-medium" aria-live="polite">
          {full ? "All balls plotted" : `Tap where ball ${points.length + 1} of ${balls} ${landing ? "first landed" : "finished"}`}
        </p>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="secondary" onClick={() => onChange(points.slice(0, -1))} disabled={disabled || points.length === 0}>
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange([])} disabled={disabled || points.length === 0}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
          <Button type="button" size="sm" variant="ghost" aria-pressed={typing} onClick={() => setTyping((on) => !on)}>
            <Keyboard className="h-3.5 w-3.5" /> Type
          </Button>
        </div>
      </div>

      {typing ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: balls }, (_, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="tabular w-12 shrink-0 text-[11px] text-fg-subtle">Ball {index + 1}</span>
              {([0, 1] as const).map((axis) => (
                <Input
                  key={axis}
                  type="number"
                  step="0.5"
                  inputMode="decimal"
                  disabled={disabled || index > points.length}
                  aria-label={`Ball ${index + 1} ${axis === 0 ? `${unit} left (negative) or right` : `${unit} short (negative) or long`}`}
                  placeholder={axis === 0 ? "L− / R+" : "S− / L+"}
                  value={points[index]?.[axis] ?? ""}
                  onChange={(event) => edit(index, axis, event.target.value)}
                  className="h-9 min-w-0 px-2 text-center"
                />
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {pattern && !measurement ? (
        <div className="rounded-xl bg-surface-2 p-3 text-[12.5px] leading-[1.6]" aria-live="polite">
          <p className="font-medium">
            {pattern.successes} of {pattern.count} inside {tolerance} {unit} · average {landing ? "landing miss" : chip ? "proximity" : "miss"}{" "}
            {pattern.averageMiss.toFixed(1)} {unit}
          </p>
          <p className="text-fg-muted">
            {pattern.summary}
            {!chip ? ` Left-to-right spread ${pattern.spread.toFixed(1)} ${unit}.` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
