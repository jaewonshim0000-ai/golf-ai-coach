import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { mode } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  if (mode() === "demo") redirect("/dashboard");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sign in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuthForm mode="login" />
        <p className="text-center text-xs text-fg-muted">
          No account yet?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
