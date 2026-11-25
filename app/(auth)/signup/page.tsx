import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthForm, AuthTabs } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { mode } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  if (mode() === "setup") redirect("/setup");
  if (mode() === "demo") redirect("/practice");
  const premium = (await searchParams).plan === "premium";

  return (
    <AuthShell hero={{ kind: "title", title: "Start free", back: premium ? "/pricing" : "/" }}>
      <div className="flex flex-col gap-3.5">
        <AuthTabs active="signup" />
        {premium ? (
          <p className="rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13px] leading-snug text-fg-muted">
            Create your account and set up your profile, then you can upgrade to Premium.
          </p>
        ) : null}
        <AuthForm mode="signup" wantsPremium={premium} />
        <p className="text-center text-[12.5px] text-fg-subtle">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-accent">
            Sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
