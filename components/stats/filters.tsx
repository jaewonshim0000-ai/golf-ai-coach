"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";

import { CLUBS, CLUB_LABELS, LIES, SG_CATEGORIES, SG_CATEGORY_LABELS, SHOT_TYPES, labelize } from "@/types/golf";
import { Button, Select } from "@/components/ui/primitives";

/**
 * Filters live in the URL so a view is shareable and the server does the
 * filtering. No client-side data store for something the query string already
 * models perfectly well.
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
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Select
        value={params.get("range") ?? ""}
        onChange={(e) => set("range", e.target.value)}
        aria-label="Date range"
      >
        <option value="">All time</option>
        <option value="30">Last 30 days</option>
        <option value="90">Last 90 days</option>
        <option value="180">Last 6 months</option>
        <option value="365">Last year</option>
      </Select>

      <Select
        value={params.get("category") ?? ""}
        onChange={(e) => set("category", e.target.value)}
        aria-label="Category"
      >
        <option value="">All categories</option>
        {SG_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {SG_CATEGORY_LABELS[c]}
          </option>
        ))}
      </Select>

      <Select value={params.get("club") ?? ""} onChange={(e) => set("club", e.target.value)} aria-label="Club">
        <option value="">All clubs</option>
        {CLUBS.map((c) => (
          <option key={c} value={c}>
            {CLUB_LABELS[c]}
          </option>
        ))}
      </Select>

      <Select value={params.get("lie") ?? ""} onChange={(e) => set("lie", e.target.value)} aria-label="Lie">
        <option value="">All lies</option>
        {LIES.filter((l) => l !== "holed").map((l) => (
          <option key={l} value={l}>
            {labelize(l)}
          </option>
        ))}
      </Select>

      <Select
        value={params.get("shot_type") ?? ""}
        onChange={(e) => set("shot_type", e.target.value)}
        aria-label="Shot type"
      >
        <option value="">All shot types</option>
        {SHOT_TYPES.map((t) => (
          <option key={t} value={t}>
            {labelize(t)}
          </option>
        ))}
      </Select>

      <div className="flex gap-2">
        <Select
          value={params.get("distance") ?? ""}
          onChange={(e) => set("distance", e.target.value)}
          aria-label="Distance"
          className="flex-1"
        >
          <option value="">Any distance</option>
          <option value="0-50">Inside 50 yd</option>
          <option value="50-100">50-100 yd</option>
          <option value="100-150">100-150 yd</option>
          <option value="150-200">150-200 yd</option>
          <option value="200-600">200+ yd</option>
        </Select>
        {active ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => startTransition(() => router.push(pathname, { scroll: false }))}
            aria-label="Clear filters"
            disabled={pending}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
