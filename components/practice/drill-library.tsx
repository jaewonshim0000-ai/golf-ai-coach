"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Drill } from "@/types/practice";
import { TEST_GROUPS, practiceTest, type TestGroup } from "@/lib/practice/tests";
import { cn } from "@/lib/utils";
import { Badge, ButtonLink, Card, CardContent, EmptyState, Input } from "@/components/ui/primitives";

const GROUP_LABELS: Record<TestGroup, string> = { range: "Range", chipping: "Chipping", putting: "Putting" };

export function DrillLibrary({ drills }: { drills: Drill[] }) {
  const [query, setQuery] = useState("");
  const [area, setArea] = useState<TestGroup | "">("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return drills.filter((drill) => {
      const test = practiceTest(drill.id);
      return test && (!area || test.group === area) && `${drill.name} ${test.focus} ${test.scoring}`.toLowerCase().includes(needle);
    });
  }, [drills, area, query]);

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tests or distances" aria-label="Search tests" className="pl-9" />
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Practice area">
        {(["", ...TEST_GROUPS] as const).map((group) => (
          <button key={group} type="button" aria-pressed={area === group} onClick={() => setArea(group)}
            className={cn("min-h-10 rounded-full border px-4 text-xs font-medium", area === group ? "border-accent bg-accent-soft text-accent" : "border-border bg-surface text-fg-muted")}>
            {group ? `${GROUP_LABELS[group]} · 10` : "All 30 tests"}
          </button>
        ))}
      </div>
      <p className="text-xs text-fg-subtle">{filtered.length} of 30 tests</p>
      {filtered.length === 0 ? <EmptyState title="No tests match" message="Try another distance or choose all areas." /> : null}
      {TEST_GROUPS.filter((group) => !area || group === area).map((group) => {
        const groupDrills = filtered.filter((drill) => practiceTest(drill.id)!.group === group);
        if (!groupDrills.length) return null;
        return (
          <section key={group} aria-labelledby={`tests-${group}`} className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id={`tests-${group}`} className="text-base font-semibold">{GROUP_LABELS[group]} practice tests</h2>
              <span className="text-xs text-fg-subtle">{group === "putting" ? "9 ten-putt tests + spiral" : group === "chipping" ? "10 tests · 100 attempts" : "10 tests · 100 shots"}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groupDrills.map((drill) => <DrillCard key={drill.id} drill={drill} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function DrillCard({ drill }: { drill: Drill }) {
  const test = practiceTest(drill.id)!;
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-snug">{drill.name}</h3>
          <Badge tone="neutral">{test.kind === "spiral" ? "Until completed" : "10 balls"}</Badge>
        </div>
        <p className="text-xs font-medium text-accent">{test.focus}</p>
        <p className="text-xs leading-relaxed text-fg-muted">{test.scoring}</p>
        <details className="text-xs">
          <summary className="min-h-9 cursor-pointer py-2 font-medium text-accent">How to run it</summary>
          <ol className="list-decimal space-y-2 pl-4 leading-relaxed text-fg-muted">
            {drill.instructions.map((line, index) => <li key={index}>{line}</li>)}
          </ol>
        </details>
        <ButtonLink href={`/practice/tests/${drill.id}`} size="sm" variant="secondary" className="mt-auto">Start test</ButtonLink>
      </CardContent>
    </Card>
  );
}
