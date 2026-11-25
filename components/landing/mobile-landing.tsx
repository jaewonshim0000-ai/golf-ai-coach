import Link from "next/link";

import { ActionBar, ButtonLink, barButton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

import { CHAPTERS } from "./copy";

/**
 * The signed-out home on phones, on the fairway and the white sheet: what the
 * app does in three cards, the first on ink, then Sign in or Get started
 * pinned to the bottom. Same words as the desktop page, from ./copy.
 */
export function MobileLanding() {
  return (
    <div className="flex flex-col gap-3.5 pt-0.5">
      <div className="flex flex-col gap-2.5">
        <h1 className="dsp text-[40px] leading-[0.98]">
          Know what to
          <br />
          work on <span className="text-accent">next</span>
        </h1>
        <p className="text-[15px] leading-normal text-fg-muted">
          Golf AI Coach reads your swing videos, practice tests and rounds, and tells you the one thing to fix first.
        </p>
      </div>

      {CHAPTERS.map(({ num, kicker, title, em, lede, stats }, index) => {
        const ink = index === 0;
        return (
          <section
            key={num}
            aria-labelledby={`chapter-${num}`}
            className={cn("flex flex-col gap-2.5 rounded-[28px] p-[18px]", ink ? "bg-ink text-white" : "bg-surface-2")}
          >
            <p className={cn("text-[11px] font-bold uppercase tracking-[0.12em]", ink ? "text-gold" : "text-accent")}>
              {num} · {kicker}
            </p>
            <h2 id={`chapter-${num}`} className="dsp text-[28px] leading-none">
              {title} <span className={ink ? "text-[#a6c266]" : "text-accent"}>{em}</span>
            </h2>
            <p className={cn("text-[13.5px] leading-normal", ink ? "text-[#c9ccbf]" : "text-fg-muted")}>{lede}</p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {stats.map(([value, label], at) => (
                <span key={label} className="flex flex-col items-center gap-1.5">
                  <span
                    className={cn(
                      "font-display tabular flex h-[62px] w-[62px] items-center justify-center rounded-full leading-none",
                      value.length > 3 ? "text-[18px]" : "text-[22px]",
                      ink && at === 0 ? "bg-accent text-white" : "bg-white text-[#1e211b]",
                    )}
                  >
                    {value}
                  </span>
                  <span className={cn("text-center text-[11px] font-semibold", ink ? "text-[#c9ccbf]" : "text-fg-muted")}>{label}</span>
                </span>
              ))}
            </div>
          </section>
        );
      })}

      <Link href="/pricing" className="self-center py-1.5 text-[14px] font-bold text-accent underline underline-offset-[3px]">
        Free to start. See plans and pricing
      </Link>

      <ActionBar className="[--bar-fade:var(--c-surface)]">
        <ButtonLink href="/login" variant="secondary" className={cn(barButton, "bg-surface")}>
          Sign in
        </ButtonLink>
        <ButtonLink href="/signup" className={cn(barButton, "flex-[1.6]! shadow-[var(--shadow-accent)]")}>
          Get started free
        </ButtonLink>
      </ActionBar>
    </div>
  );
}
