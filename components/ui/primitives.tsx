import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The design system. Small, owned, shadcn-style primitives built on the CSS
 * tokens in globals.css. No component library dependency - these are the pieces
 * the app actually uses.
 *
 * House style, from the mobile design: condensed uppercase display type for
 * anything structural (headings, eyebrows, buttons), a warm near-white card
 * with a long soft shadow, and one green gradient reserved for the primary
 * action on a screen.
 */

// ------------------------------------------------------------------ button

const buttonStyles = cva(
  "dsp inline-flex items-center justify-center gap-2 font-medium transition-[opacity,transform,background-color] disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap active:scale-[0.99]",
  {
    variants: {
      variant: {
        primary:
          "rounded-[var(--radius-control)] bg-[image:var(--grad-accent)] text-white shadow-[var(--shadow-accent)] hover:opacity-95",
        secondary:
          "rounded-full border border-border-strong bg-surface text-fg hover:bg-surface-2",
        ghost: "rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg",
        danger: "rounded-[var(--radius-control)] bg-bad text-white hover:opacity-90",
        subtle: "rounded-full bg-accent-soft text-accent hover:opacity-90",
        /* For use on top of hero artwork. */
        onHero:
          "rounded-full border border-white/45 text-white backdrop-blur-[2px] hover:bg-white/10",
        onHeroSolid:
          "rounded-full bg-[rgb(255_254_247_/_0.94)] text-[#101510] shadow-[0_8px_20px_-10px_rgb(0_0_0_/_0.6)] hover:bg-white",
      },
      size: {
        sm: "h-8 px-3.5 text-[10px] tracking-[0.17em]",
        md: "h-11 px-5 text-[11px] tracking-[0.18em]",
        lg: "h-[52px] w-full px-6 text-[12px] tracking-[0.2em]",
        icon: "h-9 w-9 rounded-full",
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
        "rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    />
  );
}

/** A smaller card for list rows: tighter radius, shallower shadow. */
export function MiniCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-soft)] border border-border bg-surface shadow-[var(--shadow-soft)]",
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
        "overflow-hidden rounded-[var(--radius-card)] bg-ink text-ink-fg shadow-[var(--shadow-ink)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: ComponentProps<"h3">) {
  return (
    <h3
      className={cn("dsp text-[15px] font-semibold leading-tight tracking-[0.02em]", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-xs leading-relaxed text-fg-muted", className)} {...props} />;
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
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[10px] font-medium leading-[19px]",
  {
    variants: {
      tone: {
        neutral: "border border-border-strong bg-track text-fg-muted",
        accent: "bg-accent-soft text-accent",
        good: "bg-good-soft text-good",
        bad: "bg-bad-soft text-bad",
        warn: "bg-warn-soft text-warn",
        info: "bg-info-soft text-info",
        gold: "border border-gold/40 bg-gold/12 text-gold",
        /* On the ink card the soft fills disappear, so these carry a hairline. */
        onInk: "border border-white/20 bg-white/8 text-ink-fg/80",
        onInkBad: "border border-bad/35 bg-bad/15 text-bad",
        onInkGood: "border border-good/35 bg-good/15 text-good",
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
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-track", className)}
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
      className={cn("dsp text-[9px] font-medium tracking-[0.17em] text-fg-subtle", className)}
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
  const valueSize = { sm: "text-[17px]", md: "text-[21px]", lg: "text-[26px]" }[size];
  return (
    <div className={cn("flex min-w-0 flex-col", className)}>
      <Eyebrow className="tracking-[0.15em]">{label}</Eyebrow>
      <span
        className={cn(
          "tabular mt-0.5 font-semibold leading-[1.05] tracking-[-0.02em]",
          valueSize,
          tone === "good" && "text-good",
          tone === "bad" && "text-bad",
        )}
      >
        {value}
      </span>
      {sub ? <span className="mt-0.5 text-[10.5px] text-fg-subtle">{sub}</span> : null}
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
    <label className={cn("flex flex-col gap-1.5", className)}>
      <Eyebrow className="tracking-[0.15em]">{label}</Eyebrow>
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
  "h-11 w-full rounded-xl border border-border-strong bg-[color-mix(in_oklab,var(--c-surface)_70%,var(--c-bg))] px-3.5 text-base text-fg shadow-[inset_0_1px_2px_rgb(16_21_17_/_0.05)] placeholder:text-fg-subtle focus:border-accent focus:outline-none";

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
      className={cn(controlStyles, "h-auto min-h-20 resize-y py-2.5 leading-relaxed", className)}
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
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-soft)] border border-dashed border-border-strong bg-surface-2/60 px-6 py-10 text-center">
      {icon ? <div className="text-fg-subtle">{icon}</div> : null}
      <h3 className="dsp text-[15px] font-semibold tracking-[0.02em]">{title}</h3>
      <p className="max-w-sm text-[13px] leading-relaxed text-fg-muted">{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-[var(--radius-soft)] border border-bad/30 bg-bad-soft p-5">
      <h3 className="dsp text-[15px] font-semibold text-bad">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{message}</p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} />;
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
        <div className="mb-2.5 h-px w-full bg-[linear-gradient(to_right,color-mix(in_oklab,var(--c-gold)_60%,transparent),var(--c-border))]" />
        <h2 className="dsp text-[26px] font-semibold leading-[0.96] tracking-[-0.015em]">{title}</h2>
        {description ? (
          <p className="mt-1.5 max-w-prose text-[12px] leading-relaxed text-fg-muted">
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
  sm: "min-h-[190px]",
  md: "min-h-[230px]",
  lg: "min-h-[290px]",
} as const;

/**
 * The full-bleed title block every screen opens with. It cancels the layout
 * padding with a negative margin so the artwork reaches the edges of the
 * content column without the pages having to restructure.
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
  art?: keyof typeof HERO_ART;
  image?: string;
  size?: keyof typeof HERO_HEIGHT;
  className?: string;
}) {
  return (
    <div
      className={cn(
        /*
          Flex column rather than absolute blocks: a long title or a row of
          pills grows the hero instead of colliding with the top row.
        */
        "relative -mx-4 -mt-5 flex flex-col justify-between overflow-hidden md:-mx-8 md:-mt-8",
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

      <div className="relative z-10 flex items-end justify-between gap-3 p-5 pt-0">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="dsp text-[11px] font-medium tracking-[0.2em] text-white/80">{eyebrow}</p>
          ) : null}
          <h1 className="dsp mt-1 text-[38px] font-semibold leading-[0.92] tracking-[-0.02em] text-white">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-[260px] text-[11.5px] leading-[1.45] text-white/80">
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
  "dsp inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[10px] font-medium tracking-[0.17em]",
  {
    variants: {
      tone: {
        solid: "bg-[rgb(255_254_247_/_0.94)] text-[#101510] shadow-[0_8px_20px_-10px_rgb(0_0_0_/_0.6)]",
        outline: "border border-white/50 text-white",
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
