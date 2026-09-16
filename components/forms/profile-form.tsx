"use client";

import { useActionState, useState } from "react";
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
  const wizard = layout === "wizard";
  const visible = (index: number) => !wizard || index === step;
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-5">
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

      <Card hidden={!visible(0)}>
        <CardHeader>
          <CardTitle>{STEPS[0]!.title}</CardTitle>
        </CardHeader>
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
      </Card>

      <Card hidden={!visible(1)}>
        <CardHeader>
          <CardTitle>{STEPS[1]!.title}</CardTitle>
        </CardHeader>
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
      </Card>

      <Card hidden={!visible(2)}>
        <CardHeader>
          <CardTitle>{STEPS[2]!.title}</CardTitle>
        </CardHeader>
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
        </CardContent>
      </Card>

      <Card hidden={!visible(3)}>
        <CardHeader>
          <CardTitle>{STEPS[3]!.title}</CardTitle>
        </CardHeader>
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
        </CardContent>
      </Card>

      {state.message ? (
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

      <div className="flex items-center justify-between gap-3">
        {wizard && step > 0 ? (
          <Button type="button" variant="secondary" onClick={() => setStep((s) => s - 1)}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        ) : (
          <span />
        )}

        {wizard && step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {submitLabel}
          </Button>
        )}
      </div>
    </form>
  );
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
