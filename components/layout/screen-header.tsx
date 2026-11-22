"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

const MENU = [
  {
    group: "Practice",
    links: [
      { href: "/practice/start", label: "Build a session" },
      { href: "/practice/drills", label: "Drill library" },
      { href: "/practice/history", label: "Practice history" },
    ],
  },
  {
    group: "Play",
    links: [
      { href: "/rounds/new", label: "New round" },
      { href: "/rounds?view=rounds", label: "Your rounds" },
      { href: "/rounds/insights", label: "Strokes gained" },
      { href: "/rounds/handicap", label: "Handicap & classic stats" },
    ],
  },
  {
    group: "Swing",
    links: [
      { href: "/swing?record=1", label: "Record a swing" },
      { href: "/swing/references", label: "Reference library" },
    ],
  },
  { group: "You", links: [{ href: "/profile", label: "Profile & settings" }] },
];

/**
 * The menu button from the tab headers: every screen in the app, one tap
 * away, in a sheet. A native <dialog> for the focus trap and Escape.
 */
export function MenuButton() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

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
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialog.current) setOpen(false);
        }}
        className="m-0 mt-auto max-h-[86svh] w-full max-w-none overflow-y-auto rounded-t-[28px] bg-bg p-0 text-fg backdrop:bg-[rgb(20_24_15_/_0.55)] sm:m-auto sm:max-w-[420px] sm:rounded-[28px]"
      >
        <div className="flex flex-col gap-4 px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5">
          <div className="flex items-center justify-between">
            <h2 className="dsp text-[26px] leading-none">Menu</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="press flex h-11 w-11 items-center justify-center rounded-full bg-surface"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          </div>
          {MENU.map((section) => (
            <nav key={section.group} aria-label={section.group} className="flex flex-col gap-2">
              <p className="dsp text-[11px] tracking-[0.1em] text-fg-muted">{section.group}</p>
              <ul className="overflow-hidden rounded-[22px] bg-surface">
                {section.links.map((link) => (
                  <li key={link.href} className="border-b border-border last:border-0">
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-[52px] items-center justify-between px-4 text-[15px] font-semibold"
                    >
                      {link.label}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="text-fg-subtle">
                        <path d="m9 6 6 6-6 6" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </dialog>
    </>
  );
}
