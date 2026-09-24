import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthForm } from "@/components/auth/auth-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";
import { mode } from "@/lib/db/repo";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (mode() === "setup") redirect("/setup");
  if (mode() === "demo") redirect("/practice");
  const search = await searchParams;
  const initialError = search.error === "auth"
    ? "That sign-in link is invalid or has expired. Please try again."
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sign in</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AuthForm mode="login" initialError={initialError} />
        <p className="text-center text-xs text-fg-muted">
          No account yet?{" "}
          <Link href="/signup" className="text-accent hover:underline">
            Create one
          </Link>
        </p>
        <p className="text-center text-xs text-fg-muted">
          <Link href="/reset" className="text-accent hover:underline">
            Forgot your password?
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
