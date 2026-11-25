"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

/** The player's initials in the olive circle at the top right of a tab. */
export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((word) => word[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Link
      href="/profile"
      aria-label="Profile"
      className={cn(
        "press flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-[3px] border-white bg-accent text-[14px] font-bold text-accent-fg",
        className,
      )}
    >
      {initials || "You"}
    </Link>
  );
}

type MenuLink = { href: string; label: string; icon: ReactNode; tone?: "accent" | "ink"; premium?: boolean };

const ICON = {
  plus: <path d="M12 5v14M5 12h14" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V3.5" />
      <path d="M6 4h11l-2.5 4L17 12H6" />
    </>
  ),
  bars: <path d="M6 20V10M12 20V4M18 20v-7" />,
  trend: <path d="m3 7 6 6 4-4 8 8" />,
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  pair: (
    <>
      <rect x="3" y="5" width="8" height="14" rx="2" />
      <rect x="13" y="5" width="8" height="14" rx="2" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.6-4 4.6-6 8-6s6.4 2 8 6" />
    </>
  ),
};

/* Practice and Swing are three tiles each; Play is a list, since it has four. */
const PRACTICE: MenuLink[] = [
  { href: "/practice/start", label: "Build a session", icon: ICON.plus, tone: "accent" },
  { href: "/practice/drills", label: "Drill library", icon: ICON.target },
  { href: "/practice/history", label: "Practice history", icon: ICON.clock },
];
const PLAY: MenuLink[] = [
  { href: "/rounds/new", label: "New round", icon: ICON.plus, tone: "accent" },
  { href: "/rounds?view=rounds", label: "Your rounds", icon: ICON.flag },
  { href: "/rounds/insights", label: "Strokes gained", icon: ICON.bars, premium: true },
  { href: "/rounds/handicap", label: "Handicap & classic stats", icon: ICON.trend },
];
const SWING: MenuLink[] = [
  { href: "/swing?record=1", label: "Record a swing", icon: ICON.camera, tone: "ink" },
  { href: "/swing/references", label: "Reference library", icon: ICON.pair },
  { href: "/profile", label: "Profile & settings", icon: ICON.person },
];

function Tiles({ links, close }: { links: MenuLink[]; close: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {links.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={close}
          className={cn(
            "press flex flex-col gap-[18px] rounded-[20px] p-3 text-[13px] font-bold leading-[1.2]",
            link.tone === "accent" ? "bg-accent text-white" : link.tone === "ink" ? "bg-ink text-white" : "bg-surface",
          )}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke={link.tone === "ink" ? "#E8C547" : "currentColor"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {link.icon}
          </svg>
          {link.label}
        </Link>
      ))}
    </div>
  );
}

function MenuSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="menu-section flex flex-col gap-1.5">
      <h3 id={id} className="pl-1 text-[11px] font-bold uppercase tracking-[0.12em] text-fg-subtle">
        {title}
      </h3>
      {children}
    </section>
  );
}

/**
 * The menu button from the tab headers: every screen in the app, one tap
 * away, in a sheet. A native <dialog> for the focus trap and Escape.
 */
export function MenuButton() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    else if (!open && element.open) element.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Menu"
        onClick={() => setOpen(true)}
        className="press -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-current"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      </button>
      <dialog
        ref={dialog}
        aria-label="Menu"
        onClose={close}
        onClick={(event) => {
          if (event.target === dialog.current) close();
        }}
        className="menu-sheet m-0 mt-auto max-h-[calc(100svh-96px)] w-full max-w-none overflow-y-auto rounded-t-[30px] bg-bg p-0 text-fg backdrop:bg-[rgb(20_24_15_/_0.55)] sm:m-auto sm:max-w-[420px] sm:rounded-[30px]"
      >
        <nav aria-label="Menu" className="flex flex-col gap-3.5 px-5 pb-[calc(1.875rem+env(safe-area-inset-bottom))] pt-3">
          <div className="flex flex-col items-center gap-2.5">
            <span aria-hidden className="h-[5px] w-10 rounded-full bg-border-strong" />
            <div className="flex items-center justify-between self-stretch">
              <h2 className="dsp text-[30px] leading-none">Menu</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
              </button>
            </div>
          </div>

          <MenuSection id="menu-practice" title="Practice">
            <Tiles links={PRACTICE} close={close} />
          </MenuSection>

          <MenuSection id="menu-play" title="Play">
            <ul className="overflow-hidden rounded-[22px] bg-surface">
              {PLAY.map((link) => (
                <li key={link.href} className="border-b border-surface-2 last:border-0">
                  <Link
                    href={link.href}
                    onClick={close}
                    className="flex min-h-[50px] items-center gap-3 px-4 text-[15px] font-semibold transition-colors hover:bg-surface-2/50"
                  >
                    <span
                      className={cn(
                        "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full",
                        link.tone === "accent" ? "bg-accent text-white" : "bg-surface-2",
                      )}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={link.tone === "accent" ? 2.6 : 2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        {link.icon}
                      </svg>
                    </span>
                    <span className="flex-1">{link.label}</span>
                    {link.premium ? (
                      <span className="inline-flex h-[22px] items-center rounded-full bg-ink px-2 text-[9px] font-bold tracking-[0.1em] text-gold">
                        PREMIUM
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </MenuSection>

          <MenuSection id="menu-swing" title="Swing & you">
            <Tiles links={SWING} close={close} />
          </MenuSection>
        </nav>
      </dialog>
    </>
  );
}
