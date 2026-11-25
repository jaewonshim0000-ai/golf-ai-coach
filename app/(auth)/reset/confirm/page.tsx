import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ResetForm } from "@/components/auth/reset-form";
import { AuthShell } from "@/components/auth/auth-shell";
import { mode } from "@/lib/db/repo";

export const metadata: Metadata = { title: "New password" };
export const dynamic = "force-dynamic";

/**
 * Where the emailed link lands. The recovery session is already in the cookie
 * by the time this renders, because /auth/callback exchanged the code for it.
 */
export default function ResetConfirmPage() {
  if (mode() === "setup") redirect("/setup");
  if (mode() === "demo") redirect("/practice");

  return (
    <AuthShell hero={{ kind: "logo" }}>
      <div className="flex flex-col gap-4">
        <h1 className="dsp text-[30px] leading-none">Choose a new password</h1>
        <ResetForm mode="confirm" />
      </div>
    </AuthShell>
  );
}
