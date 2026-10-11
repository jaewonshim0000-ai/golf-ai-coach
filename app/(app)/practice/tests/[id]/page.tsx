import { notFound } from "next/navigation";
import { TestSetup } from "@/components/practice/test-setup";
import { ButtonLink, PageHero } from "@/components/ui/primitives";
import { practiceTest } from "@/lib/practice/tests";

export default async function PracticeTestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const test = practiceTest(id);
  if (!test) notFound();
  return (
    <div className="space-y-5">
      <PageHero art="range" size="sm" eyebrow={`${test.group} · ${test.focus}`} title={test.name} description={test.scoring}
        topLeft={<ButtonLink href="/practice/drills" variant="onHero" size="sm">All tests</ButtonLink>} />
      <TestSetup test={test} />
    </div>
  );
}
