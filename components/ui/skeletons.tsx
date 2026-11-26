import type { ReactNode } from "react";

import { ActionBar, Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/*
  The pieces each screen's loading state is built from. A loading state is the
  shape of what arrives - the same hero, title, chips and cards in the same
  places - so the page fills in rather than jumping when the data lands. On
  the dark card and the hero art the sweep is the light `skeleton-ink` one.
*/

/** A 44px round button: back, close, menu, avatar. */
export function SkRound({ ink = false, className }: { ink?: boolean; className?: string }) {
  return <Skeleton className={cn("h-11 w-11 shrink-0 rounded-full", ink && "skeleton-ink", className)} />;
}

/** A pill: a chip, a top-bar button, a badge. */
export function SkPill({ ink = false, className }: { ink?: boolean; className?: string }) {
  return <Skeleton className={cn("h-10 rounded-full", ink && "skeleton-ink", className)} />;
}

/** One line of text. */
export function SkLine({ ink = false, className }: { ink?: boolean; className?: string }) {
  return <Skeleton className={cn("h-3 rounded-full", ink && "skeleton-ink", className)} />;
}

/** The top row: something on the left, something on the right. */
export function SkTop({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      {left ?? <span />}
      {right ?? <span />}
    </div>
  );
}

/** The big Anton title, one block per line. */
export function SkTitle({ lines = ["w-44", "w-56"], ink = false, className }: { lines?: string[]; ink?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {lines.map((width, index) => (
        <Skeleton key={index} className={cn("h-[40px] rounded-xl", width, ink && "skeleton-ink")} />
      ))}
    </div>
  );
}

/** A row of chips sharing the width. */
export function SkChips({ count = 3 }: { count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }, (_, index) => (
        <SkPill key={index} className="flex-1" />
      ))}
    </div>
  );
}

/** A card: white by default, the ink card with `ink`. Children are its placeholder content. */
export function SkCard({ ink = false, className, children }: { ink?: boolean; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("relative flex flex-col gap-3 rounded-[28px] p-4", ink ? "bg-ink" : "bg-surface", className)}>
      {children}
    </div>
  );
}

/** White list rows: an icon circle, a title and a detail line. */
export function SkRows({ count = 4, height = "h-[68px]" }: { count?: number; height?: string }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={cn("flex items-center gap-3 rounded-[22px] bg-surface px-3", height)}>
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <SkLine className="w-3/5" />
            <SkLine className="h-2.5 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stone stat circles with a label under each. */
export function SkCircles({ count = 3, size = "h-16 w-16", ink = false }: { count?: number; size?: string; ink?: boolean }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col items-center gap-2">
          <Skeleton className={cn("rounded-full", size, ink && "skeleton-ink")} />
          <SkLine ink={ink} className="h-2 w-12" />
        </div>
      ))}
    </div>
  );
}

/**
 * The illustrated fairway at the top of a focused screen, as `ArtHero` draws
 * it, with the round buttons and the title left as shapes.
 */
export function SkHero({
  art = "hero-art",
  height = "min-h-[270px]",
  center = false,
  right = "pill",
  className,
  children,
}: {
  art?: string;
  height?: string;
  center?: boolean;
  /** What sits at the top right: a pill (a date, a mode), a round button, or nothing. */
  right?: "pill" | "round" | false;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("relative -mx-4 -mt-5 flex flex-col overflow-hidden md:-mx-8 md:-mt-8", art, height, className)}>
      <div className="hero-scrim pointer-events-none absolute inset-0" />
      <div className="relative flex items-center justify-between px-5 pt-5 md:px-8">
        <SkRound ink />
        {right === "pill" ? <SkPill ink className="w-28" /> : right === "round" ? <SkRound ink /> : null}
      </div>
      <div className={cn("relative mt-auto flex flex-col gap-3 px-5 pb-11 pt-6 md:px-8", center && "items-center")}>
        {children ?? <SkTitle ink lines={["w-52", "w-40"]} />}
      </div>
    </div>
  );
}

/** The white sheet over the bottom of a hero. No rise: the real sheet rises when it arrives. */
export function SkSheet({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 -mx-4 -mt-7 flex min-h-[calc(100svh-212px)] flex-col gap-4 rounded-t-[28px] bg-surface px-5 pb-32 pt-6 md:-mx-8 md:px-8 md:pb-8">
      {children}
    </div>
  );
}

/** The buttons pinned to the bottom of a focused flow. */
export function SkBar({ count = 1, fade = "var(--c-bg)" }: { count?: number; fade?: string }) {
  return (
    <ActionBar style={{ "--bar-fade": fade } as React.CSSProperties}>
      {Array.from({ length: count }, (_, index) => (
        <Skeleton key={index} className="h-14 rounded-full md:w-[200px]" />
      ))}
    </ActionBar>
  );
}

/** Screen readers hear one line instead of a page of empty shapes. */
export function SkScreen({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-label={label} aria-busy className={cn("flex flex-col gap-3.5", className)}>
      {children}
    </div>
  );
}
