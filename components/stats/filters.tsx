"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";

import { CLUBS, CLUB_LABELS, LIES, SG_CATEGORIES, SG_CATEGORY_LABELS, SHOT_TYPES, labelize } from "@/types/golf";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/primitives";

/**
 * Filters live in the URL so a view is shareable and the server does the
 * filtering. No client-side data store for something the query string already
 * models perfectly well.
 *
 * Presented as a scrolling chip rail rather than a stack of full-width inputs:
 * six stacked selects push the actual statistics off a phone screen.
 */
export function StatsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.push(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const active = [...params.keys()].length > 0;

  return (
    <div className="no-bar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
      <Chip name="range" value={params.get("range")} onChange={set} label="Date range">
        <option value="">All time</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="180">Last 6 months</option>
        <option value="365">Last year</option>
      </Chip>

      <Chip name="category" value={params.get("category")} onChange={set} label="Category">
        <option value="">All categories</option>
        {SG_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {SG_CATEGORY_LABELS[c]}
          </option>
        ))}
      </Chip>

      <Chip name="club" value={params.get("club")} onChange={set} label="Club">
        <option value="">All clubs</option>
        {CLUBS.map((c) => (
          <option key={c} value={c}>
            {CLUB_LABELS[c]}
          </option>
        ))}
      </Chip>

      <Chip name="lie" value={params.get("lie")} onChange={set} label="Lie">
        <option value="">All lies</option>
        {LIES.filter((l) => l !== "holed").map((l) => (
          <option key={l} value={l}>
            {labelize(l)}
          </option>
        ))}
      </Chip>

      <Chip name="shot_type" value={params.get("shot_type")} onChange={set} label="Shot type">
        <option value="">All shot types</option>
        {SHOT_TYPES.map((t) => (
          <option key={t} value={t}>
            {labelize(t)}
          </option>
        ))}
      </Chip>

      <Chip name="distance" value={params.get("distance")} onChange={set} label="Distance">
        <option value="">Any distance</option>
        <option value="0-50">Inside 50 yd</option>
        <option value="50-100">50-100 yd</option>
        <option value="100-150">100-150 yd</option>
        <option value="150-200">150-200 yd</option>
        <option value="200-600">200+ yd</option>
      </Chip>

      {active ? (
        <button
          type="button"
          onClick={() => startTransition(() => router.push(pathname, { scroll: false }))}
          aria-label="Clear filters"
          disabled={pending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-fg-muted disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function Chip({
  name,
  value,
  onChange,
  label,
  children,
}: {
  name: string;
  value: string | null;
  onChange: (key: string, value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <Select
      value={value ?? ""}
      onChange={(e) => onChange(name, e.target.value)}
      aria-label={label}
      className={cn(
        "h-9 w-auto shrink-0 rounded-full px-3.5 text-[11.5px] font-medium shadow-none",
        value ? "border-accent bg-accent-soft text-accent" : "bg-surface",
      )}
    >
      {children}
    </Select>
  );
}
