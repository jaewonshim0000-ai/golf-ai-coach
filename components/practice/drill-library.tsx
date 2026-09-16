"use client";

import { useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";

import type { Drill } from "@/types/practice";
import { DIFFICULTIES, DRILL_CATEGORIES, SKILLS } from "@/types/practice";
import { CLUB_LABELS, labelize } from "@/types/golf";
import { cn } from "@/lib/utils";
import { Badge, Card, CardContent, EmptyState, Input, Select } from "@/components/ui/primitives";

/**
 * The drill library with the filters the practice page needs: category,
 * difficulty, skill, club and duration. Filtering is client-side because the
 * whole library ships with the app - there is no round trip to make.
 */
export function DrillLibrary({
  drills,
  selectable = false,
  selected = [],
  onToggle,
}: {
  drills: Drill[];
  selectable?: boolean;
  selected?: string[];
  onToggle?: (drillId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [skill, setSkill] = useState("");
  const [maxDuration, setMaxDuration] = useState("");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return drills.filter((drill) => {
      if (category && drill.category !== category) return false;
      if (difficulty && drill.difficulty !== difficulty) return false;
      if (skill && drill.skill_trained !== skill) return false;
      if (maxDuration && drill.recommended_duration > Number(maxDuration)) return false;
      if (!needle) return true;
      return (
        drill.name.toLowerCase().includes(needle) ||
        drill.description.toLowerCase().includes(needle) ||
        drill.skill_trained.includes(needle) ||
        drill.category.includes(needle)
      );
    });
  }, [drills, query, category, difficulty, skill, maxDuration]);

  return (
    <div className="space-y-4">
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search drills"
            className="pl-9"
            aria-label="Search drills"
          />
        </div>
        {/* A rail, not a stack: four full-width selects bury the drills. */}
        <div className="no-bar -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <Select className={chip(category)} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {DRILL_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {labelize(c)}
            </option>
          ))}
        </Select>
        <Select className={chip(skill)} value={skill} onChange={(e) => setSkill(e.target.value)} aria-label="Skill">
          <option value="">All skills</option>
          {SKILLS.map((s) => (
            <option key={s} value={s}>
              {labelize(s)}
            </option>
          ))}
        </Select>
        <Select
          className={chip(difficulty)}
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          aria-label="Difficulty"
        >
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {labelize(d)}
            </option>
          ))}
        </Select>
        <Select
          className={chip(maxDuration)}
          value={maxDuration}
          onChange={(e) => setMaxDuration(e.target.value)}
          aria-label="Maximum duration"
        >
          <option value="">Any length</option>
          <option value="10">10 min or less</option>
          <option value="15">15 min or less</option>
          <option value="20">20 min or less</option>
          <option value="30">30 min or less</option>
        </Select>
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
        <Filter className="h-3 w-3" />
        {filtered.length} of {drills.length} drills
        {selectable ? ` · ${selected.length} selected` : ""}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          title="No drills match those filters"
          message="Try widening the category or removing the duration limit."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((drill) => (
            <DrillCard
              key={drill.id}
              drill={drill}
              selectable={selectable}
              selected={selected.includes(drill.id)}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const DIFFICULTY_TONE = {
  beginner: "good",
  intermediate: "info",
  advanced: "warn",
} as const;

export function DrillCard({
  drill,
  selectable,
  selected,
  onToggle,
}: {
  drill: Drill;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (drillId: string) => void;
}) {
  const body = (
    <CardContent className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug">{drill.name}</h3>
        <span className="tabular shrink-0 text-xs text-fg-subtle">
          {drill.recommended_duration} min
        </span>
      </div>

      <p className="text-xs leading-relaxed text-fg-muted">{drill.description}</p>

      <div className="flex flex-wrap gap-1.5">
        <Badge tone="accent">{labelize(drill.skill_trained)}</Badge>
        <Badge tone={DIFFICULTY_TONE[drill.difficulty]}>{drill.difficulty}</Badge>
        <Badge tone="neutral">{labelize(drill.category)}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs">
        <div>
          <dt className="text-fg-subtle">Tracks</dt>
          <dd className="font-medium">{drill.metric_to_track}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Standard</dt>
          <dd className="tabular font-medium">{Math.round(drill.success_threshold * 100)}%</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Reps</dt>
          <dd className="tabular font-medium">{drill.recommended_reps}</dd>
        </div>
        <div>
          <dt className="text-fg-subtle">Clubs</dt>
          <dd className="truncate font-medium">
            {drill.clubs.length === 0
              ? "Any"
              : drill.clubs
                  .slice(0, 2)
                  .map((c) => CLUB_LABELS[c])
                  .join(", ")}
            {drill.clubs.length > 2 ? ` +${drill.clubs.length - 2}` : ""}
          </dd>
        </div>
      </dl>

      {drill.instructions.length > 0 ? (
        <details className="group text-xs">
          <summary className="cursor-pointer list-none text-accent group-open:mb-2">
            How to run it
          </summary>
          <ol className="list-decimal space-y-1 pl-4 text-fg-muted">
            {drill.instructions.map((line, index) => (
              <li key={index}>{line}</li>
            ))}
          </ol>
        </details>
      ) : null}
    </CardContent>
  );

  if (!selectable) return <Card>{body}</Card>;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors",
        selected ? "border-accent ring-1 ring-accent" : "hover:border-border-strong",
      )}
      role="checkbox"
      aria-checked={selected}
      tabIndex={0}
      onClick={() => onToggle?.(drill.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle?.(drill.id);
        }
      }}
    >
      {body}
    </Card>
  );
}

/** Compact pill styling for the filter rail, highlighted when it is set. */
function chip(value: string): string {
  return cn(
    "h-9 w-auto shrink-0 rounded-full px-3.5 text-[11.5px] font-medium shadow-none",
    value ? "border-accent bg-accent-soft text-accent" : "bg-surface",
  );
}
