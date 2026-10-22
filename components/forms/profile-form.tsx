"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

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
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Progress,
  Select,
} from "@/components/ui/primitives";
import { Disclosure } from "@/components/ui/disclosure";

/**
 * One form serves onboarding (as a wizard) and the profile page (all at once).
 * Every field is always in the DOM so a single submit carries the whole profile
 * regardless of which step the user is looking at.
 */

const STEPS = [
  { id: "player", title: "About you", blurb: "The basics we need before anything else is meaningful." },
  { id: "game", title: "Your golf game", blurb: "How the ball actually behaves when you hit it." },
  { id: "goals", title: "Goals", blurb: "What we are optimising for." },
  { id: "practice", title: "Practice", blurb: "What you realistically have time and access for." },
] as const;

const DEFAULT_BAG = [
  "driver", "3_wood", "4_hybrid", "5_iron", "6_iron", "7_iron", "8_iron",
  "9_iron", "pw", "gw", "sw", "putter",
];

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
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState({
    handicap: profile?.handicap_index?.toString() ?? "", hand: profile?.dominant_hand ?? "right",
    score: profile?.typical_score?.toString() ?? "", distance: profile?.average_driver_distance?.toString() ?? "",
    goal: profile?.primary_goal ?? "lower_handicap", days: String(profile?.practice_days_per_week ?? 3),
    duration: String(profile?.typical_practice_duration ?? 45),
    clubs: profile?.bag.length ?? DEFAULT_BAG.length, secondary: profile?.secondary_goals.length ?? 0,
  });
  const formRef = useRef<HTMLFormElement>(null);
  const wizard = layout === "wizard";
  const visible = (index: number) => !wizard || index === step;
  const errors = { ...clientErrors, ...(state.errors ?? {}) };
  const summaries = [
    `${draft.handicap ? `Handicap ${draft.handicap}` : "Add your handicap"} · ${labelize(draft.hand)}-handed`,
    [draft.score ? `Typical score ${draft.score}` : "Your scores", draft.distance ? `Driver ${draft.distance} yd` : "ball flight and distance"].join(" · "),
    GOAL_LABELS[draft.goal],
    `${draft.days} days a week · ${draft.duration} min · ${draft.clubs} clubs`,
  ];

  function revealField(name: string) {
    const field = formRef.current?.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
    let details = field?.closest("details");
    while (details && formRef.current?.contains(details)) {
      details.open = true;
      details = details.parentElement?.closest("details") ?? null;
    }
    requestAnimationFrame(() => field?.focus());
  }

  useEffect(() => {
    const field = Object.keys(state.errors ?? {})[0];
    if (!field) return;
    const sections = [["display_name", "handicap_index", "experience_level", "dominant_hand"],
      ["typical_score", "average_driver_distance", "swing_pattern", "common_miss"], ["primary_goal", "secondary_goals"],
      ["practice_days_per_week", "typical_practice_duration", "facilities", "bag"]];
    setStep(Math.max(0, sections.findIndex((names) => names.includes(field))));
    revealField(field);
  }, [state.errors]);
  useEffect(() => { if (state.ok) setDirty(false); }, [state]);

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
    revealField("display_name");
    return false;
  }

  return (
    <form
      ref={formRef}
      className={wizard ? "space-y-5" : "space-y-3"}
      noValidate
      onChange={() => {
        setDirty(true);
        const data = new FormData(formRef.current!);
        setDraft({ handicap: String(data.get("handicap_index") ?? ""), hand: String(data.get("dominant_hand")) as typeof draft.hand,
          score: String(data.get("typical_score") ?? ""), distance: String(data.get("average_driver_distance") ?? ""),
          goal: String(data.get("primary_goal")) as typeof draft.goal, days: String(data.get("practice_days_per_week")),
          duration: String(data.get("typical_practice_duration")), clubs: data.getAll("bag").length, secondary: data.getAll("secondary_goals").length });
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || !validateName()) return;
        // Dispatch manually so a validation failure does not trigger React's
        // automatic reset of uncontrolled form fields.
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {!wizard ? <Card className="sticky top-3 z-20">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><CardTitle>Profile settings</CardTitle><p className="mt-1 text-[12px] text-fg-muted">{pending ? "Saving your changes…" : dirty ? "You have unsaved changes." : "Open a section to update your details."}</p></div>
          <Button type="submit" size="sm" disabled={pending || (!dirty && Boolean(profile))}>{pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{pending ? "Saving…" : submitLabel}</Button>
        </CardContent>
        {state.message && (!state.ok || !dirty) ? <p role="status" className={cn("px-4 pb-3 text-[12px]", state.ok ? "text-good" : "text-bad")}>{state.message}</p> : null}
      </Card> : null}
      {wizard ? (
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <p className="dsp text-[10px] font-medium tracking-[0.17em] text-fg-subtle">
              Step {step + 1} of {STEPS.length}
            </p>
            <p className="text-xs text-fg-muted">{STEPS[step]!.blurb}</p>
          </div>
          <Progress value={(step + 1) / STEPS.length} label="Onboarding progress" />
        </div>
      ) : null}

      <ProfileSection index={0} title={STEPS[0]!.title} description={summaries[0]} wizard={wizard} hidden={!visible(0)} disabled={pending}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.display_name}>
            <Input
              name="display_name"
              defaultValue={profile?.display_name ?? ""}
              required
              maxLength={80}
              placeholder="Alex Mercer"
            />
          </Field>
          <Field label="Handicap index" hint="Leave blank if you don't have one" error={errors.handicap_index}>
            <Input
              name="handicap_index"
              type="number"
              step="0.1"
              min={-10}
              max={54}
              defaultValue={profile?.handicap_index ?? ""}
              placeholder="11.8"
            />
          </Field>
          <Field label="Experience" error={errors.experience_level}>
            <Select name="experience_level" defaultValue={profile?.experience_level ?? "intermediate"}>
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {labelize(level)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Handed" error={errors.dominant_hand}>
            <Select name="dominant_hand" defaultValue={profile?.dominant_hand ?? "right"}>
              {DOMINANT_HANDS.map((hand) => (
                <option key={hand} value={hand}>
                  {labelize(hand)}-handed
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </ProfileSection>

      <ProfileSection index={1} title={STEPS[1]!.title} description={summaries[1]} wizard={wizard} hidden={!visible(1)} disabled={pending}>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Typical score" hint="18 holes" error={errors.typical_score}>
            <Input
              name="typical_score"
              type="number"
              min={50}
              max={200}
              defaultValue={profile?.typical_score ?? ""}
              placeholder="85"
            />
          </Field>
          <Field label="Average driver distance" hint="Total, in yards" error={errors.average_driver_distance}>
            <Input
              name="average_driver_distance"
              type="number"
              min={80}
              max={400}
              defaultValue={profile?.average_driver_distance ?? ""}
              placeholder="250"
            />
          </Field>
          <Field label="Typical ball flight" error={errors.swing_pattern}>
            <Select name="swing_pattern" defaultValue={profile?.swing_pattern ?? "unknown"}>
              {SWING_PATTERNS.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {labelize(pattern)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Common miss" error={errors.common_miss}>
            <Select name="common_miss" defaultValue={profile?.common_miss ?? ""}>
              <option value="">Not sure</option>
              {MISS_DIRECTIONS.map((miss) => (
                <option key={miss} value={miss}>
                  {labelize(miss)}
                </option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </ProfileSection>

      <ProfileSection index={2} title={STEPS[2]!.title} description={summaries[2]} wizard={wizard} hidden={!visible(2)} disabled={pending}>
        <CardContent className="space-y-4">
          <Field label="Primary goal" error={errors.primary_goal}>
            <Select name="primary_goal" defaultValue={profile?.primary_goal ?? "lower_handicap"}>
              {GOALS.map((goal) => (
                <option key={goal} value={goal}>
                  {GOAL_LABELS[goal]}
                </option>
              ))}
            </Select>
          </Field>
          <details open={wizard}>
          <summary className="min-h-10 cursor-pointer py-2 text-xs font-medium text-accent">Secondary goals ({draft.secondary})</summary>
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-fg-muted">
              Secondary goals (up to 4)
            </legend>
            <div className="flex flex-wrap gap-2">
              {GOALS.map((goal) => (
                <CheckChip
                  key={goal}
                  name="secondary_goals"
                  value={goal}
                  label={GOAL_LABELS[goal]}
                  defaultChecked={profile?.secondary_goals.includes(goal) ?? false}
                />
              ))}
            </div>
          </fieldset>
          {errors.secondary_goals ? <p role="alert" className="mt-2 text-xs text-bad">{errors.secondary_goals}</p> : null}
          </details>
        </CardContent>
      </ProfileSection>

      <ProfileSection index={3} title="Practice preferences" description={summaries[3]} wizard={wizard} hidden={!visible(3)} disabled={pending}>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Practice days per week" error={errors.practice_days_per_week}>
              <Input
                name="practice_days_per_week"
                type="number"
                min={0}
                max={7}
                defaultValue={profile?.practice_days_per_week ?? 3}
                required
              />
            </Field>
            <Field label="Typical session length" hint="Minutes" error={errors.typical_practice_duration}>
              <Input
                name="typical_practice_duration"
                type="number"
                min={10}
                max={240}
                step={5}
                defaultValue={profile?.typical_practice_duration ?? 45}
                required
              />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-2 text-xs font-medium text-fg-muted">What do you have access to?</legend>
            <div className="flex flex-wrap gap-2">
              {PRACTICE_FACILITIES.map((facility) => (
                <CheckChip
                  key={facility}
                  name="facilities"
                  value={facility}
                  label={labelize(facility)}
                  defaultChecked={profile?.facilities.includes(facility) ?? facility === "range"}
                />
              ))}
            </div>
          </fieldset>

          {errors.facilities ? <p role="alert" className="text-xs text-bad">{errors.facilities}</p> : null}
          <details open={wizard}>
          <summary className="min-h-10 cursor-pointer py-2 text-xs font-medium text-accent">Your clubs ({draft.clubs})</summary>
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-fg-muted">What&apos;s in the bag?</legend>
            <div className="flex flex-wrap gap-2">
              {CLUBS.map((club) => (
                <CheckChip
                  key={club}
                  name="bag"
                  value={club}
                  label={CLUB_LABELS[club]}
                  defaultChecked={profile ? profile.bag.includes(club) : DEFAULT_BAG.includes(club)}
                />
              ))}
            </div>
          </fieldset>
          {errors.bag ? <p role="alert" className="mt-2 text-xs text-bad">{errors.bag}</p> : null}
          </details>
        </CardContent>
      </ProfileSection>

      {wizard && state.message ? (
        <p
          role="status"
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            state.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad",
          )}
        >
          {state.message}
        </p>
      ) : null}

      {wizard ? <div className="flex items-center justify-between gap-3">
        {wizard && step > 0 ? (
          <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        ) : (
          <span />
        )}

        {wizard && step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={() => {
              if (step === 0 && !validateName()) return;
              setStep((s) => s + 1);
            }}
          >
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {submitLabel}
          </Button>
        )}
      </div> : null}
    </form>
  );
}

function ProfileSection({ index, title, description, wizard, hidden, disabled, children }: {
  index: number; title: string; description?: string; wizard: boolean; hidden: boolean; disabled: boolean; children: ReactNode;
}) {
  const fields = <fieldset disabled={disabled} className="min-w-0 border-0 p-0">{children}</fieldset>;
  return wizard ? <Card hidden={hidden}><CardHeader><CardTitle>{title}</CardTitle></CardHeader>{fields}</Card>
    : <Disclosure title={title} description={description} data-profile-step={index} className="[&>div]:px-0 [&>div]:pb-0">{fields}</Disclosure>;
}

function CheckChip({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked: boolean;
}) {
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
      <Badge
        tone={checked ? "accent" : "neutral"}
        className="px-3 py-1 text-xs peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent"
      >
        {label}
      </Badge>
    </label>
  );
}
