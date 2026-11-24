import { redirect } from "next/navigation";

import AuthLayout from "./(auth)/layout";
import { DesktopLanding } from "@/components/landing/desktop-landing";
import { MobileLanding } from "@/components/landing/mobile-landing";
import * as repo from "@/lib/db/repo";

/**
 * Signed-in players (and demo and setup deployments) go straight to Practice,
 * as before. Signed-out visitors get a landing page: the 3D green on desktop,
 * and below the `md` breakpoint the same words on the sign-in screen's hero
 * and sheet. The split is CSS, not user-agent sniffing.
 */
export default async function Home() {
  if (repo.mode() !== "supabase" || (await repo.currentUser())) redirect("/practice");

  return (
    <>
      <div className="md:hidden">
        <AuthLayout>
          <MobileLanding />
        </AuthLayout>
      </div>
      <DesktopLanding />
    </>
  );
}
