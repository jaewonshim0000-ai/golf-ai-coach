import { Skeleton } from "@/components/ui/primitives";

/**
 * The loading state is the shape of what arrives: a hero, the ink card that
 * carries the priority, then the cards under it. A generic block would be
 * quicker to write and would move the layout twice.
 */
export default function Loading() {
  return (
    <div className="space-y-5">
      <div className="hero-art relative -mx-4 -mt-5 -mb-11 min-h-[264px] overflow-hidden rounded-b-[32px] p-5 md:-mx-8 md:-mt-8">
        <div className="absolute inset-x-5 bottom-11 space-y-3">
          <Skeleton className="skeleton-ink h-3 w-24" />
          <Skeleton className="skeleton-ink h-9 w-52" />
          <div className="flex gap-2">
            <Skeleton className="skeleton-ink h-8 w-28 rounded-full" />
            <Skeleton className="skeleton-ink h-8 w-24 rounded-full" />
          </div>
        </div>
      </div>

      <div className="relative space-y-5">
        <div className="rounded-[var(--radius-card)] bg-ink p-6 shadow-[var(--shadow-ink)]">
          <Skeleton className="skeleton-ink h-3 w-20" />
          <Skeleton className="skeleton-ink mt-4 h-8 w-64" />
          <Skeleton className="skeleton-ink mt-6 h-9 w-36" />
          <Skeleton className="skeleton-ink mt-3 h-2 w-full rounded-full" />
          <Skeleton className="skeleton-ink mt-6 h-12 w-full rounded-full" />
          <Skeleton className="skeleton-ink mt-5 h-16 w-full" />
        </div>

        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-48" />
          <Skeleton className="mt-4 h-2 w-full rounded-full" />
          <Skeleton className="mt-4 h-10 w-full" />
        </div>

        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
          <div className="flex items-center gap-4">
            <Skeleton className="h-[60px] w-[60px] rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-6 w-40" />
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <Skeleton className="h-[60px] w-full rounded-[18px]" />
            <Skeleton className="h-[60px] w-full rounded-[18px]" />
            <Skeleton className="h-[60px] w-full rounded-[18px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
