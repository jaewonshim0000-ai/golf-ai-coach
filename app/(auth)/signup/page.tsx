import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { mode } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Create account" };

export default function SignupPage() {
  if (mode() === "demo") redirect("/dashboard");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Create your account</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuthForm mode="signup" />
        <p className="text-center text-xs text-fg-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
