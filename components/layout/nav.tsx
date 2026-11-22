"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, Target, User, Video } from "lucide-react";

import { cn } from "@/lib/utils";

/*
  Three destinations plus you: practice, play, swing. Practice is the landing
  screen because it is the one that says what to do next; stats live inside
  play, since they are a reading of the rounds rather than a place.
*/
const ITEMS = [
  { href: "/practice", label: "Practice", short: "Practice", icon: Target },
  { href: "/rounds", label: "Play", short: "Play", icon: Flag },
  { href: "/swing", label: "Swing", short: "Swing", icon: Video },
  { href: "/profile", label: "Profile", short: "You", icon: User },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ mode }: { mode: "demo" | "supabase" | "setup" }) {
  const pathname = usePathname();

  return (
    <aside className="ink-surface sticky top-0 hidden h-svh w-64 shrink-0 flex-col text-ink-fg md:flex">
      <Link href="/practice" className="flex items-center gap-2.5 px-5 py-6">
        <span className="accent-surface flex h-10 w-10 items-center justify-center rounded-2xl text-white">
          <Flag className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-display text-[20px] uppercase tracking-[0.02em]">Golf AI Coach</span>
          <span className="dsp text-[10px] text-gold">Learns your game</span>
        </span>
      </Link>

      <p className="dsp px-6 pb-2 pt-2 text-[10px] text-white/40">Menu</p>
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "font-display flex h-12 items-center gap-3 rounded-2xl px-4 text-[16px] uppercase tracking-[0.05em] transition-[background-color,color,box-shadow]",
                active
                  ? "accent-surface text-accent-fg"
                  : "text-white/65 hover:bg-white/[0.07] hover:text-white",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.9} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="dsp mx-3 mb-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[10px] text-white/70">
        {mode === "demo" ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold shadow-[0_0_8px_var(--c-gold)]" />
            Demo mode
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2fd17a] shadow-[0_0_8px_#2fd17a]" />
            Connected
          </span>
        )}
      </div>
    </aside>
  );
}

/**
 * The floating tab bar: a frosted dark pill above the content. The current tab
 * opens into a glowing green pill with its name; the others are icons. The page fades out
 * under it instead of stopping at a rule.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-32 bg-[linear-gradient(180deg,rgb(242_244_241_/_0),rgb(242_244_241_/_0.9)_58%)] md:hidden dark:bg-[linear-gradient(180deg,rgb(8_12_10_/_0),rgb(8_12_10_/_0.9)_58%)]"
      />
      <nav
        aria-label="Primary"
        className="fixed inset-x-5 bottom-[calc(1.375rem+env(safe-area-inset-bottom))] z-40 glass flex h-16 items-center justify-between rounded-full border border-white/10 bg-[#0d1f16]/90 px-2 shadow-[var(--shadow-raised)] md:hidden"
      >
        {ITEMS.map(({ href, short, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return active ? (
            /* Keyed by state so the pill replays its opening on every tab change. */
            <Link
              key={`${href}:on`}
              href={href}
              aria-current="page"
              className="nav-pill press accent-surface font-display flex h-12 items-center gap-2 rounded-full px-[18px] text-[16px] uppercase tracking-[0.05em] text-accent-fg"
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              {short}
            </Link>
          ) : (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className="press flex h-12 w-[52px] items-center justify-center rounded-full text-white/60 transition-colors hover:text-white"
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
