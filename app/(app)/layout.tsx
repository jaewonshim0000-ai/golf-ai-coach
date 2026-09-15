import { redirect } from "next/navigation";

import { MobileHeader, MobileNav, Sidebar } from "@/components/layout/nav";
import * as repo from "@/lib/db/repo";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await repo.currentUser();
  if (!user) redirect("/login");

  const profile = await repo.getProfile(user.id);
  if (!profile) redirect("/onboarding");

  return (
    <div className="flex min-h-svh bg-bg">
      <Sidebar mode={repo.mode()} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-10 md:pt-8">
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
