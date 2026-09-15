"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Trash2, Video } from "lucide-react";

import { addSwingFindingAction, createSwingSessionAction, deleteSwingFindingAction } from "@/app/actions";
import { IDLE } from "@/lib/action-state";
import type { Drill, SwingSession } from "@/types/practice";
import { CERTAINTY_LEVELS, SKILLS, SWING_CATEGORIES } from "@/types/practice";
import { CLUBS, CLUB_LABELS, SWING_PATTERNS, labelize } from "@/types/golf";
import { cn } from "@/lib/utils";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui/primitives";

const ANGLES = ["down_the_line", "face_on", "rear", "overhead"] as const;

export function NewSwingSessionForm() {
  const [state, formAction, pending] = useActionState(createSwingSessionAction, IDLE);
  const [open, setOpen] = useState(false);
  const errors = state.errors ?? {};

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <Video className="h-4 w-4" /> Add a swing
      </Button>
    );
  }

  return (
    <form action={formAction}>
      <Card>
        <CardHeader>
          <CardTitle>New swing session</CardTitle>
          <p className="mt-0.5 text-xs text-fg-muted">
            Video is optional and stored as a link. No automated analysis runs yet, so the findings
            you record are the honest input to the coaching engine.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Club" error={errors.club}>
            <Select name="club" defaultValue="7_iron">
              {CLUBS.map((club) => (
                <option key={club} value={club}>
                  {CLUB_LABELS[club]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Camera angle" error={errors.camera_angle}>
            <Select name="camera_angle" defaultValue="down_the_line">
              {ANGLES.map((angle) => (
                <option key={angle} value={angle}>
                  {labelize(angle)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Shot type" error={errors.shot_type}>
            <Input name="shot_type" defaultValue="full swing" maxLength={40} required />
          </Field>
          <Field label="Ball flight" error={errors.swing_pattern}>
            <Select name="swing_pattern" defaultValue="unknown">
              {SWING_PATTERNS.map((pattern) => (
                <option key={pattern} value={pattern}>
                  {labelize(pattern)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Video URL" hint="Optional" className="sm:col-span-2" error={errors.video_url}>
            <Input name="video_url" type="url" placeholder="https://..." />
          </Field>
          <Field label="Notes" className="sm:col-span-2" error={errors.notes}>
            <Textarea name="notes" rows={2} maxLength={1000} placeholder="How did it feel?" />
          </Field>

          {state.message ? (
            <p
              className={cn(
                "rounded-lg px-3 py-2 text-sm sm:col-span-2",
                state.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad",
              )}
            >
              {state.message}
            </p>
          ) : null}

          <div className="flex gap-2 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save swing
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

export function AddFindingForm({
  session,
  drills,
}: {
  session: SwingSession;
  drills: Drill[];
}) {
  const [state, formAction, pending] = useActionState(addSwingFindingAction, IDLE);
  const [open, setOpen] = useState(false);
  const errors = state.errors ?? {};

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" /> Record a finding
      </Button>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border border-border bg-surface-2 p-4">
      <input type="hidden" name="swing_session_id" value={session.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Area" error={errors.category}>
          <Select name="category" defaultValue="transition">
            {SWING_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {labelize(category)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="What you see" error={errors.issue}>
          <Input name="issue" required minLength={4} maxLength={200} placeholder="Club delivery varies" />
        </Field>
        <Field label="Severity" error={errors.severity}>
          <Select name="severity" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </Field>
        <Field label="How certain are you?" error={errors.certainty}>
          <Select name="certainty" defaultValue="possible">
            {CERTAINTY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {labelize(level)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Confidence" hint="0 to 1" error={errors.confidence}>
          <Input
            name="confidence"
            type="number"
            min={0}
            max={1}
            step={0.01}
            defaultValue={0.5}
            required
          />
        </Field>
        <Field label="Related skill" error={errors.related_skill}>
          <Select name="related_skill" defaultValue="">
            <option value="">Not sure</option>
            {SKILLS.map((skill) => (
              <option key={skill} value={skill}>
                {labelize(skill)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2" error={errors.description}>
          <Textarea name="description" rows={2} maxLength={1000} />
        </Field>
        <Field label="Why it matters" className="sm:col-span-2" error={errors.why_it_matters}>
          <Textarea name="why_it_matters" rows={2} maxLength={1000} />
        </Field>
        <Field label="Recommended drill" className="sm:col-span-2" error={errors.recommended_drill_id}>
          <Select name="recommended_drill_id" defaultValue="">
            <option value="">Let the coach choose</option>
            {drills.map((drill) => (
              <option key={drill.id} value={drill.id}>
                {drill.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {state.message ? (
        <p
          className={cn(
            "mt-3 rounded-lg px-3 py-2 text-sm",
            state.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad",
          )}
        >
          {state.message}
        </p>
      ) : null}

      <div className="mt-3 flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save finding
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </form>
  );
}

export function DeleteFindingButton({ findingId }: { findingId: string }) {
  const [, formAction, pending] = useActionState(deleteSwingFindingAction, IDLE);
  return (
    <form action={formAction}>
      <input type="hidden" name="finding_id" value={findingId} />
      <Button type="submit" variant="ghost" size="icon" disabled={pending} aria-label="Delete finding">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>
    </form>
  );
}
