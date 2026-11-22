import type { Club, Lie, SGCategory, ShotType } from "@/types/golf";
import type { StatsFilters as Filters } from "@/types/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { cn, signed } from "@/lib/utils";

/* Pieces shared by the Play tab, its handicap page and its strokes-gained page. */

export type Search = {
  baseline?: string;
  range?: string;
  category?: string;
  club?: string;
  lie?: string;
  shot_type?: string;
  distance?: string;
};

export function toFilters(search: Search): Filters {
  const filters: Filters = {};
  if (search.range) {
    const days = Number(search.range);
    if (Number.isFinite(days)) {
      filters.from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    }
  }
  if (search.category) filters.categories = [search.category as SGCategory];
  if (search.club) filters.clubs = [search.club as Club];
  if (search.lie) filters.lies = [search.lie as Lie];
  if (search.shot_type) filters.shotTypes = [search.shot_type as ShotType];
  if (search.distance) {
    const [min, max] = search.distance.split("-").map(Number);
    if (Number.isFinite(min)) filters.minDistance = min;
    if (Number.isFinite(max)) filters.maxDistance = max;
  }
  return filters;
}

export const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);
export const one = (value: number | null) => (value === null ? "—" : value.toFixed(1));

/** Where the holes finished against par, as one stacked bar. */
export function ScoreMix({ mix }: { mix: { under: number; par: number; bogey: number; double: number } }) {
  const total = mix.under + mix.par + mix.bogey + mix.double;
  const parts = [
    { label: "Birdie or better", value: mix.under, className: "bg-good" },
    { label: "Par", value: mix.par, className: "bg-accent-soft" },
    { label: "Bogey", value: mix.bogey, className: "bg-warn" },
    { label: "Double or worse", value: mix.double, className: "bg-bad" },
  ];
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={parts.map((part) => `${part.label} ${part.value}`).join(", ")}>
        {parts.map((part) =>
          part.value > 0 ? (
            <span key={part.label} className={part.className} style={{ width: `${(part.value / total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted">
        {parts.map((part) => (
          <span key={part.label} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", part.className)} aria-hidden />
            {part.label} <span className="tabular font-medium text-fg">{Math.round((part.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function SGCell({ label, value, digits = 2 }: { label: string; value: number; digits?: number }) {
  return (
    <div className="min-w-0">
      <p className="dsp text-[10px] tracking-[0.15em] text-fg-subtle">{label}</p>
      <p
        className={cn(
          "tabular mt-0.5 text-[12.5px] font-semibold",
          value > 0.05 ? "text-good" : value < -0.05 ? "text-bad" : "text-fg-muted",
        )}
      >
        {signed(value, digits)}
      </p>
    </div>
  );
}
