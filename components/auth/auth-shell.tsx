import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { RoundButton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/** The app's mark: a white pennant in the olive circle. */
function Mark({ size }: { size: 36 | 52 }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border-white bg-accent",
        size === 52 ? "h-[52px] w-[52px] border-[3px]" : "h-9 w-9 border-[2.5px]",
      )}
    >
      <svg width={size === 52 ? 22 : 15} height={size === 52 ? 22 : 15} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 21V3.5" />
        <path d="M6 4h11l-2.5 4L17 12H6" fill="#FFFFFF" />
      </svg>
    </span>
  );
}

type Hero =
  /** Sign in and password reset: the mark, the name and the tagline, centred. */
  | { kind: "logo" }
  /** Create account: a back button and a big title at the bottom left. */
  | { kind: "title"; title: string; back: string }
  /** The signed-out home on a phone: the name on the left, Sign in on the right. */
  | { kind: "landing" };

/**
 * The signed-out screens from the design: the fairway, then a white sheet
 * riding up over its bottom edge with the page on it.
 */
export function AuthShell({ hero, children }: { hero: Hero; children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-surface md:bg-bg">
      <div
        className={cn(
          "hero-art-green relative flex flex-col overflow-hidden px-5 text-white",
          hero.kind === "logo" && "min-h-[400px] items-center justify-center pb-14 pt-10 text-center md:min-h-[340px]",
          hero.kind === "title" && "min-h-[280px] justify-between pb-[52px] pt-5",
          hero.kind === "landing" && "min-h-[330px] pt-5",
        )}
      >
        <div className="hero-scrim absolute inset-0" aria-hidden />
        {hero.kind === "logo" ? (
          <Link href="/" className="relative flex flex-col items-center gap-2.5">
            <Mark size={52} />
            <span className="font-display text-[48px] uppercase leading-[0.98]">
              Golf AI
              <br />
              Coach
            </span>
            <span className="dsp inline-flex h-[30px] items-center rounded-full border-[1.5px] border-white/80 px-3.5 text-[11px] tracking-[0.12em]">
              Learns your game
            </span>
          </Link>
        ) : hero.kind === "title" ? (
          <>
            <RoundButton href={hero.back} tone="hero" label="Back" className="relative">
              <ChevronLeft className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </RoundButton>
            <h1 className="dsp relative text-[44px] leading-[0.98] text-white">{hero.title}</h1>
          </>
        ) : (
          <div className="relative flex items-center justify-between gap-3">
            <span className="font-display inline-flex items-center gap-2 text-[18px] uppercase tracking-[0.04em]">
              <Mark size={36} />
              Golf AI Coach
            </span>
            <Link
              href="/login"
              className="press dsp inline-flex h-9 items-center rounded-full bg-white/[0.92] px-3.5 text-[11px] text-[#1e211b]"
            >
              Sign in
            </Link>
          </div>
        )}
      </div>
      <div className="sheet-rise relative z-10 -mt-8 min-h-[calc(100svh-368px)] rounded-t-[32px] bg-surface px-5 pb-32 pt-6 md:mx-auto md:max-w-md md:rounded-[32px] md:pb-6">
        {children}
        <p className="mt-6 text-center text-[12px] text-fg-subtle">
          <Link href="/pricing" className="underline underline-offset-2">Pricing</Link>
          {" · "}
          <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
          {" · "}
          <Link href="/terms" className="underline underline-offset-2">Terms</Link>
        </p>
      </div>
    </div>
  );
}
