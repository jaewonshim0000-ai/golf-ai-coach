"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Flag, LayoutDashboard, Target, User } from "lucide-react";

import { cn } from "@/lib/utils";

/*
  Three destinations, because that is how many the app has: where you stand,
  where you play, where you work. Stats live inside rounds and the swing lives
  inside training, since neither is a thing you go to on its own.
*/
const ITEMS = [
  { href: "/dashboard", label: "Home", short: "Home", icon: LayoutDashboard },
  { href: "/rounds", label: "Rounds", short: "Rounds", icon: Flag },
  { href: "/train", label: "Train", short: "Train", icon: Target },
  { href: "/profile", label: "Profile", short: "You", icon: User },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ mode }: { mode: "demo" | "supabase" }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-5 py-6">
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
 * the bottom edge, so the page reads as a card stack on a phone.
 */
export function MobileNav() {
  const pathname = usePathname();
  const items = ITEMS.filter((i) => i.href !== "/profile");

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-3.5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-40 flex h-[58px] gap-[3px] rounded-[20px] border border-white/60 bg-[rgb(255_254_251_/_0.72)] p-[5px] shadow-[var(--shadow-raised)] backdrop-blur-[26px] backdrop-saturate-150 md:hidden dark:border-white/10 dark:bg-[rgb(20_26_21_/_0.78)]"
    >
      {items.map(({ href, short, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "dsp flex flex-1 items-center justify-center rounded-[15px] text-[10px] font-medium tracking-[0.1em] transition-colors",
              active
                ? "bg-[image:var(--grad-accent)] text-white shadow-[0_8px_18px_-8px_rgb(13_98_54_/_0.8),inset_0_1px_0_rgb(255_255_255_/_0.25)]"
                : "text-fg-subtle",
            )}
          >
            {short}
          </Link>
        );
      })}
    </nav>
  );
}
