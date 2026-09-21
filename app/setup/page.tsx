import { redirect } from "next/navigation";
import { mode } from "@/lib/db/repo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (mode() !== "setup") redirect("/practice");
  return <main className="mx-auto flex min-h-svh max-w-lg items-center p-5">
    <Card>
      <CardHeader><CardTitle>Golf AI Coach is getting ready</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm text-fg-muted">
        <p>Account storage has not been connected yet. Practice, rounds, and swing uploads will be available once setup is complete.</p>
        <p>If you manage this app, follow the deployment steps in the project README to connect the database and private video storage.</p>
      </CardContent>
    </Card>
  </main>;
}
