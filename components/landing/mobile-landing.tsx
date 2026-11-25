import Link from "next/link";

import { ActionBar, ButtonLink, StatCircle, barButton } from "@/components/ui/primitives";

import { CHAPTERS } from "./copy";

/**
 * The signed-out home on phones, on the sign-in screen's hero and sheet: what
 * the app does in three cards, then Get started or Sign in pinned to the
 * bottom. Same words as the desktop page, from ./copy.
 */
export function MobileLanding() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5">
        <h1 className="dsp text-[34px] leading-[0.98]">Know what to work on next</h1>
        <p className="text-[15px] leading-relaxed text-fg-muted">
          Golf AI Coach reads your swing videos, practice tests and rounds, and tells you the one thing to fix first.
        </p>
      </div>

      {CHAPTERS.map(({ num, kicker, title, em, lede, stats }) => (
        <section key={num} aria-labelledby={`chapter-${num}`} className="flex flex-col gap-3 rounded-[28px] bg-surface-2 p-5">
          <p className="dsp text-[11px] tracking-[0.1em] text-accent">
            {num} · {kicker}
          </p>
          <h2 id={`chapter-${num}`} className="dsp text-[26px] leading-none">
            {title} <span className="text-accent">{em}</span>
          </h2>
          <p className="text-[14px] leading-relaxed text-fg-muted">{lede}</p>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {stats.map(([value, label]) => (
              <StatCircle key={label} value={value} label={label} tone="white" size={64} />
            ))}
          </div>
        </section>
      ))}

      <Link href="/pricing" className="self-center text-[14px] font-semibold text-accent underline underline-offset-2">
        Free to start. See plans and pricing
      </Link>

      <ActionBar className="[--bar-fade:var(--c-surface)]">
        <ButtonLink href="/login" variant="secondary" className={barButton}>
          Sign in
        </ButtonLink>
        <ButtonLink href="/signup" className={barButton}>
          Get started
        </ButtonLink>
      </ActionBar>
    </div>
  );
}
