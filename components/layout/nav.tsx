"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, Target, User, Video } from "lucide-react";

import { cn } from "@/lib/utils";

/*
  Three destinations plus you: swing, practice, play. Practice is the landing
  screen because it is the one that says what to do next; stats live inside
  play, since they are a reading of the rounds rather than a place.
*/
const ITEMS = [
  { href: "/swing", label: "Swing", short: "Swing", icon: Video },
  { href: "/practice", label: "Practice", short: "Practice", icon: Target },
  { href: "/rounds", label: "Play", short: "Play", icon: Flag },
  { href: "/profile", label: "Profile", short: "You", icon: User },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ mode }: { mode: "demo" | "supabase" | "setup" }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <Link href="/practice" className="flex items-center gap-2.5 px-5 py-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--grad-accent)] text-white shadow-[var(--shadow-accent)]">
          <Flag className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <span className="flex flex-col leading-tight">
          <span className="dsp text-[15px] font-semibold tracking-[0.02em]">Golf AI Coach</span>
          <span className="dsp text-[9px] tracking-[0.17em] text-fg-subtle">Learns your game</span>
        </span>
      </Link>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "dsp flex items-center gap-3 rounded-xl px-3 py-2.5 text-[12px] tracking-[0.1em] transition-colors",
                active
                  ? "bg-[image:var(--grad-accent)] font-medium text-white shadow-[var(--shadow-accent)]"
                  : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="dsp px-5 py-5 text-[9px] tracking-[0.17em] text-fg-subtle">
        {mode === "demo" ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" />
            Demo mode
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-good" />
            Connected
          </span>
        )}
      </div>
    </aside>
  );
}

/**
 * The floating glass tab bar. It sits above the content rather than docking to
 * the bottom edge, and the page fades out under it instead of stopping at a
 * rule - the content reads as passing beneath the glass.
 */
export function MobileNav() {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => i.href !== "/profile");

  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-32 bg-[linear-gradient(180deg,rgb(241_239_232_/_0),rgb(241_239_232_/_0.92)_58%)] md:hidden dark:bg-[linear-gradient(180deg,rgb(11_15_12_/_0),rgb(11_15_12_/_0.92)_58%)]"
      />
      <nav
        aria-label="Primary"
        className="glass fixed inset-x-4 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex gap-1 rounded-[24px] border border-white/55 bg-[rgb(252_251_246_/_0.72)] p-1.5 shadow-[0_1px_0_rgb(255_255_255_/_0.7)_inset,0_12px_32px_-12px_rgb(58_52_38_/_0.42)] md:hidden dark:border-white/10 dark:bg-[rgb(20_26_21_/_0.78)]"
      >
        {items.map(({ href, short, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "press flex flex-1 flex-col items-center gap-[5px] rounded-[18px] py-2.5 text-[11px] font-semibold tracking-[0.01em] transition-colors",
                active ? "bg-accent-soft text-accent" : "text-fg-muted",
              )}
            >
              <Icon className="h-[19px] w-[19px]" strokeWidth={1.9} />
              {short}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
