"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Loader2 } from "lucide-react";

import { IDLE, type ActionState } from "@/lib/action-state";
import type { PlayerProfile } from "@/types/player";
import { GOALS, GOAL_LABELS, PRACTICE_FACILITIES } from "@/types/player";
import {
  CLUBS,
  CLUB_LABELS,
  DOMINANT_HANDS,
  EXPERIENCE_LEVELS,
  MISS_DIRECTIONS,
  SWING_PATTERNS,
  labelize,
} from "@/types/golf";
import { cn } from "@/lib/utils";
import { ActionBar, Button, Field, GroupLabel, Input, barButton } from "@/components/ui/primitives";

/**
 * One form serves onboarding (as the design's four-step wizard) and the
 * profile page (as the design's list of rows, each opening its fields).
 * Every field is always in the DOM so a single submit carries the whole
 * profile regardless of which step or row the player is looking at.
 */

const STEPS = [
  { id: "player", title: "About you", label: "About you", question: "Tell us about you" },
  { id: "game", title: "Your golf game", label: "Your scores", question: "Where's your game today?" },
  { id: "goals", title: "Goals", label: "Your goals", question: "What are you playing for?" },
  { id: "practice", title: "Practice preferences", label: "Practice", question: "How do you practise?" },
] as const;

const SECTIONS = [
  ["display_name", "handicap_index", "experience_level", "dominant_hand"],
  ["typical_score", "average_driver_distance", "swing_pattern", "common_miss"],
  ["primary_goal", "secondary_goals"],
  ["practice_days_per_week", "typical_practice_duration", "facilities", "bag"],
];

const DEFAULT_BAG = [
  "driver", "3_wood", "4_hybrid", "5_iron", "6_iron", "7_iron", "8_iron",
  "9_iron", "pw", "gw", "sw", "putter",
];

/* Typical 18-hole score as the design's four chips, each setting a value inside its range. */
const SCORE_BANDS = [
  { label: "<80", value: 78, test: (n: number) => n < 80 },
  { label: "80-89", value: 85, test: (n: number) => n >= 80 && n < 90 },
  { label: "90-99", value: 95, test: (n: number) => n >= 90 && n < 100 },
  { label: "100+", value: 105, test: (n: number) => n >= 100 },
];

/** A single-choice group drawn as chips: olive when chosen, outlined when not. */
function ChoiceChips({
  name,
  options,
  defaultValue,
  dark = false,
  label,
}: {
  name: string;
  options: { value: string; label: string; dashed?: boolean }[];
  defaultValue: string;
  /** The chosen chip in ink rather than olive, like the design's common-miss row. */
  dark?: boolean;
  label: string;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label key={option.value} className="cursor-pointer">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => setValue(option.value)}
            className="peer sr-only"
          />
          <span
            className={cn(
              "press inline-flex h-11 items-center rounded-full px-[18px] text-[14px] font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
              value === option.value
                ? dark
                  ? "bg-ink text-white"
                  : "bg-accent text-white"
                : option.dashed
                  ? "border-[1.5px] border-dashed border-[#a9ad9f] text-fg-muted"
                  : "border-[1.5px] border-fg",
            )}
          >
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/** A multi-choice chip, such as a club in the bag. */
function CheckChip({ name, value, label, defaultChecked }: { name: string; value: string; label: string; defaultChecked: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="cursor-pointer">
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="peer sr-only"
      />
      <span
        className={cn(
          "press inline-flex h-10 items-center rounded-full px-4 text-[13px] font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
          checked ? "bg-accent text-white" : "border-[1.5px] border-fg",
        )}
      >
        {label}
      </span>
    </label>
  );
}

export function ProfileForm({
  profile,
  action,
  layout = "full",
  submitLabel = "Save profile",
}: {
  profile: PlayerProfile | null;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  layout?: "wizard" | "full";
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE);
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [handicap, setHandicap] = useState(profile?.handicap_index?.toString() ?? "");
  const [score, setScore] = useState(profile?.typical_score?.toString() ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const wizard = layout === "wizard";
  const errors = { ...clientErrors, ...(state.errors ?? {}) };

  function revealField(name: string) {
    const field = formRef.current?.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
    requestAnimationFrame(() => field?.focus());
  }

  useEffect(() => {
    const field = Object.keys(state.errors ?? {})[0];
    if (!field) return;
    const section = Math.max(0, SECTIONS.findIndex((names) => names.includes(field)));
    setStep(section);
    setOpen(section);
    revealField(field);
  }, [state.errors]);
  useEffect(() => {
    if (state.ok) setDirty(false);
  }, [state]);

  function validateName(): boolean {
    const name = formRef.current?.elements.namedItem("display_name") as HTMLInputElement | null;
    if (name?.value.trim()) {
      setClientErrors((current) => {
        const { display_name: _displayName, ...rest } = current;
        return rest;
      });
      return true;
    }
    setClientErrors((current) => ({ ...current, display_name: "Name is required" }));
    setStep(0);
    setOpen(0);
    revealField("display_name");
    return false;
  }

  const bagCount = profile?.bag.length ?? DEFAULT_BAG.length;
  const summaries = [
    profile ? `${labelize(profile.experience_level)}` : "",
    profile?.typical_score ? `Shoots ${profile.typical_score}` : "",
    profile ? GOAL_LABELS[profile.primary_goal] : "",
    profile ? `${profile.practice_days_per_week}× a week` : "",
  ];

  const sections: ReactNode[] = [
    // About you
    <div key="player" className="flex flex-col gap-4">
      <Field label="Name" error={errors.display_name}>
        <Input name="display_name" defaultValue={profile?.display_name ?? ""} required maxLength={80} placeholder="Alex Mercer" />
      </Field>
      <div className="flex flex-col gap-2">
        <GroupLabel>Handicap index</GroupLabel>
        <div className="flex gap-2">
          <Input
            name="handicap_index"
            type="number"
            step="0.1"
            min={-10}
            max={54}
            value={handicap}
            onChange={(event) => setHandicap(event.target.value)}
            placeholder="11.8"
            aria-label="Handicap index"
            className="font-display h-14 flex-[1.4] text-[24px]"
          />
          <button
            type="button"
            aria-pressed={handicap === ""}
            onClick={() => {
              setHandicap("");
              setDirty(true);
            }}
            className={cn(
              "press dsp h-14 flex-1 rounded-full px-3 text-[11px]",
              handicap === "" ? "bg-accent text-white" : "border-[1.5px] border-fg",
            )}
          >
            Don&apos;t have one
          </button>
        </div>
        {errors.handicap_index ? <span className="text-[12px] text-bad">{errors.handicap_index}</span> : null}
      </div>
      <div className="flex flex-col gap-2">
        <GroupLabel>Experience</GroupLabel>
        <ChoiceChips
          name="experience_level"
          label="Experience"
          defaultValue={profile?.experience_level ?? "intermediate"}
          options={EXPERIENCE_LEVELS.map((level) => ({ value: level, label: labelize(level) }))}
        />
      </div>
      <div className="flex flex-col gap-2">
        <GroupLabel>Handed</GroupLabel>
        <ChoiceChips
          name="dominant_hand"
          label="Handed"
          defaultValue={profile?.dominant_hand ?? "right"}
          options={DOMINANT_HANDS.map((hand) => ({ value: hand, label: `${labelize(hand)}-handed` }))}
        />
      </div>
    </div>,
    // Your golf game
    <div key="game" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <GroupLabel>Typical 18-hole score</GroupLabel>
        <div role="radiogroup" aria-label="Typical score" className="grid grid-cols-4 gap-2">
          {SCORE_BANDS.map((band) => {
            const active = score !== "" && band.test(Number(score));
            return (
              <button
                key={band.label}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setScore(String(band.value));
                  setDirty(true);
                }}
                className={cn(
                  "press font-display h-12 rounded-full text-[16px]",
                  active ? "bg-accent text-white" : "border-[1.5px] border-fg",
                )}
              >
                {band.label}
              </button>
            );
          })}
        </div>
        <Input
          name="typical_score"
          type="number"
          min={50}
          max={200}
          value={score}
          onChange={(event) => setScore(event.target.value)}
          placeholder="Or type it: 85"
          aria-label="Typical score, 18 holes"
        />
        {errors.typical_score ? <span className="text-[12px] text-bad">{errors.typical_score}</span> : null}
      </div>
      <div className="flex flex-col gap-2">
        <GroupLabel>Common miss</GroupLabel>
        <ChoiceChips
          name="common_miss"
          label="Common miss"
          dark
          defaultValue={profile?.common_miss ?? ""}
          options={[
            ...MISS_DIRECTIONS.filter((miss) => miss !== "straight").map((miss) => ({ value: miss, label: labelize(miss) })),
            { value: "", label: "Not sure", dashed: true },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <GroupLabel>Typical ball flight</GroupLabel>
        <ChoiceChips
          name="swing_pattern"
          label="Typical ball flight"
          defaultValue={profile?.swing_pattern ?? "unknown"}
          options={SWING_PATTERNS.map((pattern) => ({ value: pattern, label: pattern === "unknown" ? "Not sure" : labelize(pattern), dashed: pattern === "unknown" }))}
        />
      </div>
      <Field label="Average driver distance (yd)" error={errors.average_driver_distance}>
        <Input name="average_driver_distance" type="number" min={80} max={400} defaultValue={profile?.average_driver_distance ?? ""} placeholder="250" />
      </Field>
    </div>,
    // Goals
    <div key="goals" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <GroupLabel>Primary goal</GroupLabel>
        <ChoiceChips
          name="primary_goal"
          label="Primary goal"
          defaultValue={profile?.primary_goal ?? "lower_handicap"}
          options={GOALS.map((goal) => ({ value: goal, label: GOAL_LABELS[goal] }))}
        />
        {errors.primary_goal ? <span className="text-[12px] text-bad">{errors.primary_goal}</span> : null}
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">Also working on (up to 4)</legend>
        <div className="flex flex-wrap gap-2">
          {GOALS.map((goal) => (
            <CheckChip key={goal} name="secondary_goals" value={goal} label={GOAL_LABELS[goal]} defaultChecked={profile?.secondary_goals.includes(goal) ?? false} />
          ))}
        </div>
        {errors.secondary_goals ? <p role="alert" className="text-[12px] text-bad">{errors.secondary_goals}</p> : null}
      </fieldset>
    </div>,
    // Practice preferences
    <div key="practice" className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Days a week" error={errors.practice_days_per_week}>
          <Input name="practice_days_per_week" type="number" min={0} max={7} defaultValue={profile?.practice_days_per_week ?? 3} required />
        </Field>
        <Field label="Session (min)" error={errors.typical_practice_duration}>
          <Input name="typical_practice_duration" type="number" min={10} max={240} step={5} defaultValue={profile?.typical_practice_duration ?? 45} required />
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">What do you have access to?</legend>
        <div className="flex flex-wrap gap-2">
          {PRACTICE_FACILITIES.map((facility) => (
            <CheckChip key={facility} name="facilities" value={facility} label={labelize(facility)} defaultChecked={profile?.facilities.includes(facility) ?? facility === "range"} />
          ))}
        </div>
        {errors.facilities ? <p role="alert" className="text-[12px] text-bad">{errors.facilities}</p> : null}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="dsp pb-2 text-[12px] tracking-[0.1em] text-fg-muted">What&apos;s in the bag?</legend>
        <div className="flex flex-wrap gap-2">
          {CLUBS.map((club) => (
            <CheckChip key={club} name="bag" value={club} label={CLUB_LABELS[club]} defaultChecked={profile ? profile.bag.includes(club) : DEFAULT_BAG.includes(club)} />
          ))}
        </div>
        {errors.bag ? <p role="alert" className="text-[12px] text-bad">{errors.bag}</p> : null}
      </fieldset>
    </div>,
  ];

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      noValidate
      onChange={() => setDirty(true)}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !validateName()) return;
        // Dispatch manually so a validation failure does not trigger React's
        // automatic reset of uncontrolled form fields.
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {wizard ? (
        <>
          <div className="flex gap-1.5" aria-label={`Setup progress, step ${step + 1} of ${STEPS.length}`} role="img">
            {STEPS.map((item, index) => (
              <span key={item.id} className={cn("h-1.5 flex-1 rounded-full", index <= step ? "bg-accent" : "bg-track")} />
            ))}
          </div>
          <p className="dsp text-[12px] tracking-[0.1em] text-fg-muted">
            Step {step + 1} of {STEPS.length} · {STEPS[step]!.label}
          </p>
          <h1 className="dsp text-[46px] leading-[0.98]">{STEPS[step]!.question}</h1>
          {sections.map((section, index) => (
            <fieldset key={index} hidden={index !== step} disabled={pending} className="min-w-0 border-0 p-0">
              {section}
            </fieldset>
          ))}
          {state.message ? (
            <p role="status" className={cn("rounded-2xl px-3.5 py-2.5 text-[13px]", state.ok ? "bg-good-soft text-accent-strong" : "bg-bad-soft text-bad")}>
              {state.message}
            </p>
          ) : null}
          <ActionBar>
            {step > 0 ? (
              <Button type="button" variant="secondary" className={cn(barButton, "bg-bg")} onClick={() => setStep((s) => s - 1)}>
                Back
              </Button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                className={cn(barButton, step > 0 && "flex-[1.3]")}
                onClick={() => {
                  if (step === 0 && !validateName()) return;
                  setStep((s) => s + 1);
                  window.scrollTo({ top: 0 });
                }}
              >
                Continue
              </Button>
            ) : (
              <Button type="submit" className={cn(barButton, "flex-[1.3]")} disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitLabel}
              </Button>
            )}
          </ActionBar>
        </>
      ) : (
        <>
          <ul aria-label="Profile settings" className="overflow-hidden rounded-[22px] bg-surface">
            {STEPS.map((item, index) => (
              <li key={item.id} className="border-b border-border last:border-0">
                <details
                  open={open === index}
                  onToggle={(event) => {
                    const isOpen = (event.currentTarget as HTMLDetailsElement).open;
                    setOpen((current) => (isOpen ? index : current === index ? null : current));
                  }}
                  className="group"
                >
                  <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4">
                    <span className="text-[16px] font-semibold">{item.title}</span>
                    <span className="flex items-center gap-2 text-[13px] font-semibold text-fg-subtle">
                      {summaries[index]}
                      <ChevronRight className="h-[18px] w-[18px] transition-transform group-open:rotate-90" />
                    </span>
                  </summary>
                  <fieldset disabled={pending} className="min-w-0 border-0 px-4 pb-5 pt-1">
                    {sections[index]}
                  </fieldset>
                </details>
              </li>
            ))}
            <li className="flex min-h-[52px] items-center justify-between gap-3 px-4">
              <span className="text-[16px] font-semibold">What&apos;s in the bag</span>
              <button type="button" onClick={() => setOpen(3)} className="flex items-center gap-2 text-[13px] font-semibold text-fg-subtle">
                {bagCount} clubs <ChevronRight className="h-[18px] w-[18px]" />
              </button>
            </li>
          </ul>
          {state.message && (!state.ok || !dirty) ? (
            <p role="status" className={cn("text-[13px]", state.ok ? "text-accent-strong" : "text-bad")}>
              {state.message}
            </p>
          ) : null}
          {dirty || pending ? (
            <div className="fixed inset-x-5 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-40 md:static md:inset-auto">
              <Button type="submit" className="h-14 w-full text-[13px] shadow-[var(--shadow-raised)] md:w-auto md:shadow-none" disabled={pending}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {pending ? "Saving…" : submitLabel}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </form>
  );
}
