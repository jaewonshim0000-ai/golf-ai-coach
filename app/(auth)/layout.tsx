import Link from "next/link";

/**
 * Sign in, sign up and password reset, as the design's sign-in screen: the
 * fairway with the logo, then a white sheet with the form riding over it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-surface md:bg-bg">
      <div className="hero-art-green relative flex min-h-[370px] flex-col items-center justify-center overflow-hidden px-4 pb-14 pt-10 text-center text-white md:min-h-[340px]">
        <div className="hero-scrim absolute inset-0" aria-hidden />
        <Link href="/" className="relative flex flex-col items-center gap-3.5">
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-[3px] border-white bg-accent">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M7 3h2v18H7z" />
              <path d="M9 4h9l-2.5 3.5L18 11H9z" />
            </svg>
          </span>
          <span className="font-display text-[48px] uppercase leading-[0.98]">
            Golf AI
            <br />
            Coach
          </span>
          <span className="dsp inline-flex h-[30px] items-center rounded-full border-[1.5px] border-white/80 px-3.5 text-[11px]">
            Learns your game
          </span>
        </Link>
      </div>
      <div className="sheet-rise relative z-10 -mt-7 min-h-[calc(100svh-342px)] rounded-t-[28px] bg-surface px-5 pb-32 pt-6 md:mx-auto md:max-w-md md:rounded-[28px] md:pb-6">
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
