"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowUpRight, Check, ListFilter, Loader2, Search, Star } from "lucide-react";

import { savePracticePrioritiesAction, type PracticePrioritiesState } from "@/app/actions";
import { Badge, Button, ButtonLink, Card, CardContent, CardHeader, CardTitle, Input, Select } from "@/components/ui/primitives";
import { GOAL_SHORT, type GoalId } from "@/lib/practice/goals";
import { goalsForDrill, type RankedPracticeDrill } from "@/lib/practice/drill-priorities";
import { cn } from "@/lib/utils";
import { CLUB_LABELS, labelize } from "@/types/golf";

const INITIAL: PracticePrioritiesState = { ok: false };

export function PracticeDrillPriorities({
  drills,
  initialSelected,
}: {
  drills: RankedPracticeDrill[];
  initialSelected: string[];
}) {
  const [state, formAction, pending] = useActionState(savePracticePrioritiesAction, INITIAL);
  const [selected, setSelected] = useState(initialSelected);
  const [query, setQuery] = useState("");
  const [goal, setGoal] = useState<GoalId | "">("");
  const saved = state.drillIds ?? initialSelected;
  const dirty = selected.length !== saved.length || selected.some((id) => !saved.includes(id));
  const hasRecommendations = drills.some((entry) => entry.reason);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return drills.filter(({ drill }) =>
      (!goal || goalsForDrill(drill).includes(goal)) &&
      (!needle || `${drill.name} ${drill.description} ${labelize(drill.skill_trained)}`.toLowerCase().includes(needle)),
    );
  }, [drills, goal, query]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <section id="practice-drills" aria-labelledby="practice-drills-title" className="space-y-3 scroll-mt-6">
      <Card>
        <CardHeader className="gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle id="practice-drills-title">Choose your practice priorities</CardTitle>
            <Badge tone="neutral">{drills.length} drills</Badge>
          </div>
          <p className="text-[12px] leading-relaxed text-fg-muted">
            {hasRecommendations
              ? "The areas needing the most work from your last 10 rounds appear first. Pick any drills you want to focus on."
              : "Pick the drills you want to focus on. Log shots or detailed scorecards and the areas needing work will move to the top."}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <Input aria-label="Search practice drills" placeholder="Search drills or skills" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" />
            </div>
            <Select aria-label="Filter practice drills by area" value={goal} onChange={(event) => setGoal(event.target.value as GoalId | "")} className="sm:w-44">
              <option value="">All areas</option>
              {Object.entries(GOAL_SHORT).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </Select>
          </div>
          <form id="practice-priorities-form" action={formAction} className="space-y-2">
            {/* Hidden fields keep priorities selected through searches and filters. */}
            {selected.map((id) => <input key={id} type="hidden" name="drill_ids" value={id} />)}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] text-fg-muted">
                <Star className="h-3.5 w-3.5 text-accent" aria-hidden /> {selected.length} prioritized
              </p>
              <div className="flex items-center gap-1.5">
                {selected.length > 0 ? <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setSelected([])}>Clear</Button> : null}
                <Button type="submit" size="sm" disabled={pending || !dirty}>
                  {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {pending ? "Saving…" : "Save priorities"}
                </Button>
              </div>
            </div>
            <p role="status" className={cn("text-[11px] leading-relaxed", state.message && !state.ok ? "text-bad" : "text-fg-subtle")}>
              {pending ? "Saving your choices…" : state.message && !state.ok ? state.message : dirty ? "Unsaved changes. Save to use these drills in future plans." : state.message ?? "Saved drills are preferred in the matching work blocks of 30- and 60-minute plans."}
            </p>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2 text-[11px] text-fg-subtle">
        <span className="flex items-center gap-1.5"><ListFilter className="h-3.5 w-3.5" aria-hidden />{filtered.length} of {drills.length} drills</span>
        <span>{hasRecommendations ? "Most needed first" : "All-round practice"}</span>
      </div>

      <ol className="space-y-2.5">
        {filtered.map(({ drill, reason, signal }, index) => {
          const prioritized = selected.includes(drill.id);
          return (
            <li key={drill.id}>
              <Card className={cn("transition-colors", prioritized && "border-accent ring-1 ring-accent/30")}>
                <CardContent className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <span className="tabular mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-medium text-fg-subtle" aria-hidden>{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[14px] font-semibold leading-snug">{drill.name}</h3>
                      <p className="mt-1 text-[11px] text-fg-subtle">{drill.recommended_duration} min · {labelize(drill.skill_trained)}</p>
                    </div>
                    <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-border-strong px-3 text-[11px] font-medium has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent">
                      <input type="checkbox" checked={prioritized} disabled={pending} onChange={() => toggle(drill.id)} aria-label={`Prioritize ${drill.name}`} className="h-4 w-4 accent-accent" />
                      <span className="hidden sm:inline">{prioritized ? "Prioritized" : "Prioritize"}</span>
                    </label>
                  </div>
                  {reason ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-2">
                      <Badge tone={signal === "early" ? "neutral" : "accent"}>{signal === "early" ? "Early signal" : "From your rounds"}</Badge>
                      <p className="text-[11px] leading-relaxed text-fg-muted">{reason}</p>
                    </div>
                  ) : null}
                  <p className="text-[12px] leading-relaxed text-fg-muted">{drill.description}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <p className="text-[11px] text-fg-subtle">{drill.clubs.map((club) => CLUB_LABELS[club]).join(", ")} · {drill.difficulty}</p>
                    <details className="w-full text-[12px]">
                      <summary className="min-h-9 cursor-pointer py-2 font-medium text-accent">How to run this drill</summary>
                      <ol className="list-decimal space-y-1.5 pl-5 leading-relaxed text-fg-muted">
                        {drill.instructions.map((line, step) => <li key={step}>{line}</li>)}
                      </ol>
                      <p className="mt-3 text-fg-muted">Track: {drill.metric_to_track}. Aim for {Math.ceil(drill.recommended_reps * drill.success_threshold)} of {drill.recommended_reps}.</p>
                    </details>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
      {filtered.length === 0 ? <p className="rounded-xl bg-surface-2 p-5 text-center text-[13px] text-fg-muted">No drills match. Try another search or choose all areas.</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap gap-2">
          <Button type="submit" form="practice-priorities-form" size="sm" disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save priorities"}
          </Button>
          <ButtonLink href="/practice/start" size="sm" variant="secondary">Build a practice plan <ArrowUpRight className="h-3.5 w-3.5" /></ButtonLink>
        </div>
        <ButtonLink href="/practice/drills" size="sm" variant="secondary">Explore the full library</ButtonLink>
      </div>
    </section>
  );
}
