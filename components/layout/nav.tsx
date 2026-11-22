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
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col bg-ink text-ink-fg md:flex">
      <Link href="/practice" className="flex items-center gap-2.5 px-5 py-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-white bg-accent text-white">
          <Flag className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="font-display text-[18px] uppercase tracking-[0.02em]">Golf AI Coach</span>
          <span className="dsp text-[10px] text-gold">Learns your game</span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1.5 px-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "font-display flex h-12 items-center gap-3 rounded-full px-4 text-[15px] uppercase tracking-[0.05em] transition-colors",
                active ? "bg-accent text-accent-fg" : "text-[#c9ccbf] hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.9} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="dsp px-5 py-5 text-[10px] text-[#c9ccbf]">
        {mode === "demo" ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            Demo mode
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Connected
          </span>
        )}
      </div>
    </aside>
  );
}

/**
 * The floating tab bar: a dark pill above the content. The current tab opens
 * into an olive pill with its name; the others are icons. The page fades out
 * under it instead of stopping at a rule.
 */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-32 bg-[linear-gradient(180deg,rgb(236_233_224_/_0),rgb(236_233_224_/_0.92)_58%)] md:hidden dark:bg-[linear-gradient(180deg,rgb(18_20_15_/_0),rgb(18_20_15_/_0.92)_58%)]"
      />
      <nav
        aria-label="Primary"
        className="fixed inset-x-5 bottom-[calc(1.375rem+env(safe-area-inset-bottom))] z-40 flex h-16 items-center justify-between rounded-full bg-ink px-2 shadow-[var(--shadow-raised)] md:hidden"
      >
        {ITEMS.map(({ href, short, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return active ? (
            /* Keyed by state so the pill replays its opening on every tab change. */
            <Link
              key={`${href}:on`}
              href={href}
              aria-current="page"
              className="nav-pill press font-display flex h-12 items-center gap-2 rounded-full bg-accent px-[18px] text-[15px] uppercase tracking-[0.05em] text-accent-fg"
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              {short}
            </Link>
          ) : (
            <Link
              key={href}
              href={href}
              aria-label={label}
              className="press flex h-12 w-[52px] items-center justify-center rounded-full text-[#c9ccbf] transition-colors hover:text-white"
            >
              <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} />
            </Link>
          );
        })}
      </nav>
    </>
  );
}
