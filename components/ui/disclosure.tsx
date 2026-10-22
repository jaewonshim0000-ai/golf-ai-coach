import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Disclosure({ title, description, count, children, className, defaultOpen = false, ...props }: {
  title: string; description?: ReactNode; count?: number; children: ReactNode; defaultOpen?: boolean;
} & Omit<ComponentProps<"details">, "title" | "open" | "children">) {
  return <details {...props} open={defaultOpen} className={cn("group/disclosure rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)]", className)}>
    <summary aria-label={title} className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {title}{count !== undefined ? <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-fg-muted">{count}</span> : null}
        </span>
        {description ? <span className="mt-1 block text-[12px] leading-relaxed text-fg-muted">{description}</span> : null}
      </span>
      <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-accent transition-transform group-open/disclosure:rotate-180" />
    </summary>
    <div className="px-4 pb-4">{children}</div>
  </details>;
}
