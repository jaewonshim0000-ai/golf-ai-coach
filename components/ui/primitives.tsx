import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The design system. Small, owned, shadcn-style primitives built on the CSS
 * tokens in globals.css. No component library dependency - these are the pieces
 * the app actually uses.
 *
 * House style, from the redesign: Anton for headings, tracked-out bold caps for
 * labels and buttons, flat white cards with big radii on a stone page, pill
 * controls, and one olive fill reserved for the primary action on a screen.
 */

// ------------------------------------------------------------------ button

const buttonStyles = cva(
  "press dsp inline-flex items-center justify-center gap-2 rounded-full transition-[opacity,transform,background-color,color] disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-fg hover:bg-accent-strong dark:hover:opacity-90",
        secondary: "border-[1.5px] border-fg bg-transparent text-fg hover:bg-fg/5",
        ghost: "text-fg-muted hover:bg-fg/5 hover:text-fg",
        danger: "bg-bad text-white hover:opacity-90",
        subtle: "bg-accent-soft text-accent-strong hover:opacity-90",
        /* For use on top of hero artwork; `.hero-plain` re-inks them. */
        onHero: "on-hero border border-white/60 bg-white/20 text-white hover:bg-white/30",
        onHeroSolid: "on-hero-solid bg-white/90 text-[#1e211b] hover:bg-white",
      },
      size: {
        sm: "h-9 px-3.5 text-[11px]",
        md: "h-11 px-5 text-[12px]",
        lg: "h-14 w-full px-6 text-[13px]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonStyles>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: ComponentProps<typeof Link> & VariantProps<typeof buttonStyles>) {
  return <Link className={cn(buttonStyles({ variant, size }), className)} {...props} />;
}

// -------------------------------------------------------------------- card

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative rounded-[var(--radius-card)] bg-surface",
        className,
      )}
      {...props}
    />
  );
}

/** A smaller card for list rows: tighter radius. */
export function MiniCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative rounded-[var(--radius-soft)] bg-surface",
        className,
      )}
      {...props}
    />
  );
}

/** The dark card. One per screen at most - it is how the eye finds the point. */
export function InkCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card)] bg-ink text-ink-fg",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn("dsp text-[22px] leading-none", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-[13px] leading-relaxed text-fg-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("flex items-center gap-2 border-t border-border p-4", className)} {...props} />
  );
}

// ------------------------------------------------------------------- badge

const badgeStyles = cva(
  "dsp inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[10px] tracking-[0.06em]",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-fg",
        accent: "bg-accent-soft text-accent-strong",
        good: "bg-good-soft text-accent-strong",
        bad: "bg-bad-soft text-bad",
        warn: "bg-warn-soft text-warn",
        info: "bg-info-soft text-info",
        /* The AI mark: ink pill, flag-yellow text, like the coach button. */
        gold: "bg-ink text-gold",
        /* On the ink card the soft fills disappear, so these carry a hairline. */
        onInk: "border border-white/25 bg-white/10 text-ink-fg/85",
        onInkBad: "bg-[#3a3f33] text-[#e9a08e]",
        onInkGood: "bg-accent text-white",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeStyles>) {
  return <span className={cn(badgeStyles({ tone }), className)} {...props} />;
}

// ---------------------------------------------------------------- progress

export function Progress({
  value,
  tone = "accent",
  className,
  label,
}: {
  value: number;
  tone?: "accent" | "good" | "bad" | "warn";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  const bar = {
    accent: "bg-accent",
    good: "bg-good",
    bad: "bg-bad",
    warn: "bg-warn",
  }[tone];
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-full bg-track", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
    >
      <div className={cn("h-full rounded-full transition-[width]", bar)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------- stat

/** The small condensed caps label that sits above everything measurable. */
export function Eyebrow({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("dsp text-[11px] tracking-[0.1em] text-fg-muted", className)}
      {...props}
    />
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  className,
  size = "md",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "good" | "bad";
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const valueSize = { sm: "text-[19px]", md: "text-[23px]", lg: "text-[30px]" }[size];
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <Eyebrow>{label}</Eyebrow>
      <span
        className={cn(
          "font-display tabular mt-1 leading-[1.05]",
          valueSize,
          tone === "good" && "text-good",
          tone === "bad" && "text-bad",
        )}
      >
        {value}
      </span>
      {sub ? <span className="mt-0.5 text-[12px] text-fg-subtle">{sub}</span> : null}
    </div>
  );
}

// ------------------------------------------------------------------ inputs

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-2", className)}>
      <Eyebrow>{label}</Eyebrow>
      {children}
      {error ? (
        <span className="text-xs text-bad">{error}</span>
      ) : hint ? (
        <span className="text-xs text-fg-subtle">{hint}</span>
      ) : null}
    </label>
  );
}

/*
  16px on inputs, not 14px: iOS Safari zooms the whole page when a focused field
  is under 16px, which on a one-handed shot-entry screen is genuinely disruptive.
*/
const controlStyles =
  "h-[50px] w-full rounded-full border-[1.5px] border-transparent bg-surface-2 px-[18px] text-base text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(controlStyles, "tabular", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select className={cn(controlStyles, "appearance-none pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(controlStyles, "h-auto min-h-20 resize-y rounded-[22px] py-3 leading-relaxed", className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------- feedback

export function EmptyState({
  title,
  message,
  action,
  icon,
}: {
  title: string;
  message: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center gap-3 rounded-[var(--radius-card)] border-[1.5px] border-dashed border-border-strong px-6 py-10 text-center">
      {icon ? <div className="text-fg-subtle">{icon}</div> : null}
      <h3 className="dsp text-[22px] leading-none">{title}</h3>
      <p className="max-w-sm text-[14px] leading-relaxed text-fg-muted">{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-[var(--radius-soft)] bg-bad-soft p-5">
      <h3 className="dsp text-[20px] leading-none text-bad">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{message}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-2xl", className)} />;
}

/** A heading for a block inside a page. The page title itself is `PageHero`. */
export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="dsp text-[26px] leading-none">{title}</h2>
        {description ? (
          <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-fg-muted">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

// -------------------------------------------------------------- page hero

const HERO_ART = {
  course: "hero-art",
  range: "hero-art-range",
  green: "hero-art-green",
  dusk: "hero-art-dusk",
} as const;

const HERO_HEIGHT = {
  sm: "min-h-[230px]",
  md: "min-h-[280px]",
  lg: "min-h-[320px]",
} as const;

/**
 * The title block every screen opens with. Two shapes, as in the design:
 *
 * - artwork (`course`, `range`, `green`, `dusk`): the illustrated fairway,
 *   full-bleed. It cancels the layout padding with a negative margin so the
 *   art reaches the edges of the content column without the pages having to
 *   restructure.
 * - `plain`: no artwork, a big Anton title straight on the page - the list
 *   screens (practice home, drills, swing library, profile).
 */
export function PageHero({
  eyebrow,
  title,
  description,
  pills,
  action,
  topLeft,
  topRight,
  art = "course",
  image,
  size = "md",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  pills?: ReactNode;
  action?: ReactNode;
  topLeft?: ReactNode;
  topRight?: ReactNode;
  art?: keyof typeof HERO_ART | "plain";
  image?: string;
  size?: keyof typeof HERO_HEIGHT;
  className?: string;
}) {
  if (art === "plain") {
    return (
      <div className={cn("hero-plain relative flex flex-col gap-4 pb-1", className)}>
        {topLeft || topRight ? (
          <div className="flex items-center justify-between gap-3">
            <div>{topLeft}</div>
            <div>{topRight}</div>
          </div>
        ) : null}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? (
              <p className="dsp text-[12px] tracking-[0.1em] text-fg-muted">{eyebrow}</p>
            ) : null}
            <h1 className="dsp mt-1.5 text-[46px] leading-[0.98]">{title}</h1>
            {description ? (
              <p className="mt-2.5 max-w-md text-[14px] font-semibold leading-[1.45] text-fg-muted">
                {description}
              </p>
            ) : null}
            {pills ? <div className="mt-3 flex flex-wrap gap-2">{pills}</div> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        /*
          Flex column rather than absolute blocks: a long title or a row of
          pills grows the hero instead of colliding with the top row.
        */
        /*
          The content after a hero is pulled up 24px to ride over its rounded
          bottom edge. A positioned element paints above a static one whatever
          the source order, so the hero stays `relative` and every card is
          `relative` too - see Card/MiniCard/InkCard.
        */
        "relative -mx-4 -mt-5 -mb-11 flex flex-col justify-between overflow-hidden rounded-b-[32px] md:-mx-8 md:-mt-8",
        HERO_HEIGHT[size],
        HERO_ART[art],
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- hero art is decorative and unsized
        <img src={image} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      <div className="hero-scrim pointer-events-none absolute inset-0" />

      <div className="relative z-10 flex items-start justify-between gap-3 p-5 pb-8">
        <div>{topLeft}</div>
        <div>{topRight}</div>
      </div>

      <div className="relative z-10 flex items-end justify-between gap-3 p-5 pb-12 pt-0">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="dsp text-[11px] tracking-[0.1em] text-white/85">{eyebrow}</p>
          ) : null}
          <h1 className="dsp mt-1.5 text-[44px] leading-[0.98] text-white">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-[300px] text-[13px] leading-[1.45] text-white/85">
              {description}
            </p>
          ) : null}
          {pills ? <div className="mt-3 flex flex-wrap gap-2">{pills}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}

const heroPillStyles = cva(
  "dsp inline-flex h-[30px] items-center gap-1.5 rounded-full px-3 text-[11px]",
  {
    variants: {
      tone: {
        solid: "hero-pill-solid bg-white/90 text-[#1e211b]",
        outline: "hero-pill-outline border-[1.5px] border-white/85 text-white",
      },
    },
    defaultVariants: { tone: "outline" },
  },
);

export function HeroPill({
  className,
  tone,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof heroPillStyles>) {
  return <span className={cn(heroPillStyles({ tone }), className)} {...props} />;
}
