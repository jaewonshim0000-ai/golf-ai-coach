import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { completeOnboardingAction } from "@/app/actions";
import { ProfileForm } from "@/components/forms/profile-form";
import * as repo from "@/lib/db/repo";

export const metadata: Metadata = { title: "Set up your profile" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await repo.currentUser();
  if (!user) redirect("/login");

  const profile = await repo.getProfile(user.id);
  if (profile) redirect("/practice");

  return (
    <div className="hero-grid min-h-svh px-5 pb-32 pt-[max(1.75rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-xl">
        <ProfileForm profile={null} action={completeOnboardingAction} layout="wizard" submitLabel="Finish setup" />
      </div>
    </div>
  );
}
