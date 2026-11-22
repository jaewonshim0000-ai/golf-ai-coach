import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthForm, AuthTabs } from "@/components/auth/auth-form";
import { mode } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default function SignupPage() {
  if (mode() === "setup") redirect("/setup");
  if (mode() === "demo") redirect("/practice");

  return (
    <div className="flex flex-col gap-5">
      <AuthTabs active="signup" />
      <AuthForm mode="signup" />
      <p className="text-center text-[12.5px] text-fg-subtle">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-accent">
          Sign in
        </Link>
      </p>
    </div>
  );
}
