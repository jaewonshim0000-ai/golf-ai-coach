import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Flag } from "lucide-react";

import { completeOnboardingAction } from "@/app/actions";
import { ProfileForm } from "@/components/forms/profile-form";
import * as repo from "@/lib/db/repo";

export const metadata: Metadata = { title: "Set up your profile" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await repo.currentUser();
  if (!user) redirect("/login");

  const profile = await repo.getProfile(user.id);
  if (profile) redirect("/dashboard");

  return (
    <div className="hero-grid min-h-svh px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <Flag className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">Let&apos;s build your player profile</h1>
          <p className="max-w-lg text-sm text-fg-muted">
            Four short steps. Everything here feeds the coaching engine, so the more accurate it is,
            the sooner the app can tell you something you didn&apos;t already know. You can change all
            of it later.
          </p>
        </header>

        <ProfileForm
          profile={null}
          action={completeOnboardingAction}
          layout="wizard"
          submitLabel="Finish setup"
        />
      </div>
    </div>
  );
}
