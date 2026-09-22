import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ResetForm } from "@/components/auth/reset-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Choose a new password</CardTitle>
      </CardHeader>
      <CardContent>
        <ResetForm mode="confirm" />
      </CardContent>
    </Card>
  );
}
