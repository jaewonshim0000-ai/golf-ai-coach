"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Drill } from "@/types/practice";
import { TEST_GROUPS, practiceTest, type TestGroup } from "@/lib/practice/tests";
import { cn } from "@/lib/utils";
import { CLUB_LABELS } from "@/types/golf";
import { Input, chip } from "@/components/ui/primitives";

const GROUP_LABELS: Record<TestGroup, string> = { range: "Range", chipping: "Chipping", putting: "Putting" };

/* One small picture per practice area, in the icon circle of each row. */
function AreaIcon({ group }: { group: TestGroup }) {
  if (group === "putting") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 18V4l6 2.5L9 9" />
        <circle cx="9" cy="19.5" r="1.5" />
      </svg>
    );
  }
  if (group === "chipping") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M4 19c4-1 9-5 13-12" />
        <circle cx="18.5" cy="6" r="1.8" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}

/**
 * The drill library: search, area chips, then one white row per drill, most
 * needed first. Drills your rounds point at are marked For you; the ones you
 * have bookmarked, Saved.
 */
export function DrillLibrary({
  drills,
  priorities,
}: {
  drills: { drill: Drill; forYou: boolean }[];
  priorities: string[];
}) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<TestGroup | "">("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return drills.filter(({ drill }) => {
      const test = practiceTest(drill.id);
      return (
        test &&
        (!area || test.group === area) &&
        `${drill.name} ${test.focus} ${test.scoring}`.toLowerCase().includes(needle)
      );
    });
  }, [drills, area, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-fg-subtle" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search drills, skills or distances"
          aria-label="Search drills"
          className="pl-11"
        />
      </div>
      <div className="no-bar -mx-4 flex gap-2 overflow-x-auto px-4" role="group" aria-label="Practice area">
        {(["", ...TEST_GROUPS] as const).map((group) => (
          <button
            key={group}
            type="button"
            aria-pressed={area === group}
            onClick={() => setArea(group)}
            className={chip(area === group, "min-w-[80px]")}
          >
            {group ? GROUP_LABELS[group] : "All"}
          </button>
        ))}
      </div>
      <div className="flex items-baseline justify-between">
        <span className="dsp text-[12px] tracking-[0.1em] text-fg-muted">Most needed first</span>
        <span className="text-[12px] font-semibold text-fg-subtle">
          {filtered.length} drill{filtered.length === 1 ? "" : "s"}
        </span>
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-[22px] bg-surface px-4 py-5 text-[14px] text-fg-muted">
          No drills match. Try another distance or choose all areas.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {filtered.map(({ drill, forYou }) => {
            const test = practiceTest(drill.id)!;
            const saved = priorities.includes(drill.id);
            const detail = [
              GROUP_LABELS[test.group],
              test.clubs[0] && test.group !== "putting" ? CLUB_LABELS[test.clubs[0]] : test.focus,
              `${drill.recommended_duration} min`,
            ].join(" · ");
            return (
              <li key={drill.id}>
                <Link
                  href={`/practice/tests/${drill.id}`}
                  className="press-lg flex items-center gap-3.5 rounded-[22px] bg-surface py-3 pl-3 pr-4"
                >
                  <span
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                      forYou ? "bg-accent text-white" : "bg-surface-2 text-fg",
                    )}
                  >
                    <AreaIcon group={test.group} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-bold leading-[1.25]">{drill.name}</span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-fg-subtle">{detail}</span>
                  </span>
                  {forYou ? (
                    <span className="dsp inline-flex h-[26px] shrink-0 items-center rounded-full bg-accent-soft px-2.5 text-[10px] text-accent-strong">
                      For you
                    </span>
                  ) : saved ? (
                    <span className="dsp inline-flex h-[26px] shrink-0 items-center rounded-full border-[1.5px] border-fg px-2.5 text-[10px]">
                      Saved
                    </span>
                  ) : test.kind === "spiral" ? null : (
                    <span className="dsp inline-flex h-[26px] shrink-0 items-center rounded-full border-[1.5px] border-fg px-2.5 text-[10px]">
                      Test
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
