import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AuthForm, AuthTabs } from "@/components/auth/auth-form";
import { ConfirmationForm } from "@/components/auth/confirmation-form";
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
    <div className="flex flex-col gap-5">
      <AuthTabs active="login" />
      <AuthForm mode="login" initialError={initialError} />
      <ConfirmationForm />
    </div>
  );
}
