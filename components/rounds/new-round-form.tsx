"use client";

import { useActionState, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { createRoundAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import { ROUND_TYPES, labelize } from "@/types/golf";
import { cn } from "@/lib/utils";
import { ActionBar, Button, GroupLabel, Input, barButton, chip } from "@/components/ui/primitives";
import { Flag } from "@/components/layout/nav";

/**
 * Where, when, what kind of round, and how it will be logged: shot by shot
 * for strokes gained, or the quick card for score, putts and fairways.
 */
export function NewRoundForm({ courseNames }: { courseNames: string[] }) {
  const [state, formAction, pending] = useActionState(createRoundAction, IDLE);
  const errors = state.errors ?? {};
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const [course, setCourse] = useState(courseNames[0] ?? "");
  const [type, setType] = useState<(typeof ROUND_TYPES)[number]>("casual");
  const [log, setLog] = useState<"shots" | "card">("shots");
  const input = useRef<HTMLInputElement>(null);

  return (
    <form action={formAction} className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-2">
        <label htmlFor="course" className="dsp text-[12px] tracking-[0.1em] text-fg-muted">
          Course
        </label>
        <Input
          id="course"
          ref={input}
          name="course_name"
          required
          minLength={2}
          maxLength={120}
          list="course-names"
          autoComplete="off"
          placeholder="Riverbend Golf Club"
          value={course}
          onChange={(event) => setCourse(event.target.value)}
          className="font-semibold"
        />
        <datalist id="course-names">
          {courseNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {errors.course_name ? <span className="text-[12px] text-bad">{errors.course_name}</span> : null}
        <div className="no-bar -mx-5 flex gap-1.5 overflow-x-auto px-5">
          {courseNames
            .filter((name) => name !== course)
            .slice(0, 3)
            .map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setCourse(name)}
                className="press h-8 shrink-0 rounded-full border-[1.5px] border-fg bg-surface px-3 text-[12px] font-semibold"
              >
                {name}
              </button>
            ))}
          <button
            type="button"
            onClick={() => {
              setCourse("");
              input.current?.focus();
            }}
            className="press h-8 shrink-0 rounded-full border-[1.5px] border-dashed border-[#a9ad9f] bg-surface px-3 text-[12px] font-semibold text-fg-muted"
          >
            + New course
          </button>
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <GroupLabel>Date</GroupLabel>
        <Input name="played_on" type="date" required defaultValue={today} className="font-semibold" />
        {errors.played_on ? <span className="text-[12px] text-bad">{errors.played_on}</span> : null}
      </label>

      <fieldset>
        <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">Type of round</legend>
        <input type="hidden" name="round_type" value={type} />
        <div role="radiogroup" aria-label="Type of round" className="grid grid-cols-4 gap-2">
          {ROUND_TYPES.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={type === option}
              onClick={() => setType(option)}
              className={chip(type === option, "px-1 tracking-[0.06em]")}
            >
              {labelize(option)}
            </button>
          ))}
        </div>
        {errors.round_type ? <p className="mt-1 text-[12px] text-bad">{errors.round_type}</p> : null}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">How you&apos;ll log it</legend>
        {(
          [
            ["shots", "Shot by shot", "Full strokes gained. About 10 sec a shot."],
            ["card", "Quick card", "Score, putts, fairways and greens."],
          ] as const
        ).map(([value, title, detail]) => (
          <label
            key={value}
            className={cn(
              "press-lg flex cursor-pointer flex-col gap-1.5 rounded-[22px] p-3.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent",
              log === value ? "bg-ink text-white" : "bg-surface-2",
            )}
          >
            <input
              type="radio"
              name="log"
              value={value}
              checked={log === value}
              onChange={() => setLog(value)}
              className="sr-only"
            />
            <span className="font-display text-[18px] uppercase">{title}</span>
            <span className={cn("text-[12px] leading-[1.4]", log === value ? "text-[#c9ccbf]" : "text-fg-subtle")}>
              {detail}
            </span>
          </label>
        ))}
      </fieldset>

      {state.message && !state.ok ? (
        <p className="rounded-2xl bg-bad-soft px-3.5 py-2.5 text-[13px] text-bad">{state.message}</p>
      ) : null}

      <ActionBar className="[--bar-fade:var(--c-surface)]">
        <Button type="submit" className={barButton} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" strokeWidth={2.2} />}
          Tee off
        </Button>
      </ActionBar>
    </form>
  );
}
