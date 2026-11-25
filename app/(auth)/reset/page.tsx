import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ResetForm } from "@/components/auth/reset-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { mode } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default function ResetPage() {
  if (mode() === "setup") redirect("/setup");
  if (mode() === "demo") redirect("/practice");

  return (
    <AuthShell hero={{ kind: "logo" }}>
      <div className="flex flex-col gap-4">
        <h1 className="dsp text-[30px] leading-none">Reset your password</h1>
        <div className="flex flex-col gap-4">
          <p className="text-xs leading-relaxed text-fg-muted">
            We will email you a link. Open it on this device and you can set a new password.
          </p>
          <ResetForm mode="request" />
          <p className="text-center text-xs text-fg-muted">
            <Link href="/login" className="text-accent hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </AuthShell>
  );
}
