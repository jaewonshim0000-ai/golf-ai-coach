import type { Metadata } from "next";
import Link from "next/link";
import { AddSwing } from "@/components/swing/add-swing";
import { ButtonLink, Card, CardContent, EmptyState, PageHero } from "@/components/ui/primitives";
import { CLUB_LABELS, labelize } from "@/types/golf";
import * as repo from "@/lib/db/repo";

export const metadata: Metadata = { title: "Swing references" };
export const dynamic = "force-dynamic";

export default async function SwingReferencesPage() {
  const user = await repo.currentUser();
  if (!user) return null;
  const [references, sessions] = await Promise.all([repo.getSwingReferences(user.id), repo.getSwingSessions(user.id)]);
  const existing = sessions.filter((session) => !references.some((ref) => ref.session.id === session.id));
  return <div className="space-y-5">
    <PageHero art="dusk" size="sm" className="mb-0" eyebrow="Swing comparison" title="Reference library" action={<AddSwing reference />}
      topLeft={<ButtonLink href="/swing" variant="onHero" size="sm">Back to swings</ButtonLink>} />
    <p className="text-[13px] leading-relaxed text-fg-muted">Add a professional or coach swing you can use, filmed face on or down the line. We match references by club, camera view and setup proportions, then synchronize setup, top and contact. Your reference videos stay private to your account.</p>
    {references.length ? <div className="grid gap-3 sm:grid-cols-2">{references.map(({ session, metadata }) => <Card key={session.id}><CardContent className="space-y-2 pt-5">
      <h2 className="text-[16px] font-semibold">{metadata.name}</h2>
      <p className="text-[12px] text-fg-muted">{labelize(metadata.kind)} · {CLUB_LABELS[session.club]} · {labelize(session.camera_angle)} · {metadata.handedness} handed</p>
      {metadata.source ? <p className="break-words text-[11px] text-fg-subtle">Credit: {metadata.source}</p> : null}
      <ButtonLink href={`/swing/${session.id}?reference=new`} variant="secondary" size="sm">Review or edit reference</ButtonLink>
    </CardContent></Card>)}</div> : <EmptyState title="Add your first reference" message="Upload one professional or coach clip, let the app review it, then save the golfer’s name. Matching user swings can use it automatically." />}
    {existing.length ? <details className="rounded-2xl border border-border bg-surface p-5"><summary className="min-h-9 cursor-pointer text-[14px] font-semibold">Use a saved recording</summary>
      <ul className="mt-3 space-y-2">{existing.map((session) => <li key={session.id}><Link className="inline-block min-h-9 text-[13px] text-accent" href={`/swing/${session.id}?reference=new`}>{CLUB_LABELS[session.club]} · {labelize(session.camera_angle)} · {session.created_at.slice(0, 10)}</Link></li>)}</ul>
    </details> : null}
  </div>;
}
