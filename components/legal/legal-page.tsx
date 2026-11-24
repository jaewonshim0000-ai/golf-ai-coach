import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { RoundButton, ScreenTitle, TopBar } from "@/components/ui/primitives";
import { LEGAL } from "@/lib/legal";

/** A readable page of legal text: back button, title, the draft notice, then sections. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col gap-5 bg-bg px-5 pb-16 pt-4">
      <TopBar
        left={
          <RoundButton href="/" label="Back">
            <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </RoundButton>
        }
      />
      <ScreenTitle className="leading-none">{title}</ScreenTitle>
      <p className="text-[13px] text-fg-muted">
        {LEGAL.company} · Last updated {LEGAL.updated}
      </p>
      {LEGAL.draft ? (
        <p role="note" className="rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13px] font-semibold text-warn">
          Draft for review. This text has not yet been checked by a lawyer.
        </p>
      ) : null}
      <div className="flex flex-col gap-6 text-[15px] leading-relaxed [&_a]:font-semibold [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        {children}
      </div>
      <p className="border-t border-border pt-4 text-[13px] text-fg-muted">
        Questions? Write to <a href={`mailto:${LEGAL.contact}`}>{LEGAL.contact}</a>. See also the{" "}
        <Link href="/privacy" className="font-semibold text-accent underline underline-offset-2">Privacy policy</Link> and the{" "}
        <Link href="/terms" className="font-semibold text-accent underline underline-offset-2">Terms of service</Link>.
      </p>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="dsp text-[22px] leading-none">{title}</h2>
      {children}
    </section>
  );
}
