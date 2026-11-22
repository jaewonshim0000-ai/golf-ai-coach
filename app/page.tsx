import { redirect } from "next/navigation";

import AuthLayout from "./(auth)/layout";
import LoginPage from "./(auth)/login/page";
import { DesktopLanding } from "@/components/landing/desktop-landing";
import * as repo from "@/lib/db/repo";

/**
 * Signed-in players (and demo and setup deployments) go straight to Practice,
 * as before. Signed-out visitors get the landing page on desktop; below the
 * `md` breakpoint they keep the sign-in screen they were redirected to before.
 * The split is CSS, not user-agent sniffing.
 */
export default async function Home() {
  if (repo.mode() !== "supabase" || (await repo.currentUser())) redirect("/practice");

  return (
    <>
      <div className="md:hidden">
        <AuthLayout>
          <LoginPage searchParams={Promise.resolve({})} />
        </AuthLayout>
      </div>
      <DesktopLanding />
    </>
  );
}
